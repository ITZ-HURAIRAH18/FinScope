export default function Footer() {
  return (
    <footer className="border-t border-border/60 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
              <svg className="w-3 h-3 text-primary" viewBox="0 0 24 12" fill="currentColor">
                <path d="M0 11.5L2 9.5L5 10.5L8 6.5L11 8.5L14 3.5L17 5.5L20 1.5L22 2.5L24 0.5V12H0V11.5Z" />
              </svg>
            </div>
            <span className="text-sm text-muted-foreground">
              &copy; 2026 FinScope. All rights reserved.
            </span>
          </div>
          <div className="text-sm text-muted-foreground">
            Developed by{' '}
            <a
              href="https://itz-hurairah.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary-hover transition-colors font-medium"
            >
              M Abu Hurairah
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
