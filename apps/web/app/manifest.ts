import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LapSignal",
    short_name: "LapSignal",
    description: "Local-first sim-racing telemetry analysis and coaching.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#080A0D",
    theme_color: "#080A0D",
    icons: [
      {
        src: "/brand/lapsignal/pwa-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/brand/lapsignal/pwa-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/brand/lapsignal/pwa-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ]
  };
}
