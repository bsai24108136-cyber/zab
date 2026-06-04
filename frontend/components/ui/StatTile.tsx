"use client";
import { motion } from "framer-motion";
import { ReactNode } from "react";
import clsx from "clsx";
import CountUp from "./CountUp";
import { fadeUp } from "@/lib/motion";

type Accent = "cyan" | "violet" | "pink" | "mint" | "amber" | "rose";

interface StatTileProps {
  icon: ReactNode;
  label: string;
  value: number | string;
  sub?: string;
  accent?: Accent;
  delay?: number;
  /** When true, value is treated as a string and rendered as-is */
  raw?: boolean;
  decimals?: number;
  prefix?: string;
  suffix?: string;
}

const TONES: Record<Accent, { ring: string; glow: string; text: string; from: string }> = {
  cyan:   { ring: "ring-cyan-400/20",    glow: "shadow-glow-cyan",   text: "text-cyan-300",    from: "from-cyan-400/15"   },
  violet: { ring: "ring-violet-400/25",  glow: "shadow-glow-violet", text: "text-violet-300",  from: "from-violet-400/15" },
  pink:   { ring: "ring-pink-400/25",    glow: "shadow-glow",        text: "text-pink-300",    from: "from-pink-400/15"   },
  mint:   { ring: "ring-emerald-400/20", glow: "shadow-glow",        text: "text-emerald-300", from: "from-emerald-400/15"},
  amber:  { ring: "ring-amber-400/25",   glow: "shadow-glow",        text: "text-amber-300",   from: "from-amber-400/15"  },
  rose:   { ring: "ring-rose-400/25",    glow: "shadow-glow",        text: "text-rose-300",    from: "from-rose-400/15"   },
};

export default function StatTile({
  icon, label, value, sub, accent = "cyan", delay = 0, raw, decimals, prefix, suffix,
}: StatTileProps) {
  const tone = TONES[accent];
  const numeric = !raw && typeof value === "number";

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.3 }}
      variants={fadeUp}
      transition={{ delay }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className={clsx(
        "glass-sm relative overflow-hidden p-5 ring-1 transition-all duration-300",
        tone.ring,
        "bg-gradient-to-br", tone.from, "to-transparent",
        "hover:" + tone.glow,
      )}
    >
      {/* corner shine */}
      <div className="pointer-events-none absolute -top-12 -right-12 h-28 w-28 rounded-full bg-white/5 blur-2xl" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-300">{label}</p>
          <p className="mt-1.5 text-3xl font-bold tracking-tight text-ink-50">
            {numeric
              ? <CountUp to={value as number} decimals={decimals} prefix={prefix} suffix={suffix} />
              : <span>{prefix}{value as string}{suffix}</span>}
          </p>
          {sub && <p className="mt-1 text-xs text-ink-300">{sub}</p>}
        </div>
        <div className={clsx("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/5", tone.text)}>
          {icon}
        </div>
      </div>
    </motion.div>
  );
}
