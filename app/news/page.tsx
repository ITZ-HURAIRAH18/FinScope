"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import NewsCard from "@/components/news/NewsCard";
import { NewsArticle } from "@/types/news";

type CategoryType = "general" | "crypto" | "stock";

function NewsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<CategoryType>(
    (searchParams.get("category") as CategoryType) || "general"
  );

  useEffect(() => {
    const category = (searchParams.get("category") as CategoryType) || "general";
    setActiveCategory(category);
    fetchNews(category);
  }, [searchParams]);

  const fetchNews = async (category: CategoryType) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/news?category=${category}&limit=50`);
      
      if (!response.ok) {
        throw new Error("Failed to fetch news");
      }

      const data = await response.json();
      setArticles(data.articles || []);
    } catch (err) {
      console.error("Error fetching news:", err);
      setError("Failed to load news. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  const categories = [
    { id: "general" as CategoryType, label: "All News", icon: "📰" },
    { id: "crypto" as CategoryType, label: "Crypto", icon: "₿" },
    { id: "stock" as CategoryType, label: "Stock", icon: "📈" },
  ];

  const handleCategoryChange = (category: CategoryType) => {
    router.push(`/news?category=${category}`);
  };

  return (
    <main className="min-h-screen bg-black">
      {/* Header */}
      <Header activePage="news" />

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
        <div className="text-center space-y-6">
          <h1 className="text-5xl md:text-6xl font-bold text-white">
            Latest Market News
          </h1>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Stay updated with the latest cryptocurrency, stock, and financial market news
          </p>
        </div>
      </section>

      {/* Category Filter */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <div className="flex flex-wrap justify-center gap-4">
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => handleCategoryChange(category.id)}
              className={`px-6 py-3 rounded-full font-semibold transition-all duration-300 ${
                activeCategory === category.id
                  ? "bg-gradient-to-r from-red-600 via-red-500 to-pink-500 text-white shadow-lg shadow-red-500/50"
                  : "glass-card text-gray-300 hover:text-white hover:shadow-lg"
              }`}
            >
              <span className="mr-2">{category.icon}</span>
              {category.label}
            </button>
          ))}
        </div>
      </section>

      {/* News Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        {loading ? (
          // Loading Skeleton
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, index) => (
              <div
                key={index}
                className="glass-card rounded-2xl overflow-hidden animate-pulse"
              >
                <div className="w-full h-48 bg-gray-700"></div>
                <div className="p-6 space-y-3">
                  <div className="h-4 bg-gray-700 rounded w-1/3"></div>
                  <div className="h-6 bg-gray-700 rounded w-full"></div>
                  <div className="h-6 bg-gray-700 rounded w-5/6"></div>
                  <div className="h-4 bg-gray-700 rounded w-full"></div>
                  <div className="h-4 bg-gray-700 rounded w-4/5"></div>
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          // Error State
          <div className="text-center py-20">
            <div className="glass-card inline-block p-8 rounded-2xl">
              <span className="text-6xl mb-4 block">⚠️</span>
              <h3 className="text-2xl font-bold text-white mb-2">
                Oops! Something went wrong
              </h3>
              <p className="text-gray-400 mb-6">{error}</p>
              <button
                onClick={() => fetchNews(activeCategory)}
                className="px-6 py-3 bg-gradient-to-r from-red-600 via-red-500 to-pink-500 rounded-lg text-white font-semibold hover:shadow-lg hover:shadow-red-500/50 transition"
              >
                Try Again
              </button>
            </div>
          </div>
        ) : articles.length === 0 ? (
          // Empty State
          <div className="text-center py-20">
            <div className="glass-card inline-block p-8 rounded-2xl">
              <span className="text-6xl mb-4 block">📭</span>
              <h3 className="text-2xl font-bold text-white mb-2">
                No news available
              </h3>
              <p className="text-gray-400">
                Check back later for the latest market updates
              </p>
            </div>
          </div>
        ) : (
          // News Grid
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {articles.map((article) => (
              <NewsCard key={article.id} article={article} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export default function NewsPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-black">
        <Header activePage="news" />
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          <div className="text-center space-y-6">
            <h1 className="text-5xl md:text-6xl font-bold text-white">
              Latest Market News
            </h1>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              Stay updated with the latest cryptocurrency, stock, and financial market news
            </p>
          </div>
        </section>
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, index) => (
              <div
                key={index}
                className="glass-card rounded-2xl overflow-hidden animate-pulse"
              >
                <div className="w-full h-48 bg-gray-700"></div>
                <div className="p-6 space-y-3">
                  <div className="h-4 bg-gray-700 rounded w-1/3"></div>
                  <div className="h-6 bg-gray-700 rounded w-full"></div>
                  <div className="h-6 bg-gray-700 rounded w-5/6"></div>
                  <div className="h-4 bg-gray-700 rounded w-full"></div>
                  <div className="h-4 bg-gray-700 rounded w-4/5"></div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    }>
      <NewsContent />
    </Suspense>
  );
}
