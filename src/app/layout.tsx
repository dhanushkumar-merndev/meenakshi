import type { Metadata, Viewport } from "next";
import { Geist_Mono, Roboto } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/components/providers/query-provider";
import { OfflineBanner } from "@/components/shared/offline-banner";
import { ServiceWorkerRegister } from "@/components/shared/service-worker-register";
import "./globals.css";

const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: "variable",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Meenakshi Hospital", template: "%s | Meenakshi Hospital" },
  description: "Secure hospital operations for Meenakshi Hospital",
  icons: { icon: "/logo.webp", shortcut: "/logo.webp", apple: "/apple-touch-icon.png" },
  // iOS ignores the web manifest for "Add to Home Screen" and reads these
  // meta tags instead to run the installed app in its own standalone window.
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Meenakshi Hospital" },
};

export const viewport: Viewport = {
  themeColor: "#0f766e",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-IN"
      className={`${roboto.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <QueryProvider>
          <OfflineBanner />
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster richColors position="top-right" />
        </QueryProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
