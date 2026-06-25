"use client";

// =============================================================================
//  NightGram Web — Landing Page (unauthenticated entry)
//  Authenticated users are bounced to /feed by the layout redirect logic.
// =============================================================================

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LandingNav } from "@/components/landing/LandingNav";
import { Hero } from "@/components/landing/Hero";
import { FeaturePreviews } from "@/components/landing/FeaturePreviews";
import { PremiumBlock } from "@/components/landing/PremiumBlock";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { useAuth } from "@/context/AuthContext";

export default function LandingPage() {
  const { status } = useAuth();
  const router = useRouter();

  // Authenticated users go straight to the feed.
  useEffect(() => {
    if (status === "authenticated") router.replace("/feed");
  }, [status, router]);

  // While we resolve the session, avoid a flash of the landing page.
  if (status === "loading") {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full border-2 border-neon-purple/30 border-t-neon-purple animate-spin shadow-glow" />
          <div className="animate-pulse text-neon-purple">Загрузка NightGram…</div>
        </div>
      </div>
    );
  }

  return (
    <main className="relative">
      <LandingNav />
      <Hero />
      <div id="features">
        <FeaturePreviews />
      </div>
      <div id="premium">
        <PremiumBlock />
      </div>
      <LandingFooter />
    </main>
  );
}
