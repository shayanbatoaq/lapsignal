import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter, Manrope } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "LapSignal — Every lap has a signal", template: "%s · LapSignal" },
  description: "The evidence-backed AI race engineer for every stint.",
  applicationName: "LapSignal",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "LapSignal — Every lap has a signal.",
    description: "Evidence-backed coaching for every stint.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "LapSignal telemetry signal preview" }]
  },
  twitter: {
    card: "summary_large_image",
    title: "LapSignal — Every lap has a signal.",
    description: "Evidence-backed coaching for every stint.",
    images: ["/og.png"]
  }
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, colorScheme: "dark", themeColor: "#07090D" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${inter.variable} ${manrope.variable} ${geistMono.variable}`}><body><a href="#main-content" className="skip-link">Skip to content</a><Providers>{children}</Providers></body></html>;
}
