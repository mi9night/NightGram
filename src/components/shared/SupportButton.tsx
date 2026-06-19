"use client";

// =============================================================================
//  SupportButton — icon in navbar that links to user's tickets page
// =============================================================================

import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import { cn } from "@/lib/utils";

export function SupportButton({ className }: { className?: string }) {
  return (
    <Link
      href="/support"
      className={cn(
        "grid place-items-center h-9 w-9 rounded-xl glass text-white/60 hover:text-neon-purple transition",
        className,
      )}
      title="Поддержка / Тикеты"
    >
      <LifeBuoy size={17} />
    </Link>
  );
}
