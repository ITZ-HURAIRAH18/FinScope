"use client";

import { useState, useRef, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";

export default function ProfileDropdown() {
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  if (!session?.user) return null;

  const userEmail = session.user.email || "";
  const userName = session.user.name || userEmail.split("@")[0];
  const userImage = session.user.image;
  
  // Get initials for avatar fallback
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .substring(0, 2);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Profile Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-white/10 transition"
      >
        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-gradient-to-r from-red-600 via-red-500 to-pink-500 flex items-center justify-center text-white font-semibold overflow-hidden">
          {userImage ? (
            <img 
              src={userImage} 
              alt={userName}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-sm">{initials}</span>
          )}
        </div>
        
        {/* Chevron */}
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 glass-card rounded-lg shadow-xl border border-white/10 overflow-hidden z-50 animate-fadeIn">
          {/* User Info */}
          <div className="p-4 border-b border-white/10">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-r from-red-600 via-red-500 to-pink-500 flex items-center justify-center text-white font-bold overflow-hidden">
                {userImage ? (
                  <img 
                    src={userImage} 
                    alt={userName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span>{initials}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white font-semibold truncate">{userName}</div>
                <div className="text-gray-400 text-sm truncate">{userEmail}</div>
              </div>
            </div>
          </div>

          {/* Menu Items */}
          <div className="py-2">
            <Link
              href="/profile"
              onClick={() => setIsOpen(false)}
              className="flex items-center space-x-3 px-4 py-3 hover:bg-white/10 transition text-gray-300 hover:text-white"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span>Profile Settings</span>
            </Link>

            <button
              onClick={() => {
                setIsOpen(false);
                signOut({ callbackUrl: "/" });
              }}
              className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-red-500/10 transition text-red-400 hover:text-red-300"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Logout</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
