"use client";
import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getAuth } from "@/lib/auth";
import { toastError } from "@/lib/alerts";
import { FlaskConical, Plus, X, AlertTriangle, CheckCircle, XCircle, Upload, Brain, Loader2 } from "lucide-react";

interface Patient { id: string; full_name: string; }
interface LabValue { test_name: string; value: number | null; unit: string; reference_low: number | null; reference_high: number | null; status: string; }
interface LabReport { id: string; patient_id: string; result_status: string; doctor_note: string; uploaded_at: string; lab_values: LabValue[]; }
interface AIFinding { test: string; value: string; status: string; clinical_note: string; }
interface AIAnalysis {
  overall_status?: string; summary?: string;
  key_findings?: AIFinding[]; red_flags?: string[];
  recommendations?: string[]; disclaimer?: string; error?: string;
}

const STATUS_ICON: Record<string, JSX.Element> = {
  normal: <CheckCircle className="w-3.5 h-3.5 text-green-400"/>,
  abnormal: <AlertTriangle className="w-3.5 h-3.5 text-amber-400"/>,
  critical: <XCircle className="w-3.5 h-3.5 text-red-400"/>,
};
const STATUS_COLOR: Record<string, string> = {
  normal: "text-green-400", abnormal: "text-amber-400", critical: "text-red-400",
  high: "text-red-400", low: "text-blue-400",
};

function apiFetch(path: string, opts: RequestInit = {}) {
  const auth = getAuth();
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";
  return fetch(`${base}${path}`, {
    ...opts,
    headers: { ...(opts.headers || {}), Authorization: `Bearer ${auth?.access_token || ""}` },
  });
}

