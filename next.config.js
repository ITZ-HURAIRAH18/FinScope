/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: [
      'assets.coingecko.com', 
      'logo.clearbit.com', 
      'static2.finnhub.io', 
      'image.cnbcfm.com', 
      'data.bloomberglp.com', 
      'assets.coincap.io', 
      'financialmodelingprep.com',
      'cryptologos.cc',
      's2.coinmarketcap.com',
      'images.unsplash.com',
    ],
  },
  webpack: (config) => {
    config.externals.push({
      'utf-8-validate': 'commonjs utf-8-validate',
      'bufferutil': 'commonjs bufferutil',
    });
    return config;
  },
}

module.exports = nextConfig
