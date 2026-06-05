"use client";
import { useRef, useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import gsap from "gsap";
import { apiFetch } from "@/lib/api";
import { saveAuth, AuthUser } from "@/lib/auth";
import { toastSuccess, alertError } from "@/lib/alerts";
import { fadeUp, slideInRight, stagger } from "@/lib/motion";
import AuroraBackground from "@/components/effects/AuroraBackground";
import {
  Activity, Lock, Mail, ChevronRight,
  Sparkles, ShieldCheck, Brain, Eye, EyeOff,
} from "lucide-react";

const Hero3D = dynamic(() => import("@/components/effects/Hero3D"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="h-12 w-12 rounded-full border-2 border-cyan-400/40 border-t-cyan-400 animate-spin" />
    </div>
  ),
});

const FEATURES = [
  { icon: Brain,       title: "Agentic AI",         text: "Visible step indicators, tool chips, GPT-4o-mini & Gemini" },
  { icon: ShieldCheck, title: "Data Vault 2.0",     text: "Append-only schema, PIT snapshots, row-level security" },
  { icon: Sparkles,    title: "Semantic Search",    text: "384-dim embeddings + keyword hybrid, confidence scoring" },
];

export default function LandingPage() {
  const router = useRouter();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);

  /* GSAP entrance for the headline */
  useEffect(() => {
    if (!titleRef.current) return;
    const chars = titleRef.current.querySelectorAll("[data-char]");
    gsap.fromTo(
      chars,
      { yPercent: 110, opacity: 0, rotateZ: 6 },
      {
        yPercent: 0, opacity: 1, rotateZ: 0,
        duration: 0.85, ease: "power4.out", stagger: 0.025, delay: 0.15,
      },
    );
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await apiFetch<AuthUser>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      saveAuth(data);
      toastSuccess("Welcome back", `Signed in as ${data.role}`);
      const dest =
        data.role === "admin"  ? "/dashboard/admin"  :
        data.role === "doctor" ? "/dashboard/doctor" :
                                  "/dashboard/patient";
      router.push(dest);
    } catch (err: unknown) {
      alertError("Sign-in failed", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const headline = "Clinical AI, reimagined.";

  return (
    <main className="relative min-h-screen w-full overflow-hidden">
      <AuroraBackground />

      {/* Full-width DNA scene — sits above the aurora, behind all content */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-screen w-full">
        <Hero3D className="absolute inset-0 h-full w-full opacity-90" />
        {/* edge vignette so foreground stays readable */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(7,7,12,0.55)_75%,rgba(7,7,12,0.9)_100%)]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#07070C] to-transparent" />
      </div>

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5 lg:px-12">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="relative">
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-cyan-400 via-violet-500 to-pink-500 blur-md opacity-70 group-hover:opacity-100 transition-opacity" />
            <div className="relative h-9 w-9 rounded-xl bg-gradient-to-br from-cyan-400 via-violet-500 to-pink-500 flex items-center justify-center">
              <Activity className="h-5 w-5 text-white" strokeWidth={2.5} />
            </div>
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight text-ink-50">MediTrace</div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-ink-300">AI Clinical Engine</div>
          </div>
        </Link>
        <nav className="hidden md:flex items-center gap-2 text-sm">
          <a href="#features" className="btn-ghost">Features</a>
          <a href="#login" className="btn-ghost">Sign in</a>
          <Link href="/register" className="btn-secondary">Create account</Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto grid w-full max-w-7xl grid-cols-1 gap-10 px-6 pb-12 pt-6 lg:grid-cols-2 lg:gap-16 lg:px-12 lg:pt-10">
        {/* Left — copy + 3D */}
        <div className="flex min-w-0 flex-col">
          <motion.div
            initial="hidden" animate="visible" variants={stagger(0.1, 0.1)}
            className="glass relative min-w-0 max-w-full space-y-6 p-6 sm:p-7 lg:p-6"
          >
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs backdrop-blur">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
              </span>
              <span className="font-medium text-ink-200">Live · Gemini + GROQ</span>
            </motion.div>

            <h1
              ref={titleRef}
              className="whitespace-nowrap text-2xl font-bold leading-[1.05] tracking-tight sm:text-3xl md:text-5xl lg:text-[1.75rem] xl:text-[2rem] 2xl:text-4xl"
              aria-label={headline}
            >
              <span className="inline-block overflow-hidden align-bottom">
                {headline.split("").map((c, i) => (
                  <span
                    key={i}
                    data-char
                    className={`inline-block ${i > 11 ? "gradient-text-animated" : "text-ink-50"}`}
                    style={{ whiteSpace: c === " " ? "pre" : "normal" }}
                  >
                    {c}
                  </span>
                ))}
              </span>
            </h1>

            <motion.p variants={fadeUp} className="max-w-xl text-base leading-relaxed text-ink-200 sm:text-lg">
              MediTrace turns messy clinical notes, prescription PDFs and WhatsApp exports into
              structured, searchable medical intelligence — in seconds.
            </motion.p>

            <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-3">
              <a href="#login" className="btn-primary">
                Sign in <ChevronRight className="h-4 w-4" />
              </a>
              <Link href="/register" className="btn-secondary">
                Create account
              </Link>
            </motion.div>
          </motion.div>

        </div>

        {/* Right — login card */}
        <motion.div
          id="login"
          initial="hidden" animate="visible" variants={slideInRight}
          className="relative flex items-start justify-center lg:justify-end"
        >
          <div className="relative w-full max-w-md">
            {/* outer glow */}
            <div className="pointer-events-none absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-cyan-500/20 via-violet-500/20 to-pink-500/20 blur-2xl" />
            <div className="glass-hi relative p-7 sm:p-8">
              <div className="mb-6 flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-brand-gradient shadow-glow-violet flex items-center justify-center">
                  <Activity className="h-5 w-5 text-white" strokeWidth={2.5} />
                </div>
                <div>
                  <div className="text-base font-semibold text-ink-50">Sign in</div>
                  <div className="text-xs text-ink-300">Welcome back to MediTrace</div>
                </div>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-ink-300">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
                    <input
                      type="email" autoComplete="email" required
                      value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="you@clinic.com"
                      className="input pl-10"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-ink-300">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
                    <input
                      type={showPwd ? "text" : "password"}
                      autoComplete="current-password" required
                      value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="input pl-10 pr-10"
                    />
                    <button
                      type="button" tabIndex={-1}
                      onClick={() => setShowPwd(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-300 hover:text-ink-50 transition-colors"
                      aria-label={showPwd ? "Hide password" : "Show password"}
                    >
                      {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <button type="submit" disabled={loading} className="btn-primary mt-2 w-full">
                  <AnimatePresence mode="wait">
                    {loading ? (
                      <motion.span key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="inline-flex items-center gap-2">
                        <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        Signing in…
                      </motion.span>
                    ) : (
                      <motion.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="inline-flex items-center gap-2">
                        Sign In <ChevronRight className="h-4 w-4" />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-ink-200">
                No account?{" "}
                <Link href="/register" className="font-semibold gradient-text">
                  Create one
                </Link>
              </p>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Features */}
      <section id="features" className="relative z-10 mx-auto mt-10 grid w-full max-w-7xl gap-4 px-6 pb-16 sm:grid-cols-3 lg:px-12">
        {FEATURES.map((f, i) => {
          const Icon = f.icon;
          return (
            <motion.div
              key={f.title}
              initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }}
              variants={fadeUp} transition={{ delay: i * 0.1 }}
              className="glass-sm group relative overflow-hidden p-5 transition-all hover:-translate-y-1 hover:shadow-glow-violet"
            >
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400/20 to-violet-500/20 text-cyan-300">
                <Icon className="h-5 w-5" />
              </div>
              <div className="text-sm font-semibold text-ink-50">{f.title}</div>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-200">{f.text}</p>
            </motion.div>
          );
        })}
      </section>

      <footer className="relative z-10 px-6 py-6 text-center lg:px-12">
        <span className="inline-block rounded-full glass-sm px-4 py-1.5 text-xs text-ink-200">
          © {new Date().getFullYear()} MediTrace · Built for Pakistani clinics with privacy in mind.
        </span>
      </footer>
    </main>
  );
}
