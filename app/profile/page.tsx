"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Header from "@/components/Header";
import LoadingScreen from "@/components/LoadingScreen";
import { Card, CardContent, CardHeader, CardTitle, Button, Input } from "@/components/ui";

export default function ProfilePage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const [isUploading, setIsUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [name, setName] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    }

    if (session?.user) {
      setName(session.user.name || "");
      setPreviewImage(session.user.image || null);
    }
  }, [status, session, router]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert("Image size must be less than 2MB");
      return;
    }

    if (!file.type.match(/^image\/(png|jpg|jpeg|gif)$/)) {
      alert("Only PNG, JPG, and GIF images are allowed");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setIsUploading(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          image: previewImage,
        }),
      });

      if (response.ok) {
        await update();
        alert("Profile updated successfully!");
      } else {
        const error = await response.json();
        alert(error.error || "Failed to update profile");
      }
    } catch (error) {
      console.error("Error updating profile:", error);
      alert("Failed to update profile");
    } finally {
      setIsUploading(false);
    }
  };

  if (status === "loading") {
    return <LoadingScreen />;
  }

  if (!session) {
    return null;
  }

  const userInitials = (name || session.user.email || "")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .substring(0, 2);

  return (
    <main className="min-h-screen bg-background">
      <Header activePage="profile" />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Back Button */}
        <button
          onClick={() => router.back()}
          className="text-muted-foreground hover:text-foreground transition mb-6 flex items-center text-sm"
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back
        </button>

        {/* Page Title */}
        <div className="mb-6 animate-fade-in">
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Profile Settings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage your account settings and profile picture</p>
        </div>

        {/* Profile Form */}
        <Card className="animate-slide-up">
          <CardContent className="py-5 space-y-5">
            {/* Profile Picture Section */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">Profile Picture</label>
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-md flex items-center justify-center overflow-hidden shrink-0 ${
                  previewImage
                    ? 'bg-secondary'
                    : 'bg-primary/10 border border-primary/20'
                }`}>
                  {previewImage ? (
                    <img src={previewImage} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-primary font-semibold text-lg">{userInitials}</span>
                  )}
                </div>

                <div>
                  <label className="cursor-pointer btn btn-secondary btn-sm inline-block">
                    Choose Image
                    <input type="file" accept="image/png,image/jpeg,image/jpg,image/gif" onChange={handleImageChange} className="hidden" />
                  </label>
                  <p className="text-xs text-muted-foreground mt-1.5">PNG, JPG or GIF (max 2MB)</p>
                </div>
              </div>
            </div>

            {/* Name Field */}
            <Input
              label="Name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
            />

            {/* Email (Read-only) */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
              <input
                type="email"
                value={session.user.email || ""}
                disabled
                className="w-full px-3 py-2.5 rounded-md bg-secondary/50 border border-border/60 text-muted-foreground text-sm cursor-not-allowed"
              />
              <p className="text-xs text-muted-foreground mt-1.5">Email cannot be changed</p>
            </div>

            {/* Save Button */}
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSave}
                disabled={isUploading}
              >
                {isUploading ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
