"use client";
import { motion, Variants } from "framer-motion";
import { ReactNode } from "react";
import { fadeUp } from "@/lib/motion";

interface RevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  variants?: Variants;
  once?: boolean;
  as?: "div" | "section" | "li" | "article" | "header";
  amount?: number;
}

export default function Reveal({
  children,
  className,
  delay = 0,
  variants = fadeUp,
  once = true,
  amount = 0.2,
  as = "div",
}: RevealProps) {
  const MotionTag = motion[as] as typeof motion.div;
  return (
    <MotionTag
      initial="hidden"
      whileInView="visible"
      viewport={{ once, amount }}
      variants={variants}
      transition={{ delay }}
      className={className}
    >
      {children}
    </MotionTag>
  );
}
