import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { AppearanceProvider } from "@/context/AppearanceContext";
import { DesktopDiagnosticsBridge } from "@/components/desktop/DesktopDiagnosticsBridge";
import { PwaBridge } from "@/components/shared/PwaBridge";

export const metadata: Metadata = {
  title: "NightGram — The Future of Messaging & Social Connection",
  description:
    "NightGram — a dark neon glass social platform. Real-time messaging, an infinite feed, a premium marketplace and your profile, all synced with the mobile app.",
  keywords: [
    "NightGram",
    "social network",
    "messenger",
    "dark neon",
    "premium social",
  ],
  manifest: "/manifest.json",
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "NightGram", statusBarStyle: "black-translucent" },
  openGraph: {
    title: "NightGram",
    description: "The Future of Messaging & Social Connection",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#03020a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>
        <AppearanceProvider>
          <AuthProvider>
            {children}
            <DesktopDiagnosticsBridge />
            <PwaBridge />
          </AuthProvider>
        </AppearanceProvider>
      </body>
    </html>
  );
}
