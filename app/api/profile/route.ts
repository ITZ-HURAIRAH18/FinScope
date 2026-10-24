import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadToCloudinary, deleteFromCloudinary } from "@/lib/cloudinary";

// GET /api/profile - Get user profile
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: {
        email: session.user.email,
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error("Error fetching profile:", error);
    return NextResponse.json(
      { error: "Failed to fetch profile" },
      { status: 500 }
    );
  }
}

// PUT /api/profile - Update user profile
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, image } = body;

    // Name validation (trimmed, bounded) — previously passed through raw.
    let nameUpdate;
    if (name !== undefined) {
      if (typeof name !== "string") {
        return NextResponse.json({ error: "Invalid name" }, { status: 400 });
      }
      const trimmed = name.trim();
      if (trimmed.length > 100) {
        return NextResponse.json(
          { error: "Name must be 100 characters or fewer" },
          { status: 400 }
        );
      }
      nameUpdate = trimmed;
    }

    // Resolve the image update (audit S1):
    // The page always echoes back the CURRENT avatar URL for users who never
    // picked a new file. The old code validated that URL against a
    // base64-only regex → 400 for EVERY name-only save by users with a
    // Cloudinary/Google avatar. Now:
    //   - an https URL equal to the stored one is a no-op (name-only edit)
    //   - a DIFFERENT https URL is rejected (avatars may only come from
    //     uploads, not from arbitrary URLs)
    //   - a data: URL goes through format + size validation and is uploaded
    const isDataUrl = typeof image === "string" && image.startsWith("data:");
    const isHttpsUrl = typeof image === "string" && /^https:\/\//.test(image);

    let newImageUrl: string | undefined;
    let oldImageUrl: string | undefined;

    if (image !== undefined && image !== null) {
      if (isDataUrl) {
        const base64Regex = /^data:image\/(png|jpg|jpeg|gif);base64,/;
        if (!base64Regex.test(image)) {
          return NextResponse.json(
            { error: "Invalid image format" },
            { status: 400 }
          );
        }
        // Server-side cap mirroring the client's 2 MB check (base64 adds
        // ~37%). Reject before touching Cloudinary or the DB.
        if (image.length > 3 * 1024 * 1024) {
          return NextResponse.json(
            { error: "Image must be smaller than 2MB" },
            { status: 400 }
          );
        }

        const currentUser = await prisma.user.findUnique({
          where: { email: session.user.email },
          select: { image: true },
        });

        try {
          // Upload the NEW image first; only after it succeeds do we delete
          // the old asset (S1: the old code deleted first, so a failed
          // upload destroyed the user's existing avatar).
          newImageUrl = await uploadToCloudinary(image);
          oldImageUrl = currentUser?.image ?? undefined;
        } catch (error) {
          console.error("Cloudinary upload error:", error);
          return NextResponse.json(
            { error: "Failed to upload image" },
            { status: 500 }
          );
        }
      } else if (isHttpsUrl) {
        const currentUser = await prisma.user.findUnique({
          where: { email: session.user.email },
          select: { image: true },
        });
        if (image !== (currentUser?.image ?? null)) {
          return NextResponse.json(
            { error: "Image must be uploaded from this page" },
            { status: 400 }
          );
        }
        // Same URL → no image change needed.
      } else if (image === null) {
        // Explicit removal is not supported yet; ignore rather than fail.
      } else {
        return NextResponse.json(
          { error: "Invalid image format" },
          { status: 400 }
        );
      }
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: {
        email: session.user.email,
      },
      data: {
        ...(nameUpdate !== undefined && { name: nameUpdate }),
        ...(newImageUrl !== undefined && { image: newImageUrl }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
      },
    });

    // Best-effort cleanup of the replaced avatar — AFTER the DB write
    // succeeded, so a Cloudinary hiccup can never cost the user their avatar.
    if (newImageUrl && oldImageUrl && oldImageUrl.includes("cloudinary.com")) {
      try {
        await deleteFromCloudinary(oldImageUrl);
      } catch (cleanupError) {
        console.error("Old avatar cleanup failed (non-fatal):", cleanupError);
      }
    }

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error("Error updating profile:", error);
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
  }
}

