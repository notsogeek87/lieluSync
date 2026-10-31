import type { Metadata, Viewport } from "next";
import "@fontsource-variable/nunito";
import "@fontsource/jetbrains-mono/400.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Lielu Lists — Your TMDB lists in Stremio", template: "%s · Lielu Lists" },
  description: "Synchronisez automatiquement vos watchlists et listes TMDB vers des catalogues Stremio.",
  applicationName: "Lielu Lists",
  robots: { index: true, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf8" },
    { media: "(prefers-color-scheme: dark)", color: "#121820" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
