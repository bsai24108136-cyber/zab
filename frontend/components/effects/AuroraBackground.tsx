"use client";
import { motion } from "framer-motion";
import clsx from "clsx";

interface AuroraProps {
  className?: string;
  /** Lower intensity for dashboard backgrounds (0.4-1). Default 0.7 */
  intensity?: number;
  /** Hide noise overlay (slightly cheaper). Default false */
  hideNoise?: boolean;
}

export default function AuroraBackground({
  className, intensity = 0.7, hideNoise,
}: AuroraProps) {
  return (
    <div className={clsx("pointer-events-none absolute inset-0 overflow-hidden", !hideNoise && "noise", className)}>
      {/* slow drifting blobs */}
      <motion.div
        aria-hidden
        className="absolute -top-32 -left-32 h-[40vw] w-[40vw] rounded-full"
        style={{
          background: "radial-gradient(circle at 30% 30%, rgba(34,211,238,0.55), transparent 60%)",
          filter: "blur(70px)",
          opacity: intensity,
        }}
        animate={{ x: [0, 40, -20, 0], y: [0, 30, -10, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="absolute top-1/4 -right-32 h-[45vw] w-[45vw] rounded-full"
        style={{
          background: "radial-gradient(circle at 60% 60%, rgba(168,85,247,0.55), transparent 60%)",
          filter: "blur(80px)",
          opacity: intensity,
        }}
        animate={{ x: [0, -30, 20, 0], y: [0, 30, -20, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="absolute bottom-0 left-1/3 h-[35vw] w-[35vw] rounded-full"
        style={{
          background: "radial-gradient(circle at 50% 50%, rgba(244,114,182,0.45), transparent 60%)",
          filter: "blur(75px)",
          opacity: intensity * 0.85,
        }}
        animate={{ x: [0, 20, -25, 0], y: [0, -25, 15, 0] }}
        transition={{ duration: 30, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* faint grid */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse at center, #000 30%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, #000 30%, transparent 75%)",
        }}
      />

      {/* top vignette */}
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/30 to-transparent" />
    </div>
  );
}
