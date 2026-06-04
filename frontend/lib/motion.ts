import type { Variants, Transition } from "framer-motion";

export const easeOutExpo: Transition["ease"] = [0.16, 1, 0.3, 1];
export const easeOutBack: Transition["ease"]  = [0.34, 1.56, 0.64, 1];

export const fadeUp: Variants = {
  hidden:  { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: easeOutExpo } },
};

export const fadeIn: Variants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.6, ease: easeOutExpo } },
};

export const scaleIn: Variants = {
  hidden:  { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: easeOutBack } },
};

export const slideInLeft: Variants = {
  hidden:  { opacity: 0, x: -32 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.65, ease: easeOutExpo } },
};

export const slideInRight: Variants = {
  hidden:  { opacity: 0, x: 32 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.65, ease: easeOutExpo } },
};

export const stagger = (delayChildren = 0.05, staggerChildren = 0.08): Variants => ({
  hidden:  {},
  visible: {
    transition: { delayChildren, staggerChildren },
  },
});

export const hoverLift = {
  whileHover: { y: -4, transition: { duration: 0.25, ease: easeOutExpo } },
  whileTap:   { scale: 0.98 },
};
