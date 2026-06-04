"use client";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { ButtonHTMLAttributes, MouseEvent, useRef } from "react";
import clsx from "clsx";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  strength?: number;
}

export default function MagneticButton({
  children, className, strength = 0.35, ...rest
}: Props) {
  const ref = useRef<HTMLButtonElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 170, damping: 14, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 170, damping: 14, mass: 0.4 });

  function onMove(e: MouseEvent<HTMLButtonElement>) {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    x.set((e.clientX - rect.left - rect.width / 2) * strength);
    y.set((e.clientY - rect.top  - rect.height / 2) * strength);
  }
  function onLeave() { x.set(0); y.set(0); }

  return (
    <motion.button
      ref={ref}
      style={{ x: sx, y: sy }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={clsx("btn-primary", className)}
      {...(rest as any)}
    >
      {children}
    </motion.button>
  );
}
