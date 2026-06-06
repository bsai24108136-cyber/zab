"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { getAuth, clearAuth, AuthUser } from "@/lib/auth";
import { alertConfirm, toastInfo } from "@/lib/alerts";
import AuroraBackground from "@/components/effects/AuroraBackground";
import {
  LayoutDashboard, FileText, Search, MessageSquare,
  Users, BarChart3, LogOut, Brain, Shield,
  Menu, X, Leaf, FlaskConical,
} from "lucide-react";
import NotificationBell from "./NotificationBell";

interface NavItem { label: string; href: string; icon: React.ReactNode; }

const NAV_PATIENT: NavItem[] = [
  { label: "Dashboard",       href: "/dashboard/patient",              icon: <LayoutDashboard className="h-4 w-4" /> },
  { label: "My Documents",    href: "/dashboard/patient/documents",    icon: <FileText className="h-4 w-4" /> },
  { label: "AI Chat",         href: "/dashboard/patient/chat",         icon: <MessageSquare className="h-4 w-4" /> },
  { label: "Medications",     href: "/dashboard/patient/medications",  icon: <FlaskConical className="h-4 w-4" /> },
  { label: "Search Records",  href: "/dashboard/patient/search",       icon: <Search className="h-4 w-4" /> },
  { label: "Health Agent",    href: "/dashboard/patient/health-agent", icon: <Leaf className="h-4 w-4 text-emerald-400" /> },
];

const NAV_DOCTOR: NavItem[] = [
  { label: "Dashboard",   href: "/dashboard/doctor",              icon: <LayoutDashboard className="h-4 w-4" /> },
  { label: "Patients",    href: "/dashboard/doctor/patients",     icon: <Users className="h-4 w-4" /> },
  { label: "Documents",   href: "/dashboard/doctor/documents",    icon: <FileText className="h-4 w-4" /> },
  { label: "AI Assistant",href: "/dashboard/doctor/ai-assistant", icon: <Brain className="h-4 w-4" /> },
  { label: "Lab Reports", href: "/dashboard/doctor/lab-reports",  icon: <FlaskConical className="h-4 w-4" /> },
  { label: "Search",      href: "/dashboard/doctor/search",       icon: <Search className="h-4 w-4" /> },
  { label: "Analytics",   href: "/dashboard/doctor/analytics",    icon: <BarChart3 className="h-4 w-4" /> },
];

const NAV_ADMIN: NavItem[] = [
  { label: "Dashboard",      href: "/dashboard/admin",          icon: <LayoutDashboard className="h-4 w-4" /> },
  { label: "Users",          href: "/dashboard/admin/users",    icon: <Users className="h-4 w-4" /> },
  { label: "Documents",      href: "/dashboard/admin/documents",icon: <FileText className="h-4 w-4" /> },
  { label: "Cost Monitor",   href: "/dashboard/admin/costs",    icon: <BarChart3 className="h-4 w-4" /> },
  { label: "Audit Log",      href: "/dashboard/admin/audit",    icon: <Shield className="h-4 w-4" /> },
  { label: "Search History", href: "/dashboard/admin/searches", icon: <Search className="h-4 w-4" /> },
];

