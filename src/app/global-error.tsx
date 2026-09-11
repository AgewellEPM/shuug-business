"use client";

/** Last-resort boundary for errors in the root layout itself. Must render <html>. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "3rem", textAlign: "center", color: "#0f172a" }}>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 700 }}>The app hit an unexpected error</h1>
        <p style={{ color: "#64748b", marginTop: ".5rem" }}>We’ve logged it. Please try again.</p>
        {error.digest && <p style={{ color: "#94a3b8", fontFamily: "monospace", fontSize: ".75rem" }}>Ref: {error.digest}</p>}
        <button onClick={reset} style={{ marginTop: "1rem", background: "#0f172a", color: "#fff", border: 0, borderRadius: 8, padding: ".5rem 1rem", fontWeight: 600 }}>Reload</button>
      </body>
    </html>
  );
}
