"use client";

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <html lang="it">
            <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#F4F5F7", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
                <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB", padding: 32, maxWidth: 400, textAlign: "center" }}>
                    <h1 style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginBottom: 8 }}>Errore dell&apos;applicazione</h1>
                    <p style={{ fontSize: 14, color: "#6B7280", marginBottom: 24 }}>Riprova o torna alla home.</p>
                    <button
                        onClick={() => reset()}
                        style={{ width: "100%", padding: "12px 16px", background: "#111827", color: "#fff", fontWeight: 600, border: "none", borderRadius: 12, cursor: "pointer" }}
                    >
                        Riprova
                    </button>
                    <a
                        href="/"
                        style={{ display: "block", marginTop: 12, fontSize: 14, color: "#6B7280" }}
                    >
                        Torna alla home
                    </a>
                </div>
            </body>
        </html>
    );
}
