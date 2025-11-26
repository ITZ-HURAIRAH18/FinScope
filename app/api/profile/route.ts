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

    let imageUrl = undefined;

    // Handle image upload to Cloudinary
    if (image) {
      // Validate image format
      const base64Regex = /^data:image\/(png|jpg|jpeg|gif);base64,/;
      if (!base64Regex.test(image)) {
        return NextResponse.json(
          { error: "Invalid image format" },
          { status: 400 }
        );
      }

      try {
        // Get current user to check for existing image
        const currentUser = await prisma.user.findUnique({
          where: { email: session.user.email },
          select: { image: true },
        });

        // Delete old image from Cloudinary if exists
        if (currentUser?.image && currentUser.image.includes('cloudinary.com')) {
          await deleteFromCloudinary(currentUser.image);
        }

        // Upload new image to Cloudinary
        imageUrl = await uploadToCloudinary(image);
      } catch (error) {
        console.error("Cloudinary upload error:", error);
        return NextResponse.json(
          { error: "Failed to upload image" },
          { status: 500 }
        );
      }
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: {
        email: session.user.email,
      },
      data: {
        ...(name !== undefined && { name }),
        ...(imageUrl !== undefined && { image: imageUrl }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
      },
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error("Error updating profile:", error);
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
  }
}

