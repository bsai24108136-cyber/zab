"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, AlertTriangle, Info, CheckCircle, CheckCheck } from "lucide-react";

interface Notif {
  id: string;
  severity: "routine" | "urgent" | "critical";
  title: string;
  message: string;
  is_read: boolean;
  patient_id: string;
  patient_name: string;
  time_ago: string;
}
interface NotifResponse {
  notifications: Notif[];
  unread_count: number;
  critical_count: number;
  urgent_count: number;
}

const SEV_TONE: Record<string, { icon: React.ReactNode; ring: string; chip: string }> = {
  critical: {
    icon: <AlertTriangle className="h-3.5 w-3.5 text-rose-300" />,
    ring: "ring-rose-500/40 bg-rose-500/10",
    chip: "bg-rose-500/20 text-rose-200 border-rose-500/30",
  },
  urgent: {
    icon: <AlertTriangle className="h-3.5 w-3.5 text-amber-300" />,
    ring: "ring-amber-500/40 bg-amber-500/10",
    chip: "bg-amber-500/20 text-amber-200 border-amber-500/30",
  },
  routine: {
    icon: <Info className="h-3.5 w-3.5 text-cyan-300" />,
    ring: "ring-cyan-500/30 bg-cyan-500/10",
    chip: "bg-cyan-500/15 text-cyan-200 border-cyan-500/30",
  },
};

export default function NotificationBell() {
  const router = useRouter();
  const [data, setData] = useState<NotifResponse | null>(null);
  const [open, setOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<NotifResponse>("/notifications/");
      setData(res);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const markRead = async (id: string) => {
    try { await apiFetch(`/notifications/${id}/read`, { method: "PATCH" }); await load(); }
    catch { /* ignore */ }
  };
  const markAll = async () => {
    try { await apiFetch("/notifications/read-all", { method: "PATCH" }); await load(); }
    catch { /* ignore */ }
  };

  const unread = data?.unread_count ?? 0;
  const critical = data?.critical_count ?? 0;

  return (
    <div className="relative" ref={dropRef}>
      <motion.button
        id="notification-bell"
        whileTap={{ scale: 0.94 }}
        onClick={() => setOpen(o => !o)}
        className={`relative grid h-9 w-9 place-items-center rounded-xl transition-colors ${
          unread > 0 ? "text-rose-300 hover:bg-rose-500/10" : "text-ink-200 hover:bg-white/5"
        }`}
        aria-label="Notifications"
      >
        <Bell className="h-4.5 w-4.5" />
        {unread > 0 && (
          <motion.span
            initial={{ scale: 0 }} animate={{ scale: 1 }}
            className={`absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold text-white shadow-lg ${
              critical > 0 ? "bg-rose-500 shadow-rose-500/40" : "bg-gradient-to-br from-amber-400 to-rose-400"
            }`}
          >
            {unread > 99 ? "99+" : unread}
          </motion.span>
        )}
        {unread > 0 && (
          <span className="pointer-events-none absolute inset-0 -z-10 rounded-xl bg-rose-500/30 blur-md opacity-60 animate-pulse" />
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 top-[calc(100%+0.5rem)] z-50 flex max-h-[420px] w-[360px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0E0D24]/95 shadow-2xl shadow-black/70 backdrop-blur-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/5 bg-gradient-to-r from-violet-500/10 via-transparent to-cyan-500/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <Bell className="h-3.5 w-3.5 text-violet-300" />
                <span className="text-sm font-semibold text-ink-50">Notifications</span>
                {unread > 0 && (
                  <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-200">
                    {unread}
                  </span>
                )}
              </div>
              {unread > 0 && (
                <button onClick={markAll}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-cyan-300 transition-colors hover:bg-cyan-500/10 hover:text-cyan-200">
                  <CheckCheck className="h-3 w-3" /> Mark all read
                </button>
              )}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {!data || data.notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15">
                    <CheckCircle className="h-5 w-5 text-emerald-300" />
                  </div>
                  <p className="text-sm text-ink-100">All caught up</p>
                  <p className="mt-0.5 text-xs text-ink-300">No unread notifications</p>
                </div>
              ) : (
                <ul className="divide-y divide-white/5">
                  {data.notifications.map((n, i) => {
                    const tone = SEV_TONE[n.severity] ?? SEV_TONE.routine;
                    return (
                      <motion.li
                        key={n.id}
                        initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04 }}
                        onClick={() => { markRead(n.id); setOpen(false); router.push(`/dashboard/doctor/patients/${n.patient_id}`); }}
                        className={`cursor-pointer px-4 py-3 transition-colors hover:bg-white/5 ${!n.is_read ? `ring-inset ring-1 ${tone.ring}` : ""}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/5">
                            {tone.icon}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-xs font-semibold text-ink-50">{n.title}</span>
                              <span className="whitespace-nowrap text-[10px] text-ink-300">{n.time_ago}</span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5">
                              <span className={`rounded-full border px-1.5 py-px text-[9px] font-semibold uppercase ${tone.chip}`}>
                                {n.severity}
                              </span>
                              <p className="truncate text-[11px] text-ink-300">{n.patient_name}</p>
                            </div>
                            <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-ink-200">
                              {n.message}
                            </p>
                          </div>
                        </div>
                      </motion.li>
                    );
                  })}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
