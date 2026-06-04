"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/lib/api";
import { saveAuth, AuthUser } from "@/lib/auth";
import { alertError, toastSuccess } from "@/lib/alerts";
import { fadeUp, scaleIn, stagger } from "@/lib/motion";
import AuroraBackground from "@/components/effects/AuroraBackground";
import {
  Activity, Lock, Mail, User, ChevronRight, Eye, EyeOff,
  Stethoscope, Shield, Check,
} from "lucide-react";

const ROLES = [
  { value: "patient", label: "Patient", icon: Activity,    desc: "Track your records & meds", tone: "cyan"   as const },
  { value: "doctor",  label: "Doctor",  icon: Stethoscope, desc: "Clinical AI assistant",     tone: "mint"   as const },
  { value: "admin",   label: "Admin",   icon: Shield,      desc: "System oversight",          tone: "violet" as const },
];

function pwdStrength(pwd: string) {
  let score = 0;
  if (pwd.length >= 6)  score++;
  if (pwd.length >= 10) score++;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
  if (/\d/.test(pwd))   score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  return score; // 0..5
}

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    email: "", password: "", role: "patient", full_name: "",
  });
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const strength = useMemo(() => pwdStrength(form.password), [form.password]);
  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong", "Excellent"][strength];
  const strengthColor = ["bg-white/10", "bg-rose-500", "bg-amber-500", "bg-yellow-400", "bg-emerald-400", "bg-cyan-400"][strength];

  function update<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (form.password.length < 6) {
      alertError("Password too short", "Please use at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch<AuthUser>("/auth/register", {
        method: "POST", body: JSON.stringify(form),
      });
      saveAuth(data);
      toastSuccess("Account created", `Welcome, ${data.full_name ?? data.role}!`);
      const dest =
        data.role === "admin"  ? "/dashboard/admin"  :
        data.role === "doctor" ? "/dashboard/doctor" :
                                  "/dashboard/patient";
      router.push(dest);
    } catch (err) {
      alertError("Registration failed", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen w-full overflow-hidden">
      <AuroraBackground intensity={0.6} />

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center px-6 py-10 lg:py-16">
        <motion.div
          initial="hidden" animate="visible" variants={stagger(0.1, 0.1)}
          className="mb-8 text-center"
        >
          <motion.div variants={scaleIn} className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gradient shadow-glow-violet">
            <Activity className="h-7 w-7 text-white" strokeWidth={2.5} />
          </motion.div>
          <motion.h1 variants={fadeUp} className="text-3xl font-bold tracking-tight sm:text-4xl">
            <span className="gradient-text-animated">Create your account</span>
          </motion.h1>
          <motion.p variants={fadeUp} className="mt-2 text-sm text-ink-200">
            Join MediTrace in under 30 seconds.
          </motion.p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
          className="relative w-full max-w-xl"
        >
          <div className="pointer-events-none absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-cyan-500/15 via-violet-500/20 to-pink-500/15 blur-2xl" />
          <div className="glass-hi relative p-7 sm:p-8">
            <form onSubmit={handleRegister} className="space-y-5">
              {/* Role picker */}
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-ink-300">
                  I am a…
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {ROLES.map((r) => {
                    const Icon = r.icon;
                    const active = form.role === r.value;
                    return (
                      <motion.button
                        key={r.value}
                        type="button"
                        whileTap={{ scale: 0.96 }}
                        onClick={() => update("role", r.value)}
                        className={`group glass-sm relative overflow-hidden p-3 text-center transition-all ${
                          active
                            ? "ring-2 ring-cyan-400/60 shadow-glow-cyan"
                            : "ring-1 ring-white/5 hover:ring-white/15"
                        }`}
                      >
                        <Icon className={`mx-auto mb-1 h-5 w-5 transition-colors ${active ? "text-cyan-300" : "text-ink-300 group-hover:text-ink-50"}`} />
                        <div className="text-xs font-semibold text-ink-50">{r.label}</div>
                        <div className="mt-0.5 text-[10px] text-ink-300">{r.desc}</div>
                        <AnimatePresence>
                          {active && (
                            <motion.div
                              initial={{ scale: 0, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              exit={{ scale: 0, opacity: 0 }}
                              className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-cyan-400 text-[#07070C]"
                            >
                              <Check className="h-3 w-3" strokeWidth={3} />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* Full name */}
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-ink-300">
                  Full name
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
                  <input
                    type="text" value={form.full_name}
                    onChange={(e) => update("full_name", e.target.value)}
                    placeholder="Dr. Ahmed Khan" className="input pl-10"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-ink-300">
                  Email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
                  <input
                    type="email" required value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                    placeholder="you@clinic.com" className="input pl-10"
                  />
                </div>
              </div>

              {/* Password + strength */}
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-ink-300">
                  Password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
                  <input
                    type={showPwd ? "text" : "password"}
                    required value={form.password}
                    onChange={(e) => update("password", e.target.value)}
                    placeholder="Min 6 characters" className="input pl-10 pr-10"
                  />
                  <button
                    type="button" tabIndex={-1}
                    onClick={() => setShowPwd(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-300 hover:text-ink-50 transition-colors"
                  >
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex h-1.5 flex-1 gap-1 overflow-hidden rounded-full">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <motion.div
                        key={i}
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: strength >= i ? 1 : 0.08 }}
                        transition={{ duration: 0.35 }}
                        className={`origin-left flex-1 rounded-full ${strength >= i ? strengthColor : "bg-white/8"}`}
                      />
                    ))}
                  </div>
                  <div className="w-16 text-right text-[10px] font-medium uppercase tracking-wider text-ink-300">
                    {strengthLabel || "—"}
                  </div>
                </div>
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full">
                <AnimatePresence mode="wait">
                  {loading ? (
                    <motion.span key="l" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="inline-flex items-center gap-2">
                      <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      Creating account…
                    </motion.span>
                  ) : (
                    <motion.span key="i" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="inline-flex items-center gap-2">
                      Create account <ChevronRight className="h-4 w-4" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            </form>

            <p className="mt-5 text-center text-sm text-ink-200">
              Already registered?{" "}
              <Link href="/" className="font-semibold gradient-text">Sign in</Link>
            </p>
          </div>
        </motion.div>
      </div>
    </main>
  );
}
