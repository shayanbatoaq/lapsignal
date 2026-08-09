import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Geist_Mono, Manrope } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });
const barlowCondensed = Barlow_Condensed({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-barlow-condensed", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "LapSignal — Your post-stint debrief", template: "%s · LapSignal" },
  description: "A local-first pit-wall debrief that turns recorded telemetry into a focused next-run plan.",
  applicationName: "LapSignal",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "LapSignal — Your post-stint debrief.",
    description: "Recorded telemetry. Verified signals. One focused next-run plan.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "LapSignal telemetry signal preview" }]
  },
  twitter: {
    card: "summary_large_image",
    title: "LapSignal — Your post-stint debrief.",
    description: "Recorded telemetry. Verified signals. One focused next-run plan.",
    images: ["/og.png"]
  }
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, colorScheme: "dark", themeColor: "#08090B" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${manrope.variable} ${barlowCondensed.variable} ${geistMono.variable}`}><body><a href="#main-content" className="skip-link">Skip to content</a><Providers>{children}</Providers></body></html>;
}
