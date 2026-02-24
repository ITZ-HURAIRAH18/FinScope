export default function Footer() {
  return (
    <footer className="border-t border-white/10 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center text-gray-400">
        <p>© 2026 FinScope. All rights reserved.</p>
        <p className="mt-2">
          Developed by{' '}
          <a 
            href="https://itz-hurairah.vercel.app/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="gradient-text font-semibold hover:opacity-80 transition-opacity"
          >
            M Abu Hurairah & Ali Riaz
          </a>
        </p>
      </div>
    </footer>
  );
}
