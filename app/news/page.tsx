"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import NewsCard from "@/components/news/NewsCard";
import { NewsArticle } from "@/types/news";
import { Button, Card, CardContent } from "@/components/ui";

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
    { id: "general" as CategoryType, label: "All News" },
    { id: "crypto" as CategoryType, label: "Crypto" },
    { id: "stock" as CategoryType, label: "Stock" },
  ];

  const handleCategoryChange = (category: CategoryType) => {
    router.push(`/news?category=${category}`);
  };

  return (
    <main className="min-h-screen bg-background">
      <Header activePage="news" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Page Header */}
        <div className="mb-6 animate-fade-in">
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">
            Latest Market News
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Stay updated with the latest cryptocurrency, stock, and financial market news
          </p>
        </div>

        {/* Category Filter */}
        <Card className="mb-6 animate-slide-up">
          <CardContent className="py-3">
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => handleCategoryChange(category.id)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-150 ${
                    activeCategory === category.id
                      ? "bg-primary text-primary-foreground shadow-subtle"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  }`}
                >
                  {category.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* News Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, index) => (
              <Card key={index} className="rounded-lg overflow-hidden animate-pulse">
                <div className="w-full h-44 bg-secondary"></div>
                <div className="p-4 space-y-3">
                  <div className="h-3 bg-secondary rounded w-1/3"></div>
                  <div className="h-4 bg-secondary rounded w-full"></div>
                  <div className="h-4 bg-secondary rounded w-5/6"></div>
                  <div className="h-3 bg-secondary rounded w-full"></div>
                </div>
              </Card>
            ))}
          </div>
        ) : error ? (
          <Card className="rounded-lg">
            <CardContent className="py-16 text-center">
              <svg className="w-12 h-12 mx-auto mb-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <h3 className="text-sm font-medium text-foreground mb-1">Something went wrong</h3>
              <p className="text-xs text-muted-foreground mb-5">{error}</p>
              <Button variant="primary" size="sm" onClick={() => fetchNews(activeCategory)}>
                Try Again
              </Button>
            </CardContent>
          </Card>
        ) : articles.length === 0 ? (
          <Card className="rounded-lg">
            <CardContent className="py-16 text-center">
              <svg className="w-12 h-12 mx-auto mb-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <h3 className="text-sm font-medium text-foreground mb-1">No news available</h3>
              <p className="text-xs text-muted-foreground">Check back later for the latest market updates</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {articles.map((article, index) => (
              <div key={article.id} className={`animate-fade-in`} style={{ animationDelay: `${Math.min(index * 50, 300)}ms` }}>
                <NewsCard article={article} />
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

export default function NewsPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-background">
        <Header activePage="news" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">
              Latest Market News
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Stay updated with the latest cryptocurrency, stock, and financial market news
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, index) => (
              <Card key={index} className="rounded-lg overflow-hidden animate-pulse">
                <div className="w-full h-44 bg-secondary"></div>
                <div className="p-4 space-y-3">
                  <div className="h-3 bg-secondary rounded w-1/3"></div>
                  <div className="h-4 bg-secondary rounded w-full"></div>
                  <div className="h-4 bg-secondary rounded w-5/6"></div>
                  <div className="h-3 bg-secondary rounded w-full"></div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </main>
    }>
      <NewsContent />
    </Suspense>
  );
}
