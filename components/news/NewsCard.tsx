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
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;

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
      className="card card-hover rounded-lg overflow-hidden block animate-fade-in"
    >
      {/* Image */}
      <div className="relative w-full h-44 bg-secondary">
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
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/5 to-rose-500/5">
            <svg className="w-10 h-10 text-muted-foreground/40" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M7.875 2.25h8.25c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25H7.875a2.25 2.25 0 01-2.25-2.25V3.375c0-.621.504-1.125 1.125-1.125z" />
            </svg>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Source and Time */}
        <div className="flex items-center justify-between text-xs">
          <span className="badge badge-primary">
            {article.source}
          </span>
          <span className="text-muted-foreground">{formatTime(article.datetime)}</span>
        </div>

        {/* Headline */}
        <h3 className="text-sm font-semibold text-foreground line-clamp-2 hover:text-primary transition-colors">
          {article.headline}
        </h3>

        {/* Summary */}
        {article.summary && (
          <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
            {truncateSummary(article.summary)}
          </p>
        )}

        {/* Read More */}
        <div className="pt-1">
          <span className="text-xs text-primary font-medium hover:text-primary-hover transition-colors inline-flex items-center gap-1">
            Read more
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </span>
        </div>
      </div>
    </a>
  );
}
