import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Geist_Mono, Manrope } from "next/font/google";
import { Providers } from "@/components/Providers";
import { getRuntimeMode } from "@/lib/runtime-server";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });
const barlowCondensed = Barlow_Condensed({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-barlow-condensed", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SHOWCASE_CANONICAL_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "LapSignal — Sim-Racing Telemetry & Coaching", template: "%s · LapSignal" },
  description: "An evidence-backed sim-racing telemetry and coaching platform in active development. Explore the interactive alpha product preview.",
  applicationName: "LapSignal",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/brand/lapsignal/favicon.ico", sizes: "any" },
      { url: "/brand/lapsignal/favicon-16.png", type: "image/png", sizes: "16x16" },
      { url: "/brand/lapsignal/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/brand/lapsignal/favicon-48.png", type: "image/png", sizes: "48x48" }
    ],
    shortcut: "/brand/lapsignal/favicon.ico",
    apple: [{ url: "/brand/lapsignal/apple-touch-icon-180.png", type: "image/png", sizes: "180x180" }]
  },
  appleWebApp: { capable: true, title: "LapSignal", statusBarStyle: "black-translucent" },
  openGraph: {
    title: "LapSignal — Sim-Racing Telemetry & Coaching",
    description: "Work in progress · Interactive alpha preview of evidence-backed telemetry analysis and coaching.",
    images: [{ url: "/brand/lapsignal/lapsignal-social-card-1200x630.png", width: 1200, height: 630, alt: "LapSignal — Every lap has a signal" }]
  },
  twitter: {
    card: "summary_large_image",
    title: "LapSignal — Sim-Racing Telemetry & Coaching",
    description: "Work in progress · Interactive alpha preview of evidence-backed telemetry analysis and coaching.",
    images: ["/brand/lapsignal/lapsignal-social-card-1200x630.png"]
  }
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, colorScheme: "dark", themeColor: "#080A0D" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const mode = getRuntimeMode();
  return <html lang="en" data-scroll-behavior="smooth" className={`${manrope.variable} ${barlowCondensed.variable} ${geistMono.variable}`}><body><a href="#main-content" className="skip-link">Skip to content</a><Providers mode={mode}>{children}</Providers></body></html>;
}