function roleNav(role: string): NavItem[] {
  if (role === "patient") return NAV_PATIENT;
  if (role === "doctor")  return NAV_DOCTOR;
  return NAV_ADMIN;
}
function roleGradient(role: string) {
  if (role === "patient") return "from-cyan-400 via-sky-500 to-blue-500";
  if (role === "doctor")  return "from-emerald-400 via-teal-500 to-cyan-500";
  return "from-violet-500 via-fuchsia-500 to-pink-500";
}
function roleLabel(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const auth = getAuth();
    if (!auth) { router.push("/"); return; }
    setUser(auth);
  }, [router]);

  if (!user) {
    return (
      <div className="relative min-h-screen flex items-center justify-center">
        <AuroraBackground intensity={0.5} />
        <div className="relative h-10 w-10 rounded-full border-2 border-cyan-400/40 border-t-cyan-400 animate-spin" />
      </div>
    );
  }

  const nav = roleNav(user.role);

  async function handleLogout() {
    const res = await alertConfirm({
      title: "Sign out?",
      text: "You'll need to enter your password again to come back.",
      icon: "question",
      confirmText: "Sign out",
      cancelText: "Stay signed in",
    });
    if (res.isConfirmed) {
      clearAuth();
      toastInfo("Signed out", "See you soon.");
      router.push("/");
    }
  }

  function isActive(href: string) {
    // Dashboard homes need exact match (otherwise they'd always match)
    const homes = ["/dashboard/doctor", "/dashboard/admin", "/dashboard/patient"];
    if (homes.includes(href)) return pathname === href;
    return pathname.startsWith(href);
  }

  const currentTitle =
    nav.find(n => isActive(n.href))?.label ?? "Dashboard";

  return (
    <div className="relative flex min-h-screen">
      <AuroraBackground intensity={0.45} hideNoise />

      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-20 bg-black/60 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-white/5 bg-[#0B0A14]/85 backdrop-blur-2xl transition-transform duration-300 lg:static lg:translate-x-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        {/* Logo */}
        <div className="border-b border-white/5 p-5">
          <Link href={`/dashboard/${user.role}`} className="group flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-cyan-400 via-violet-500 to-pink-500 blur-md opacity-70 transition-opacity group-hover:opacity-100" />
              <Image
                src="/new_logo.jpg"
                alt="MediTrace"
                width={36}
                height={36}
                priority
                className="relative h-9 w-9 rounded-xl object-cover"
              />
            </div>
            <div>
              <div className="text-sm font-bold text-ink-50">MediTrace</div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-ink-300">{roleLabel(user.role)} Portal</div>
            </div>
          </Link>
        </div>

        {/* User pill */}
        <div className="px-4 py-3">
          <div className="glass-sm flex items-center gap-3 px-3 py-2.5">
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${roleGradient(user.role)} text-xs font-bold text-white`}>
              {(user.full_name || user.role).charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-ink-50">
                {user.full_name || user.role}
              </div>
              <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-ink-300">
                <span className={`inline-block h-1.5 w-1.5 rounded-full bg-gradient-to-r ${roleGradient(user.role)}`} />
                {roleLabel(user.role)}
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <LayoutGroup id="sidebar-nav">
          <nav className="flex-1 overflow-y-auto p-3">
            <div className="space-y-0.5">
              {nav.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className="relative block"
                  >
                    {active && (
                      <motion.span
                        layoutId="sidebar-active"
                        className="absolute inset-0 rounded-xl border border-white/10 bg-gradient-to-r from-cyan-400/15 via-violet-500/15 to-pink-500/15 shadow-glow-violet"
                        transition={{ type: "spring", stiffness: 350, damping: 32 }}
                      />
                    )}
                    <div className={`relative flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${active ? "text-white" : "text-ink-200 hover:text-ink-50"}`}>
                      {active && (
                        <span className="absolute -left-3 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-gradient-to-b from-cyan-400 to-violet-500 shadow-[0_0_10px_rgba(168,85,247,0.7)]" />
                      )}
                      {item.icon}
                      {item.label}
                    </div>
                  </Link>
                );
              })}
            </div>
          </nav>
        </LayoutGroup>

        {/* Logout */}
        <div className="border-t border-white/5 p-3">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-rose-300 transition-all hover:bg-rose-500/10 hover:text-rose-200"
          >
            <LogOut className="h-4 w-4" /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-white/5 bg-[#0B0A14]/70 px-4 backdrop-blur-2xl lg:px-6">
          <div className="flex items-center gap-3">
            <button
              className="text-ink-200 hover:text-ink-50 transition-colors lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-sm font-semibold tracking-tight text-ink-100">
              {currentTitle}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {user.role === "doctor" && <NotificationBell />}
            <div className="hidden sm:block text-xs text-ink-300">{user.full_name}</div>
            <div className={`flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br ${roleGradient(user.role)} text-xs font-bold text-white shadow-glow-violet`}>
              {(user.full_name || user.role).charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        {/* Page content with route transition */}
        <main className="relative flex-1 overflow-auto p-4 lg:p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile close button (outside sidebar so it's visible) */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed left-[17rem] top-4 z-40 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/70 text-ink-50 backdrop-blur lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
