import type { Metadata, Viewport } from "next";
import { Inter, Sora } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { SocketProvider } from "@/context/SocketProvider";
import { AppearanceProvider } from "@/context/AppearanceContext";
import { NotificationsProvider } from "@/context/NotificationsContext";
import { NotificationToast } from "@/components/shared/NotificationToast";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-sans",
  display: "swap",
});

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

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
  icons: { icon: "/favicon.ico" },
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
    <html lang="ru" className={`${inter.variable} ${sora.variable}`}>
      <body>
        <AppearanceProvider>
          <AuthProvider>
            <SocketProvider>
              <NotificationsProvider>
                {children}
                <NotificationToast />
              </NotificationsProvider>
            </SocketProvider>
          </AuthProvider>
        </AppearanceProvider>
      </body>
    </html>
  );
}
