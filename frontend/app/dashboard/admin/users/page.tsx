"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/lib/api";
import {
  Users, CheckCircle, XCircle, Key, X, Eye, EyeOff,
  Stethoscope, UserPlus, RefreshCw, Link2
} from "lucide-react";

interface UserRow {
  id: string; email: string; role: string; full_name: string;
  specialization?: string; is_active: boolean; created_at: string;
  assigned_doctor_id?: string;
}
interface Doctor {
  id: string; full_name: string; email: string; specialization?: string;
  is_active: boolean; patient_count: number; created_at: string;
}

const ROLE_BADGE: Record<string, string> = {
  admin: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  doctor: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  patient: "bg-teal-500/15 text-teal-300 border-teal-500/30",
};

type Tab = "users" | "doctors";

export default function AdminUsersPage() {
  const [tab, setTab] = useState<Tab>("users");

  // ── Users tab state ──────────────────────────────────────────────────────
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [resetting, setResetting] = useState<string | null>(null);
  const [resetModal, setResetModal] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [resetMsg, setResetMsg] = useState("");

  // ── Assign patient modal ──────────────────────────────────────────────────
  const [assignModal, setAssignModal] = useState<UserRow | null>(null);
  const [assignDoctorId, setAssignDoctorId] = useState("");
  const [assignMsg, setAssignMsg] = useState("");
  const [assigning, setAssigning] = useState(false);

  // ── Doctors tab state ─────────────────────────────────────────────────────
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorsLoading, setDoctorsLoading] = useState(false);
  const [showCreateDoctor, setShowCreateDoctor] = useState(false);
  const [drForm, setDrForm] = useState({ full_name: "", email: "", password: "", specialization: "", phone: "" });
  const [drSaving, setDrSaving] = useState(false);
  const [drMsg, setDrMsg] = useState("");

  useEffect(() => { loadUsers(); }, []);
  useEffect(() => { if (tab === "doctors") loadDoctors(); }, [tab]);

  async function loadUsers() {
    setLoading(true);
    try { setUsers(await apiFetch<UserRow[]>("/admin/users")); }
    catch {} finally { setLoading(false); }
  }

  async function loadDoctors() {
    setDoctorsLoading(true);
    try { setDoctors(await apiFetch<Doctor[]>("/admin/doctors")); }
    catch {} finally { setDoctorsLoading(false); }
  }

  async function toggle(user: UserRow) {
    await apiFetch("/admin/users/toggle", {
      method: "POST",
      body: JSON.stringify({ user_id: user.id, is_active: !user.is_active }),
    });
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_active: !u.is_active } : u));
  }

  async function resetPassword() {
    if (!resetModal || newPassword.length < 6) return;
    setResetting(resetModal.id);
    try {
      await apiFetch("/admin/users/reset-password", {
        method: "POST",
        body: JSON.stringify({ user_id: resetModal.id, new_password: newPassword }),
      });
      setResetMsg(`✅ Password reset for ${resetModal.email}`);
      setNewPassword("");
      setTimeout(() => { setResetModal(null); setResetMsg(""); }, 2000);
    } catch (e: any) { setResetMsg(`❌ ${e.message}`); }
    finally { setResetting(null); }
  }

  async function assignPatient() {
    if (!assignModal) return;
    setAssigning(true);
    try {
      await apiFetch("/admin/assign-patient", {
        method: "POST",
        body: JSON.stringify({ patient_id: assignModal.id, doctor_id: assignDoctorId }),
      });
      setAssignMsg("✅ Patient assigned successfully");
      await loadUsers();
      setTimeout(() => { setAssignModal(null); setAssignMsg(""); }, 1500);
    } catch (e: any) { setAssignMsg(`❌ ${e.message}`); }
    finally { setAssigning(false); }
  }

  async function createDoctor() {
    if (!drForm.full_name || !drForm.email || drForm.password.length < 6) return;
    setDrSaving(true); setDrMsg("");
    try {
      await apiFetch("/admin/users/create-doctor", {
        method: "POST",
        body: JSON.stringify(drForm),
      });
      setDrMsg("✅ Doctor account created");
      setDrForm({ full_name: "", email: "", password: "", specialization: "", phone: "" });
      await loadDoctors();
      setTimeout(() => { setShowCreateDoctor(false); setDrMsg(""); }, 2000);
    } catch (e: any) { setDrMsg(`❌ ${e.message}`); }
    finally { setDrSaving(false); }
  }

  const doctorList = users.filter(u => u.role === "doctor");
  const filtered = users
    .filter(u => roleFilter === "all" || u.role === roleFilter)
    .filter(u =>
      u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase())
    );
  const counts = { all: users.length, admin: 0, doctor: 0, patient: 0 };
  users.forEach(u => { if (u.role in counts) counts[u.role as keyof typeof counts]++; });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
          <Users className="w-5 h-5 text-purple-400" />User Management
        </h2>
        <div className="flex gap-2">
          <button onClick={() => { setTab("users"); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === "users" ? "bg-purple-500/20 text-purple-300 border border-purple-500/30" : "glass-sm text-gray-400 hover:text-gray-200"}`}>
            All Users
          </button>
          <button onClick={() => setTab("doctors")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === "doctors" ? "bg-blue-500/20 text-blue-300 border border-blue-500/30" : "glass-sm text-gray-400 hover:text-gray-200"}`}>
            <Stethoscope className="w-4 h-4" />Doctors
          </button>
        </div>
      </div>

      {/* ── USERS TAB ─────────────────────────────────────────────────────── */}
      {tab === "users" && (
        <>
          <div className="flex gap-2 flex-wrap">
            {(["all", "admin", "doctor", "patient"] as const).map(r => (
              <button key={r} onClick={() => setRoleFilter(r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                  roleFilter === r ? "bg-purple-500/20 text-purple-300 border border-purple-500/30" : "text-gray-500 hover:text-gray-300 glass-sm"
                }`}>
                {r} ({counts[r === "all" ? "all" : r]})
              </button>
            ))}
          </div>

          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full glass-sm px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 rounded-lg border border-gray-800 focus:border-purple-500/50 outline-none" />

          <div className="glass overflow-hidden">
            {loading ? (
              <div className="p-4 space-y-2">{[1,2,3].map(i => <div key={i} className="skeleton h-14" />)}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 uppercase tracking-wider bg-gray-900/50">
                      {["Name / Email", "Role", "Details", "Status", "Created", "Actions"].map(h => (
                        <th key={h} className="text-left px-4 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/50">
                    {filtered.map(u => {
                      const assignedDr = doctorList.find(d => d.id === u.assigned_doctor_id);
                      return (
                        <tr key={u.id} className="hover:bg-gray-800/20">
                          <td className="px-4 py-3">
                            <p className="text-gray-200 text-sm font-medium">{u.full_name || "—"}</p>
                            <p className="text-gray-500 text-xs">{u.email}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize ${ROLE_BADGE[u.role] || "text-gray-400 border-gray-700"}`}>
                              {u.role}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {u.role === "doctor" && u.specialization && <span className="text-blue-400">{u.specialization}</span>}
                            {u.role === "patient" && (
                              assignedDr
                                ? <span className="text-teal-400">{assignedDr.full_name}</span>
                                : <span className="text-gray-600 italic">Unassigned</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {u.is_active
                              ? <span className="flex items-center gap-1 text-green-400 text-xs"><CheckCircle className="w-3.5 h-3.5" />Active</span>
                              : <span className="flex items-center gap-1 text-red-400 text-xs"><XCircle className="w-3.5 h-3.5" />Inactive</span>}
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">
                            {u.created_at ? new Date(u.created_at).toLocaleDateString("en-PK") : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <button onClick={() => toggle(u)} title={u.is_active ? "Deactivate" : "Activate"}
                                className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-all ${
                                  u.is_active ? "text-red-400 border-red-500/20 hover:bg-red-500/10" : "text-green-400 border-green-500/20 hover:bg-green-500/10"
                                }`}>
                                {u.is_active ? "Deactivate" : "Activate"}
                              </button>
                              <button onClick={() => { setResetModal(u); setNewPassword(""); setResetMsg(""); }}
                                title="Reset Password"
                                className="text-amber-400/70 hover:text-amber-400 transition-colors p-1.5 glass-sm rounded-lg border border-amber-500/10 hover:border-amber-500/30">
                                <Key className="w-3.5 h-3.5" />
                              </button>
                              {u.role === "patient" && (
                                <button onClick={() => { setAssignModal(u); setAssignDoctorId(u.assigned_doctor_id || ""); setAssignMsg(""); }}
                                  title="Assign to Doctor"
                                  className="text-teal-400/70 hover:text-teal-400 transition-colors p-1.5 glass-sm rounded-lg border border-teal-500/10 hover:border-teal-500/30">
                                  <Link2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── DOCTORS TAB ────────────────────────────────────────────────────── */}
      {tab === "doctors" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">{doctors.length} doctor{doctors.length !== 1 ? "s" : ""} registered</p>
            <div className="flex gap-2">
              <button onClick={loadDoctors} className="p-2 glass-sm rounded-lg text-gray-500 hover:text-gray-300 border border-gray-700">
                <RefreshCw className="w-4 h-4" />
              </button>
              <button onClick={() => setShowCreateDoctor(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30 rounded-lg text-sm font-medium transition-all">
                <UserPlus className="w-4 h-4" />Add Doctor
              </button>
            </div>
          </div>

          {doctorsLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="skeleton h-20 rounded-xl" />)}</div>
          ) : doctors.length === 0 ? (
            <div className="glass p-12 text-center text-gray-500">
              <Stethoscope className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No doctors added yet. Click "Add Doctor" to create one.</p>
            </div>
          ) : (
            <div className="glass overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase tracking-wider bg-gray-900/50">
                    {["Doctor", "Specialization", "Patients", "Status", "Created"].map(h => (
                      <th key={h} className="text-left px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {doctors.map(d => (
                    <tr key={d.id} className="hover:bg-gray-800/20">
                      <td className="px-4 py-3">
                        <p className="text-gray-200 font-medium">{d.full_name}</p>
                        <p className="text-gray-500 text-xs">{d.email}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-blue-400">{d.specialization || <span className="text-gray-600">—</span>}</td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-bold text-gray-200">{d.patient_count}</span>
                        <span className="text-xs text-gray-500 ml-1">patients</span>
                      </td>
                      <td className="px-4 py-3">
                        {d.is_active
                          ? <span className="text-green-400 text-xs flex items-center gap-1"><CheckCircle className="w-3 h-3" />Active</span>
                          : <span className="text-red-400 text-xs flex items-center gap-1"><XCircle className="w-3 h-3" />Inactive</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {d.created_at ? new Date(d.created_at).toLocaleDateString("en-PK") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Password Reset Modal ──────────────────────────────────────────── */}
      <AnimatePresence>
      {resetModal && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setResetModal(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            onClick={e => e.stopPropagation()}
            className="glass-hi max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-100 flex items-center gap-2"><Key className="w-4 h-4 text-amber-400" />Reset Password</h3>
              <button onClick={() => setResetModal(null)} className="text-gray-500 hover:text-gray-300"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-gray-500">Setting password for <span className="text-gray-300 font-medium">{resetModal.email}</span></p>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">New Password (min 6 chars)</label>
              <div className="relative">
                <input type={showPw ? "text" : "password"} value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full glass-sm px-3 py-2 pr-9 text-sm text-gray-200 rounded-lg border border-gray-700 focus:border-amber-500/50 outline-none" />
                <button onClick={() => setShowPw(s => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {resetMsg && <p className={`text-xs font-medium ${resetMsg.startsWith("✅") ? "text-green-400" : "text-red-400"}`}>{resetMsg}</p>}
            <div className="flex gap-3">
              <button onClick={() => setResetModal(null)} className="flex-1 py-2 text-sm text-gray-400 glass-sm rounded-lg border border-gray-700 hover:text-gray-200">Cancel</button>
              <button onClick={resetPassword} disabled={!!resetting || newPassword.length < 6}
                className="flex-1 py-2 text-sm font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-lg disabled:opacity-50">
                {resetting ? "Resetting…" : "Reset Password"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* ── Assign Patient Modal ──────────────────────────────────────────── */}
      <AnimatePresence>
      {assignModal && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setAssignModal(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            onClick={e => e.stopPropagation()}
            className="glass-hi max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-100 flex items-center gap-2"><Link2 className="w-4 h-4 text-teal-400" />Assign Patient</h3>
              <button onClick={() => setAssignModal(null)} className="text-gray-500 hover:text-gray-300"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-gray-500">Assigning <span className="text-gray-300 font-medium">{assignModal.full_name}</span> to a doctor</p>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Select Doctor</label>
              <select value={assignDoctorId} onChange={e => setAssignDoctorId(e.target.value)}
                className="w-full bg-gray-900 text-gray-200 text-sm px-3 py-2 rounded-lg border border-gray-700 outline-none focus:border-teal-500/50">
                <option value="">— Unassign (no doctor) —</option>
                {doctorList.map(d => <option key={d.id} value={d.id}>{d.full_name} {d.specialization ? `(${d.specialization})` : ""}</option>)}
              </select>
            </div>
            {assignMsg && <p className={`text-xs font-medium ${assignMsg.startsWith("✅") ? "text-green-400" : "text-red-400"}`}>{assignMsg}</p>}
            <div className="flex gap-3">
              <button onClick={() => setAssignModal(null)} className="flex-1 py-2 text-sm text-gray-400 glass-sm rounded-lg border border-gray-700 hover:text-gray-200">Cancel</button>
              <button onClick={assignPatient} disabled={assigning}
                className="flex-1 py-2 text-sm font-semibold bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-500/30 rounded-lg disabled:opacity-50">
                {assigning ? "Saving…" : "Assign"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* ── Create Doctor Modal ───────────────────────────────────────────── */}
      <AnimatePresence>
      {showCreateDoctor && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowCreateDoctor(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            onClick={e => e.stopPropagation()}
            className="glass-hi max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-100 flex items-center gap-2"><Stethoscope className="w-4 h-4 text-blue-400" />Add New Doctor</h3>
              <button onClick={() => setShowCreateDoctor(false)} className="text-gray-500 hover:text-gray-300"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {[
                { label: "Full Name *", key: "full_name", placeholder: "Dr. Ahmed Khan" },
                { label: "Email Address *", key: "email", placeholder: "dr.ahmed@clinic.com" },
                { label: "Specialization", key: "specialization", placeholder: "Cardiologist, GP, etc." },
                { label: "Phone", key: "phone", placeholder: "+92 300 0000000" },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="text-xs text-gray-400 mb-1 block">{label}</label>
                  <input value={(drForm as any)[key]} onChange={e => setDrForm(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full glass-sm px-3 py-2 text-sm text-gray-200 rounded-lg border border-gray-700 focus:border-blue-500/50 outline-none" />
                </div>
              ))}
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Password * (min 6 chars)</label>
                <input type="password" value={drForm.password} onChange={e => setDrForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Set initial password"
                  className="w-full glass-sm px-3 py-2 text-sm text-gray-200 rounded-lg border border-gray-700 focus:border-blue-500/50 outline-none" />
              </div>
            </div>
            {drMsg && <p className={`text-xs font-medium ${drMsg.startsWith("✅") ? "text-green-400" : "text-red-400"}`}>{drMsg}</p>}
            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowCreateDoctor(false)} className="flex-1 py-2 text-sm text-gray-400 glass-sm rounded-lg border border-gray-700 hover:text-gray-200">Cancel</button>
              <button onClick={createDoctor} disabled={drSaving || !drForm.full_name || !drForm.email || drForm.password.length < 6}
                className="btn-primary flex-1">
                {drSaving ? "Creating…" : "Create Doctor"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
