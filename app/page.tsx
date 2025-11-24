import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900">
      {/* Header */}
      <header className="border-b border-white/10 backdrop-blur-sm bg-black/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">F</span>
            </div>
            <span className="text-2xl font-bold gradient-text">FinScope</span>
          </div>
          <nav className="flex items-center space-x-6">
            <Link href="/dashboard" className="text-gray-300 hover:text-white transition">
              Markets
            </Link>
            <Link href="/analytics" className="text-gray-300 hover:text-white transition">
              Analytics
            </Link>
            <Link href="/auth/login" className="btn-primary px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 transition">
              Login
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
        <div className="text-center space-y-8">
          {/* Title */}
          <div className="space-y-4 animate-fadeIn">
            <h1 className="text-5xl md:text-7xl font-bold text-white">
              Track Crypto & Stocks
            </h1>
            <h2 className="text-4xl md:text-6xl font-bold gradient-text">
              In One Place
            </h2>
          </div>

          {/* Subtitle */}
          <p className="text-xl md:text-2xl text-gray-300 max-w-3xl mx-auto">
            Real-time market data, interactive charts, and powerful analytics
            for cryptocurrencies and stocks
          </p>

          {/* Feature Pills */}
          <div className="flex flex-wrap justify-center gap-4 pt-4">
            <div className="glass-card px-6 py-3 rounded-full">
              <span className="text-blue-400">⚡ Real-time Data</span>
            </div>
            <div className="glass-card px-6 py-3 rounded-full">
              <span className="text-purple-400">📊 Interactive Charts</span>
            </div>
            <div className="glass-card px-6 py-3 rounded-full">
              <span className="text-green-400">⭐ Watchlists</span>
            </div>
            <div className="glass-card px-6 py-3 rounded-full">
              <span className="text-pink-400">📈 Analytics</span>
            </div>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
            <Link
              href="/dashboard"
              className="px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg text-white font-semibold text-lg hover:shadow-lg hover:shadow-blue-500/50 transition transform hover:-translate-y-1"
            >
              View Markets
            </Link>
            <Link
              href="/auth/register"
              className="px-8 py-4 glass-card rounded-lg text-white font-semibold text-lg hover:shadow-lg transition transform hover:-translate-y-1"
            >
              Get Started Free
            </Link>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid md:grid-cols-3 gap-8">
          {/* Feature 1 */}
          <div className="glass-card p-8 rounded-2xl space-y-4 hover:shadow-xl hover:shadow-blue-500/20 transition">
            <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <span className="text-3xl">📊</span>
            </div>
            <h3 className="text-2xl font-bold text-white">Live Market Data</h3>
            <p className="text-gray-400">
              Track real-time prices for thousands of cryptocurrencies and stocks
              with WebSocket connections for instant updates
            </p>
          </div>

          {/* Feature 2 */}
          <div className="glass-card p-8 rounded-2xl space-y-4 hover:shadow-xl hover:shadow-purple-500/20 transition">
            <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center">
              <span className="text-3xl">📈</span>
            </div>
            <h3 className="text-2xl font-bold text-white">Interactive Charts</h3>
            <p className="text-gray-400">
              Analyze trends with beautiful, responsive charts featuring multiple
              timeframes and technical indicators
            </p>
          </div>

          {/* Feature 3 */}
          <div className="glass-card p-8 rounded-2xl space-y-4 hover:shadow-xl hover:shadow-green-500/20 transition">
            <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center">
              <span className="text-3xl">⭐</span>
            </div>
            <h3 className="text-2xl font-bold text-white">Personal Watchlists</h3>
            <p className="text-gray-400">
              Create and manage custom watchlists to keep track of your favorite
              assets all in one place
            </p>
          </div>
        </div>
      </section>

      {/* Market Preview */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-white mb-4">
            Markets at a Glance
          </h2>
          <p className="text-gray-400 text-lg">
            See what's moving in crypto and stock markets
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Crypto Preview */}
          <div className="glass-card p-6 rounded-2xl">
            <h3 className="text-2xl font-bold text-white mb-6 flex items-center">
              <span className="mr-2">₿</span> Cryptocurrency
            </h3>
            <div className="space-y-4">
              {['Bitcoin', 'Ethereum', 'Binance Coin'].map((crypto, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-gray-300">{crypto}</span>
                  <div className="flex items-center space-x-4">
                    <span className="text-white font-mono">Loading...</span>
                    <span className="price-positive">+0.00%</span>
                  </div>
                </div>
              ))}
            </div>
            <Link
              href="/dashboard?tab=crypto"
              className="mt-6 block text-center text-blue-400 hover:text-blue-300 transition"
            >
              View all crypto →
            </Link>
          </div>

          {/* Stocks Preview */}
          <div className="glass-card p-6 rounded-2xl">
            <h3 className="text-2xl font-bold text-white mb-6 flex items-center">
              <span className="mr-2">📈</span> Stocks
            </h3>
            <div className="space-y-4">
              {['AAPL', 'GOOGL', 'TSLA'].map((stock, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-gray-300">{stock}</span>
                  <div className="flex items-center space-x-4">
                    <span className="text-white font-mono">Loading...</span>
                    <span className="price-positive">+0.00%</span>
                  </div>
                </div>
              ))}
            </div>
            <Link
              href="/dashboard?tab=stocks"
              className="mt-6 block text-center text-blue-400 hover:text-blue-300 transition "
            >
              View all stocks →
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center text-gray-400">
          <p>© 2024 FinScope. Built with Next.js, Redux, and real-time WebSockets.</p>
        </div>
      </footer>
    </main>
  );
}
