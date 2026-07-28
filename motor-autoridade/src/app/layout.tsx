import type { Metadata, Viewport } from "next";
import { Instrument_Sans, Newsreader, Plus_Jakarta_Sans, Sora } from "next/font/google";
import "./globals.css";
import { RegisterSW } from "@/components/pwa/RegisterSW";
import { brand } from "@/lib/brand";

const sans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
  display: "swap",
});

const serif = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  display: "swap",
});

// Tipografia do Assessor 24h — a mesma do site assessor24h.ia.br.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap",
});

// Só as fontes da marca ativa entram no <html>.
const fontVariables =
  brand.id === "assessor24h"
    ? `${jakarta.variable} ${sora.variable}`
    : `${sans.variable} ${serif.variable}`;

export const metadata: Metadata = {
  title: brand.name,
  description: brand.description,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: brand.name,
  },
  icons:
    brand.id === "assessor24h"
      ? {
          icon: [
            { url: "/icon-assessor24h.svg", type: "image/svg+xml" },
            { url: "/icon-192-assessor24h.png", type: "image/png", sizes: "192x192" },
          ],
          apple: "/apple-touch-icon-assessor24h.png",
        }
      : {
          icon: [
            { url: "/icon.svg", type: "image/svg+xml" },
            { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
          ],
          apple: "/apple-touch-icon.png",
        },
};

export const viewport: Viewport = {
  themeColor: "#143627",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" data-brand={brand.id} className={fontVariables}>
      <body className="min-h-dvh antialiased">
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
