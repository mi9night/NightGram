"use client";

// =============================================================================
//  Landing — NightGram Premium block (Russian)
// =============================================================================

import { motion } from "framer-motion";
import Link from "next/link";
import { Crown, Check, Sparkles } from "lucide-react";
import { ScrollReveal } from "@/components/shared/ScrollReveal";
import { AuroraBackground } from "@/components/shared/AuroraBackground";

const perks = [
  "Эксклюзивные темы и glow-эффекты",
  "Анимированные рамки для аватара",
  "Особый бейдж Premium со свечением",
  "2× NightCoins при каждой покупке",
  "Приоритетные подключения для скорости",
  "Ранний доступ к новым функциям",
];

export function PremiumBlock() {
  return (
    <section className="relative px-6 py-24">
      <div className="max-w-5xl mx-auto">
        <ScrollReveal>
          <motion.div
            whileHover={{ scale: 1.005 }}
            className="relative overflow-hidden rounded-5xl gradient-border glass-strong p-8 md:p-14"
          >
            <AuroraBackground intensity={0.9} />

            <div className="relative z-10 grid md:grid-cols-2 gap-10 items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 mb-5"
                     style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.35)" }}>
                  <Crown size={16} className="text-neon-gold" />
                  <span className="text-sm font-semibold" style={{ color: "#fbbf24" }}>NightGram Premium</span>
                </div>
                <h2 className="font-display font-bold text-3xl md:text-5xl leading-tight">
                  Сияй ярче.
                  <br />
                  <span style={{ color: "#fbbf24" }}>Выделяйся везде.</span>
                </h2>
                <p className="mt-4 text-white/65 text-lg">
                  Открой полный функционал NightGram. Premium синхронизируется
                  между вебом и мобильным приложением в момент оформления.
                </p>

                <div className="mt-7 flex flex-col sm:flex-row gap-3">
                  <Link href="/register" className="btn-glow px-6 py-3.5 inline-flex items-center justify-center gap-2"
                        style={{ background: "linear-gradient(135deg,#fbbf24,#f59e0b)" }}>
                    <Sparkles size={18} /> Попробовать Premium
                  </Link>
                </div>
                <p className="mt-3 text-xs text-white/40">
                  Помесячно и годовой план · от 230₽ · отмена в любой момент
                </p>
              </div>

              <div className="space-y-2.5">
                {perks.map((p, i) => (
                  <motion.div
                    key={p}
                    initial={{ opacity: 0, x: 30 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.08 }}
                    className="flex items-center gap-3 glass rounded-2xl px-4 py-3"
                  >
                    <span className="grid place-items-center h-6 w-6 rounded-full"
                          style={{ background: "rgba(251,191,36,0.18)" }}>
                      <Check size={14} className="text-neon-gold" />
                    </span>
                    <span className="text-white/85 text-sm">{p}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </ScrollReveal>
      </div>
    </section>
  );
}
