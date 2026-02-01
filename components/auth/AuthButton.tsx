"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import ProfileDropdown from "./ProfileDropdown";

export default function AuthButton() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <div className="w-20 h-10 bg-white/5 rounded-lg animate-pulse" />;
  }

  if (session) {
    return <ProfileDropdown />;
  }

  return (
    <Link
      href="/auth/login"
      className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 transition text-white font-medium"
    >
      Login
    </Link>
  );
}
