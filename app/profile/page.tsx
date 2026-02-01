"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Header from "@/components/Header";
import LoadingScreen from "@/components/LoadingScreen";

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

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert("Image size must be less than 2MB");
      return;
    }

    // Validate file type
    if (!file.type.match(/^image\/(png|jpg|jpeg|gif)$/)) {
      alert("Only PNG, JPG, and GIF images are allowed");
      return;
    }

    // Convert to base64 and show preview
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
        // Trigger session update - NextAuth will fetch fresh data from DB
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
    <main className="min-h-screen bg-black">
      {/* Header */}
      <Header activePage="profile" />

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Back Button */}
        <button
          onClick={() => router.back()}
          className="text-gray-400 hover:text-white transition mb-6 flex items-center"
        >
          ← Back
        </button>

        {/* Page Title */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Profile Settings</h1>
          <p className="text-gray-400">Manage your account settings and profile picture</p>
        </div>

        {/* Profile Form */}
        <div className="glass-card p-8 rounded-2xl space-y-8">
          {/* Profile Picture Section */}
          <div>
            <label className="block text-white font-semibold mb-4">Profile Picture</label>
            <div className="flex items-center space-x-6">
              {/* Avatar Display */}
              <div className={`w-24 h-24 rounded-full flex items-center justify-center overflow-hidden ${
                previewImage 
                  ? 'bg-gray-800' 
                  : 'bg-gradient-to-r from-red-600 via-red-500 to-pink-500 text-white font-bold text-2xl'
              }`}>
                {previewImage ? (
                  <img 
                    src={previewImage} 
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-white font-bold text-2xl">{userInitials}</span>
                )}
              </div>

              {/* Upload Button */}
              <div>
                <label className="cursor-pointer px-4 py-2 bg-red-500 hover:bg-red-600 rounded-lg text-white font-medium transition inline-block">
                  Choose Image
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/gif"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                </label>
                <p className="text-gray-400 text-sm mt-2">PNG, JPG or GIF (max 2MB)</p>
              </div>
            </div>
          </div>

          {/* Name Field */}
          <div>
            <label className="block text-white font-semibold mb-2">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="Enter your name"
            />
          </div>

          {/* Email (Read-only) */}
          <div>
            <label className="block text-white font-semibold mb-2">Email</label>
            <input
              type="email"
              value={session.user.email || ""}
              disabled
              className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-gray-400 cursor-not-allowed"
            />
            <p className="text-gray-500 text-sm mt-1">Email cannot be changed</p>
          </div>

          {/* Save Button */}
          <div className="flex justify-end space-x-4">
            <button
              onClick={() => router.back()}
              className="px-6 py-3 rounded-lg bg-white/10 text-white hover:bg-white/20 transition font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isUploading}
              className="px-6 py-3 rounded-lg bg-gradient-to-r from-red-600 via-red-500 to-pink-500 text-white hover:shadow-lg transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUploading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
