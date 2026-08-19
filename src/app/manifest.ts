import type { MetadataRoute } from "next";

// Next.js's file-convention manifest -- auto-served at /manifest.webmanifest
// and auto-linked from every page's <head>. Makes the app installable
// (Add to Home Screen / desktop install prompt) with its own window, icon
// and splash screen instead of just being a browser tab.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Meenakshi Hospital",
    short_name: "Meenakshi",
    description: "Hospital operations -- reception, OP, doctor, IP and pharmacy workflows.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f0fdf4",
    theme_color: "#0f766e",
    orientation: "portrait-primary",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
