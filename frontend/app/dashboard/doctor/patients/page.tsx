"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/lib/api";
import { toastError, toastSuccess } from "@/lib/alerts";
import { Users, Plus, Eye, Mail, CheckCircle, XCircle, Copy, X } from "lucide-react";
import Link from "next/link";

interface Patient { id: string; full_name: string; email: string; phone: string | null; is_active: boolean; created_at: string; }
interface NewCreds { email: string; password: string; patient_code: string; full_name: string; }

export default function DoctorPatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newCreds, setNewCreds] = useState<NewCreds | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ full_name: "", phone: "", age: "", gender: "male" });
  const [creating, setCreating] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { const data = await apiFetch<Patient[]>("/doctor/patients"); setPatients(data); }
    catch {} finally { setLoading(false); }
  }

  async function createPatient() {
    if (!form.full_name.trim()) return;
    setCreating(true);
    try {
      const res = await apiFetch<any>("/doctor/patients/create", {
        method: "POST",
        body: JSON.stringify({ full_name: form.full_name, phone: form.phone || null, age: form.age ? parseInt(form.age) : null, gender: form.gender }),
      });
      setNewCreds({ email: res.email, password: res.password, patient_code: res.patient_code, full_name: res.full_name });
      setShowModal(false);
      setForm({ full_name: "", phone: "", age: "", gender: "male" });
      load();
    } catch (e: any) { toastError("Could not create patient", e.message); }
    finally { setCreating(false); }
  }

  const filtered = patients.filter(p =>
    p.full_name?.toLowerCase().includes(search.toLowerCase()) || p.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
          <Users className="w-5 h-5 text-teal-400" />My Patients
          <span className="text-sm font-normal text-gray-500 ml-1">({patients.length})</span>
        </h2>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/30 px-4 py-2 rounded-lg text-sm font-medium transition-all">
          <Plus className="w-4 h-4" />New Patient
        </button>
      </div>

      {/* Credentials banner */}
      {newCreds && (
        <div className="glass border border-teal-500/30 bg-teal-500/10 p-5 relative">
          <button onClick={() => setNewCreds(null)} className="absolute top-3 right-3 text-gray-500 hover:text-gray-300"><X className="w-4 h-4" /></button>
          <p className="text-teal-300 font-semibold text-sm mb-3">✅ Patient created — share these credentials with <strong>{newCreds.full_name}</strong></p>
          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            {[["Email (Login)", newCreds.email], ["Password (One-time)", newCreds.password]].map(([label, val]) => (
              <div key={label} className="glass-sm p-3">
                <p className="text-gray-500 mb-1">{label}</p>
                <p className="text-gray-100 flex items-center gap-2">
                  <span className={label.includes("Password") ? "text-green-400 font-bold" : ""}>{val}</span>
                  <button onClick={() => { navigator.clipboard.writeText(val); toastSuccess("Copied"); }}><Copy className="w-3 h-3 text-gray-500 hover:text-gray-300" /></button>
                </p>
              </div>
            ))}
          </div>
          <p className="text-amber-400/80 text-xs mt-2">⚠️ Save this password now — it won&apos;t be shown again.</p>
        </div>
      )}

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email…"
        className="w-full glass-sm px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 rounded-lg border border-gray-800 focus:border-teal-500/50 outline-none" />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{[1,2,3].map(i => <div key={i} className="skeleton h-36 rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="glass p-12 text-center text-gray-500">
          <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No patients yet. Click &ldquo;New Patient&rdquo; to create one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(p => (
            <div key={p.id} className="glass p-5 flex flex-col gap-3 hover:border-teal-500/20 transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-gray-100">{p.full_name}</p>
                  <p className="text-xs text-gray-500 mt-0.5 font-mono">{p.id.slice(0,8).toUpperCase()}</p>
                </div>
                {p.is_active ? <CheckCircle className="w-4 h-4 text-green-400 shrink-0" /> : <XCircle className="w-4 h-4 text-red-400 shrink-0" />}
              </div>
              <p className="text-xs text-gray-500 flex items-center gap-1.5"><Mail className="w-3 h-3" />{p.email}</p>
              <p className="text-xs text-gray-600">Added {p.created_at ? new Date(p.created_at).toLocaleDateString("en-PK") : "—"}</p>
              <Link href={`/dashboard/doctor/patients/${p.id}`}
                className="mt-auto flex items-center justify-center gap-1.5 text-xs text-teal-400 hover:text-teal-300 border border-teal-500/20 hover:border-teal-500/40 rounded-lg py-1.5 transition-all">
                <Eye className="w-3.5 h-3.5" />View Full Record
              </Link>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
      {showModal && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowModal(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            onClick={e => e.stopPropagation()}
            className="glass-hi max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-100 flex items-center gap-2"><Plus className="w-4 h-4 text-teal-400" />Create New Patient</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-300"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-gray-500">System auto-generates login credentials to share with the patient.</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Full Name *</label>
                <input value={form.full_name} onChange={e => setForm(f => ({...f, full_name: e.target.value}))} placeholder="e.g. Ali Raza"
                  className="w-full glass-sm px-3 py-2 text-sm text-gray-200 rounded-lg border border-gray-700 focus:border-teal-500/50 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Phone</label>
                  <input value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} placeholder="+92 3xx…"
                    className="w-full glass-sm px-3 py-2 text-sm text-gray-200 rounded-lg border border-gray-700 focus:border-teal-500/50 outline-none" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Age</label>
                  <input type="number" value={form.age} onChange={e => setForm(f => ({...f, age: e.target.value}))} placeholder="e.g. 35"
                    className="w-full glass-sm px-3 py-2 text-sm text-gray-200 rounded-lg border border-gray-700 focus:border-teal-500/50 outline-none" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Gender</label>
                <select value={form.gender} onChange={e => setForm(f => ({...f, gender: e.target.value}))}
                  className="w-full glass-sm px-3 py-2 text-sm text-gray-200 rounded-lg border border-gray-700 focus:border-teal-500/50 outline-none bg-gray-900">
                  <option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2 text-sm text-gray-400 glass-sm rounded-lg border border-gray-700 hover:text-gray-200 transition-colors">Cancel</button>
              <button onClick={createPatient} disabled={creating || !form.full_name.trim()}
                className="btn-primary flex-1">
                {creating ? "Creating…" : "Create Patient"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