export default function DoctorLabReportsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [reports, setReports] = useState<LabReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [activeTab, setActiveTab] = useState<"list" | "upload">("list");

  // Upload state
  const [uploadPatient, setUploadPatient] = useState("");
  const [uploadNote, setUploadNote] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [aiResult, setAiResult] = useState<{ ai_analysis: AIAnalysis; result_status: string; filename: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Manual form
  const [form, setForm] = useState({ patient_id: "", result_status: "normal", doctor_note: "" });
  const [values, setValues] = useState<LabValue[]>([{ test_name: "", value: null, unit: "", reference_low: null, reference_high: null, status: "normal" }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch("/doctor/patients").then(r => r.json()).then(setPatients).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    apiFetch(`/lab-reports/${selected}`).then(r => r.json()).then(setReports).catch(() => setReports([])).finally(() => setLoading(false));
  }, [selected]);

  async function handleFileUpload() {
    if (!uploadFile || !uploadPatient) return;
    setUploading(true);
    setAiResult(null);
    try {
      const auth = getAuth();
      const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";
      const fd = new FormData();
      fd.append("patient_id", uploadPatient);
      fd.append("file", uploadFile);
      if (uploadNote) fd.append("doctor_note", uploadNote);

      const res = await fetch(`${base}/lab-reports/upload-analyze`, {
        method: "POST",
        headers: { Authorization: `Bearer ${auth?.access_token || ""}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Upload failed");
      setAiResult({ ai_analysis: data.ai_analysis, result_status: data.result_status, filename: data.filename });
      // Refresh list if same patient selected
      if (selected === uploadPatient) {
        const r = await apiFetch(`/lab-reports/${selected}`);
        setReports(await r.json());
      }
    } catch (e: unknown) { toastError("Something went wrong", e instanceof Error ? e.message : "Unknown error"); }
    finally { setUploading(false); }
  }

  function addValueRow() {
    setValues(v => [...v, { test_name: "", value: null, unit: "", reference_low: null, reference_high: null, status: "normal" }]);
  }
  function updateValue(i: number, field: string, val: unknown) {
    setValues(v => v.map((row, idx) => idx === i ? { ...row, [field]: val } : row));
  }

  async function submitManual() {
    if (!form.patient_id) return;
    setSaving(true);
    try {
      const auth = getAuth();
      const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";
      const res = await fetch(`${base}/lab-reports/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth?.access_token || ""}` },
        body: JSON.stringify({ patient_id: form.patient_id, result_status: form.result_status, doctor_note: form.doctor_note, lab_values: values.filter(v => v.test_name.trim()) }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail); }
      setShowManualModal(false);
      if (selected === form.patient_id) {
        const r = await apiFetch(`/lab-reports/${selected}`);
        setReports(await r.json());
      }
    } catch (e: unknown) { toastError("Something went wrong", e instanceof Error ? e.message : "Unknown error"); } finally { setSaving(false); }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-amber-400"/>Lab Reports
        </h2>
        <div className="flex gap-2">
          <button onClick={() => setActiveTab("upload")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all ${activeTab === "upload" ? "bg-purple-500/20 text-purple-300 border-purple-500/30" : "text-gray-400 glass-sm border-gray-700 hover:text-gray-200"}`}>
            <Upload className="w-4 h-4"/>Upload & AI Analyze
          </button>
          <button onClick={() => { setForm({ patient_id: selected, result_status: "normal", doctor_note: "" }); setValues([{ test_name: "", value: null, unit: "", reference_low: null, reference_high: null, status: "normal" }]); setShowManualModal(true); }}
            className="flex items-center gap-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 px-4 py-2 rounded-lg text-sm font-medium transition-all">
            <Plus className="w-4 h-4"/>Manual Entry
          </button>
        </div>
      </div>

      {/* Upload & AI Analyze Tab */}
      {activeTab === "upload" && (
        <div className="glass p-6 space-y-5">
          <div className="flex items-center gap-2 mb-1">
            <Brain className="w-4 h-4 text-purple-400"/>
            <h3 className="text-sm font-semibold text-gray-200">Upload Lab Report — AI Analysis</h3>
            <span className="text-[10px] bg-purple-500/15 text-purple-300 border border-purple-500/20 px-2 py-0.5 rounded-full">Powered by Gemini</span>
          </div>
          <p className="text-xs text-gray-500">Upload a PDF, DOCX, TXT, or CSV lab report. Gemini will extract and interpret the findings, flag abnormals, and suggest follow-up actions.</p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="lab-upload-patient" className="block mb-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-300">
                Patient *
              </label>
              <select
                id="lab-upload-patient"
                value={uploadPatient}
                onChange={e => setUploadPatient(e.target.value)}
                className="input"
              >
                <option value="">— Select a patient —</option>
                {patients.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Doctor&apos;s Note (optional)</label>
              <input value={uploadNote} onChange={e => setUploadNote(e.target.value)} placeholder="Clinical context or special concerns…"
                className="w-full glass-sm px-3 py-2 text-sm text-gray-200 rounded-lg border border-gray-700 focus:border-purple-500/50 outline-none"/>
            </div>
          </div>

          {/* Drop zone */}
          <motion.div
            whileHover={{ scale: 1.003 }}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300 ${uploadFile ? "border-violet-400/70 bg-violet-400/5 shadow-glow-violet" : "border-white/10 hover:border-violet-400/40 hover:bg-violet-400/5"}`}>
            <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.csv" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) setUploadFile(f); }}/>
            {uploadFile ? (
              <div className="flex items-center justify-center gap-3">
                <FileText className="w-6 h-6 text-purple-400"/>
                <div className="text-left">
                  <p className="text-sm text-gray-200 font-medium">{uploadFile.name}</p>
                  <p className="text-xs text-gray-500">{(uploadFile.size / 1024).toFixed(1)} KB</p>
                </div>
                <button onClick={e => { e.stopPropagation(); setUploadFile(null); setAiResult(null); }} className="ml-4 text-gray-500 hover:text-red-400"><X className="w-4 h-4"/></button>
              </div>
            ) : (
              <>
                <Upload className="w-8 h-8 text-ink-200 mx-auto mb-2"/>
                <p className="text-sm text-ink-50">Click to choose a file</p>
                <p className="text-xs text-ink-300 mt-1">PDF, DOCX, TXT, CSV — max 5MB</p>
              </>
            )}
          </motion.div>

          <button onClick={handleFileUpload} disabled={uploading || !uploadFile || !uploadPatient}
            className="w-full py-3 font-semibold text-sm bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {uploading ? <><Loader2 className="w-4 h-4 animate-spin"/>Analyzing with Gemini AI…</> : <><Brain className="w-4 h-4"/>Upload & Analyze</>}
          </button>

          {/* AI Result */}
          {aiResult && (
            <div className="space-y-4 pt-2 border-t border-gray-800">
              <div className="flex items-center gap-3">
                <span className={`text-sm font-semibold flex items-center gap-1.5 ${STATUS_COLOR[aiResult.result_status] || "text-gray-400"}`}>
                  {STATUS_ICON[aiResult.result_status]}
                  {aiResult.result_status?.toUpperCase()}
                </span>
                <span className="text-xs text-gray-600">{aiResult.filename}</span>
                <span className="ml-auto text-xs bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full">✓ Saved to patient record</span>
              </div>

              {aiResult.ai_analysis?.error ? (
                <div className="glass-sm p-4 border border-amber-500/20">
                  <p className="text-amber-400 text-sm">⚠️ AI analysis unavailable: {aiResult.ai_analysis.error}</p>
                  <p className="text-xs text-gray-500 mt-1">The report was still saved. Add GEMINI_API_KEY to .env for AI analysis.</p>
                </div>
              ) : (
                <>
                  {aiResult.ai_analysis?.summary && (
                    <div className="glass-sm p-4">
                      <p className="text-xs text-gray-500 mb-1 font-semibold uppercase tracking-wider">AI Summary</p>
                      <p className="text-sm text-gray-200">{aiResult.ai_analysis.summary}</p>
                    </div>
                  )}

                  {aiResult.ai_analysis?.key_findings && aiResult.ai_analysis.key_findings.length > 0 && (
                    <div className="glass-sm p-4">
                      <p className="text-xs text-gray-500 mb-2 font-semibold uppercase tracking-wider">Key Findings</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead><tr className="text-gray-600 border-b border-gray-800">
                            {["Test","Value","Status","Interpretation"].map(h => <th key={h} className="text-left py-1.5 pr-4">{h}</th>)}
                          </tr></thead>
                          <tbody className="divide-y divide-gray-800/30">
                            {aiResult.ai_analysis.key_findings.map((f, i) => (
                              <tr key={i}>
                                <td className="py-1.5 pr-4 text-gray-300 font-medium">{f.test}</td>
                                <td className="py-1.5 pr-4 text-white font-semibold">{f.value}</td>
                                <td className="py-1.5 pr-4">
                                  <span className={`font-semibold ${STATUS_COLOR[f.status] || "text-gray-400"}`}>{f.status}</span>
                                </td>
                                <td className="py-1.5 pr-4 text-gray-500">{f.clinical_note}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {aiResult.ai_analysis?.red_flags && aiResult.ai_analysis.red_flags.length > 0 && (
                    <div className="glass-sm p-4 border border-red-500/20">
                      <p className="text-xs text-red-400 mb-2 font-semibold uppercase tracking-wider flex items-center gap-1.5"><AlertTriangle className="w-3 h-3"/>Red Flags</p>
                      <ul className="space-y-1">{aiResult.ai_analysis.red_flags.map((f, i) => <li key={i} className="text-xs text-red-300 flex gap-2"><span>•</span>{f}</li>)}</ul>
                    </div>
                  )}

                  {aiResult.ai_analysis?.recommendations && aiResult.ai_analysis.recommendations.length > 0 && (
                    <div className="glass-sm p-4 border border-teal-500/20">
                      <p className="text-xs text-teal-400 mb-2 font-semibold uppercase tracking-wider">Recommendations</p>
                      <ul className="space-y-1">{aiResult.ai_analysis.recommendations.map((r, i) => <li key={i} className="text-xs text-teal-300 flex gap-2"><span>→</span>{r}</li>)}</ul>
                    </div>
                  )}

                  {aiResult.ai_analysis?.disclaimer && (
                    <p className="text-[10px] text-gray-600 italic">{aiResult.ai_analysis.disclaimer}</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Patient Selector + List */}
      {activeTab === "list" && (
        <>
          <div className="glass-sm p-4 flex items-center gap-4">
            <label className="text-sm text-gray-400 whitespace-nowrap">Select Patient:</label>
            <select value={selected} onChange={e => setSelected(e.target.value)}
              className="flex-1 bg-gray-900 text-gray-200 text-sm px-3 py-2 rounded-lg border border-gray-700 focus:border-amber-500/50 outline-none">
              <option value="">— choose a patient —</option>
              {patients.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </div>

          {!selected ? (
            <div className="glass p-12 text-center text-gray-500">
              <FlaskConical className="w-10 h-10 mx-auto mb-2 opacity-30"/>
              <p className="text-sm">Select a patient to view their lab reports.</p>
            </div>
          ) : loading ? (
            <div className="space-y-2">{[1,2].map(i=><div key={i} className="skeleton h-20 rounded-xl"/>)}</div>
          ) : reports.length === 0 ? (
            <div className="glass p-12 text-center text-gray-500">
              <FlaskConical className="w-10 h-10 mx-auto mb-2 opacity-30"/>
              <p className="text-sm">No lab reports yet.</p>
              <button onClick={() => setActiveTab("upload")} className="mt-3 text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 mx-auto">
                <Upload className="w-3 h-3"/>Upload a report file
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map(r => (
                <div key={r.id} className="glass p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {STATUS_ICON[r.result_status] || null}
                      <span className="text-sm font-semibold text-gray-200 capitalize">{r.result_status}</span>
                    </div>
                    <p className="text-xs text-gray-500">{r.uploaded_at ? new Date(r.uploaded_at).toLocaleDateString("en-PK") : "—"}</p>
                  </div>
                  {r.doctor_note && <p className="text-sm text-gray-400">{r.doctor_note}</p>}
                  {r.lab_values?.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="text-gray-600 border-b border-gray-800">
                          {["Test","Value","Unit","Ref Low","Ref High","Status"].map(h=><th key={h} className="text-left py-1.5 pr-4">{h}</th>)}
                        </tr></thead>
                        <tbody className="divide-y divide-gray-800/30">
                          {r.lab_values.map((v,i) => (
                            <tr key={i}>
                              <td className="py-1.5 pr-4 text-gray-300 font-medium">{v.test_name}</td>
                              <td className="py-1.5 pr-4 text-white font-semibold">{v.value ?? "—"}</td>
                              <td className="py-1.5 pr-4 text-gray-500">{v.unit||"—"}</td>
                              <td className="py-1.5 pr-4 text-gray-500">{v.reference_low??"—"}</td>
                              <td className="py-1.5 pr-4 text-gray-500">{v.reference_high??"—"}</td>
                              <td className="py-1.5"><span className={STATUS_COLOR[v.status]||"text-gray-400"}>{v.status}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Manual Entry Modal */}
      <AnimatePresence>
      {showManualModal && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowManualModal(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            onClick={e => e.stopPropagation()}
            className="glass-hi max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-100 flex items-center gap-2"><FlaskConical className="w-4 h-4 text-amber-400"/>Manual Lab Entry</h3>
              <button onClick={() => setShowManualModal(false)} className="text-gray-500 hover:text-gray-300"><X className="w-4 h-4"/></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Patient *</label>
                <select value={form.patient_id} onChange={e => setForm(f=>({...f, patient_id: e.target.value}))}
                  className="w-full bg-gray-900 text-gray-200 text-sm px-3 py-2 rounded-lg border border-gray-700 outline-none">
                  <option value="">Select patient</option>
                  {patients.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Overall Result</label>
                <select value={form.result_status} onChange={e => setForm(f=>({...f, result_status: e.target.value}))}
                  className="w-full bg-gray-900 text-gray-200 text-sm px-3 py-2 rounded-lg border border-gray-700 outline-none">
                  <option value="normal">Normal</option><option value="abnormal">Abnormal</option><option value="critical">Critical</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Doctor&apos;s Note</label>
              <textarea value={form.doctor_note} onChange={e => setForm(f=>({...f, doctor_note: e.target.value}))} rows={2}
                className="w-full glass-sm px-3 py-2 text-sm text-gray-200 rounded-lg border border-gray-700 focus:border-amber-500/50 outline-none resize-none"/>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-gray-400">Lab Values</label>
                <button onClick={addValueRow} className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1"><Plus className="w-3 h-3"/>Add Row</button>
              </div>
              {values.map((v, i) => (
                <div key={i} className="grid grid-cols-6 gap-2">
                  {[["Test Name","test_name","text"],["Value","value","number"],["Unit","unit","text"],["Ref Low","reference_low","number"],["Ref High","reference_high","number"]].map(([ph, field, type]) => (
                    <input key={String(field)} type={String(type)} placeholder={String(ph)}
                      value={(v[field as keyof LabValue] ?? "") as string | number}
                      onChange={e => updateValue(i, String(field), type === "number" ? (e.target.value ? parseFloat(e.target.value) : null) : e.target.value)}
                      className="glass-sm px-2 py-1.5 text-xs text-gray-200 rounded-lg border border-gray-700 outline-none"/>
                  ))}
                  <select value={v.status} onChange={e => updateValue(i, "status", e.target.value)}
                    className="bg-gray-900 text-gray-200 text-xs px-2 py-1.5 rounded-lg border border-gray-700 outline-none">
                    <option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option><option value="critical">Critical</option>
                  </select>
                </div>
              ))}
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowManualModal(false)} className="flex-1 py-2 text-sm text-gray-400 glass-sm rounded-lg border border-gray-700 hover:text-gray-200">Cancel</button>
              <button onClick={submitManual} disabled={saving || !form.patient_id}
                className="flex-1 py-2 text-sm font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-lg disabled:opacity-50">
                {saving ? "Saving…" : "Save Lab Report"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
