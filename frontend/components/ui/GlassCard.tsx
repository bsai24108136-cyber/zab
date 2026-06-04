"use client";
import { motion, HTMLMotionProps } from "framer-motion";
import { ReactNode, MouseEvent, useRef } from "react";
import clsx from "clsx";

interface GlassCardProps extends Omit<HTMLMotionProps<"div">, "children"> {
  children: ReactNode;
  className?: string;
  /** Adds a soft tilting parallax on hover */
  interactive?: boolean;
  /** Accent gradient tint shown on the top-left edge */
  accent?: "cyan" | "violet" | "pink" | "mint" | "amber" | "none";
  /** Larger blur + lighter border */
  variant?: "default" | "hi" | "sm";
}

const ACCENTS = {
  cyan:   "from-cyan-400/20",
  violet: "from-violet-400/20",
  pink:   "from-pink-400/20",
  mint:   "from-emerald-400/20",
  amber:  "from-amber-400/20",
  none:   "from-transparent",
};

export default function GlassCard({
  children, className, interactive, accent = "none", variant = "default", ...rest
}: GlassCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  function onMove(e: MouseEvent<HTMLDivElement>) {
    if (!interactive || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width  - 0.5) * 6;
    const y = ((e.clientY - rect.top)  / rect.height - 0.5) * -6;
    ref.current.style.transform = `perspective(900px) rotateX(${y}deg) rotateY(${x}deg)`;
  }
  function onLeave() {
    if (!interactive || !ref.current) return;
    ref.current.style.transform = "perspective(900px) rotateX(0) rotateY(0)";
  }

  const surface = variant === "hi" ? "glass-hi" : variant === "sm" ? "glass-sm" : "glass";

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={clsx(
        "relative overflow-hidden transition-transform duration-200 ease-out",
        surface,
        accent !== "none" && `bg-gradient-to-br ${ACCENTS[accent]} to-transparent`,
        className,
      )}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
