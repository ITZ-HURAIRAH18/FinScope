"use client";

/**
 * Last-resort error boundary — rendered INSTEAD of the root layout when the
 * layout itself (or anything above error.tsx) throws. It cannot use the app's
 * providers, fonts, or global CSS (those may be the source of the crash), so
 * it ships minimal inline styles.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0f",
          color: "#e5e7eb",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 420, padding: "0 16px" }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            FinScope hit an unexpected error
          </h1>
          <p style={{ fontSize: 14, color: "#9ca3af", marginBottom: 24 }}>
            The application failed to start. Reloading usually fixes this.
            {error.digest && (
              <span
                style={{
                  display: "block",
                  marginTop: 8,
                  fontSize: 12,
                  fontFamily: "monospace",
                }}
              >
                Reference: {error.digest}
              </span>
            )}
          </p>
          <button
            onClick={reset}
            style={{
              background: "#DC2626",
              color: "#fff",
              border: "none",
              padding: "10px 24px",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
