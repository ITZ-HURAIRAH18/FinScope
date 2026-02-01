"use client";

import Image from "next/image";
import { NewsArticle } from "@/types/news";

interface NewsCardProps {
  article: NewsArticle;
}

export default function NewsCard({ article }: NewsCardProps) {
  // Format timestamp
  const formatTime = (timestamp: number) => {
    const now = Date.now() / 1000;
    const diff = now - timestamp;

    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
    
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  // Truncate summary
  const truncateSummary = (text: string, maxLength: number = 150) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength).trim() + "...";
  };

  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="glass-card rounded-2xl overflow-hidden hover:shadow-xl hover:shadow-blue-500/20 transition-all duration-300 transform hover:-translate-y-1 block"
    >
      {/* Image */}
      <div className="relative w-full h-48 bg-gray-800">
        {article.image && article.image !== '/placeholder-news.jpg' ? (
          <Image
            src={article.image}
            alt={article.headline}
            fill
            className="object-cover"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-red-900/20 to-pink-900/20">
            <span className="text-6xl">📰</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-6 space-y-3">
        {/* Source and Time */}
        <div className="flex items-center justify-between text-sm">
          <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full font-medium">
            {article.source}
          </span>
          <span className="text-gray-400">{formatTime(article.datetime)}</span>
        </div>

        {/* Headline */}
        <h3 className="text-xl font-bold text-white line-clamp-2 hover:text-blue-400 transition">
          {article.headline}
        </h3>

        {/* Summary */}
        {article.summary && (
          <p className="text-gray-400 text-sm line-clamp-3">
            {truncateSummary(article.summary)}
          </p>
        )}

        {/* Read More Link */}
        <div className="pt-2">
          <span className="text-blue-400 text-sm font-semibold hover:text-blue-300 transition inline-flex items-center">
            Read more
            <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </span>
        </div>
      </div>
    </a>
  );
}
