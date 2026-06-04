"use client";
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch, apiUpload } from "@/lib/api";
import { useDropzone } from "react-dropzone";
import { alertConfirm, toastSuccess, toastError } from "@/lib/alerts";
import {
  Upload, FileText, Trash2, Eye, CheckCircle, Clock,
  AlertCircle, Loader2, X, File, User
} from "lucide-react";

interface Doc {
  id: string; filename: string; file_type: string;
  file_size: number; upload_date: string; chunk_count: number;
  status: string; patient_id?: string | null;
}

interface Patient {
  id: string; full_name: string;
}

const TYPE_COLORS: Record<string, string> = {
  pdf: "text-red-400 bg-red-900/20", docx: "text-blue-400 bg-blue-900/20",
  txt: "text-gray-400 bg-gray-800", csv: "text-green-400 bg-green-900/20",
};

function formatSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

export default function DoctorDocumentsPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [error, setError] = useState("");
  const [previewDoc, setPreviewDoc] = useState<Doc | null>(null);
  const [previewText, setPreviewText] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchDocs = useCallback(async () => {
    const data = await apiFetch<Doc[]>("/documents/").catch(() => []);
    setDocs(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDocs();
    // Fetch doctor's patient list
    apiFetch<Patient[]>("/doctor/patients").then(setPatients).catch(() => {});
  }, [fetchDocs]);

  const onDrop = useCallback(async (accepted: File[]) => {
    if (!accepted.length) return;
    const file = accepted[0];
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["pdf", "docx", "txt", "csv"].includes(ext)) { setError("Only PDF, DOCX, TXT, CSV supported."); return; }
    if (file.size > 10 * 1024 * 1024) { setError("Max file size is 10MB."); return; }
    setError(""); setUploading(true); setUploadStatus("Uploading…");
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (selectedPatient) fd.append("patient_id", selectedPatient);
      await apiUpload("/documents/upload", fd);
      setUploadStatus("Processing in background…");
      setTimeout(() => { setUploadStatus(""); setUploading(false); fetchDocs(); }, 2500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setUploading(false); setUploadStatus("");
    }
  }, [selectedPatient, fetchDocs]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, multiple: false,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "text/plain": [".txt"],
      "text/csv": [".csv"],
    },
  });

  async function deleteDoc(id: string, name: string) {
    const res = await alertConfirm({
      title: "Delete document?",
      text: `"${name}" and all its embeddings will be removed.`,
      icon: "warning",
      confirmText: "Delete",
      cancelText: "Keep it",
    });
    if (!res.isConfirmed) return;
    try {
      await apiFetch(`/documents/${id}`, { method: "DELETE" });
      setDocs(prev => prev.filter(d => d.id !== id));
      toastSuccess("Document deleted");
    } catch (e) {
      toastError("Delete failed", e instanceof Error ? e.message : "Please try again.");
    }
  }

  async function openPreview(doc: Doc) {
    setPreviewDoc(doc); setPreviewText("");
    const res = await apiFetch<{ preview_text: string }>(`/documents/${doc.id}/preview`);
    setPreviewText(res.preview_text);
  }

  // Build a quick lookup map: patient id → full_name
  const patientMap = Object.fromEntries(patients.map(p => [p.id, p.full_name]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-100">Document Manager</h2>
        <span className="text-sm text-gray-500">{docs.length} files indexed</span>
      </div>

      {/* Upload Panel */}
      <div className="glass p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-300">Upload Document</h3>

        {/* Patient Selector */}
        <div>
          <label htmlFor="doc-patient-select" className="block mb-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-300">
            Link to Patient <span className="text-ink-400 normal-case font-normal">(optional)</span>
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-300 pointer-events-none" />
            <select
              id="doc-patient-select"
              value={selectedPatient}
              onChange={e => setSelectedPatient(e.target.value)}
              className="input pl-10"
            >
              <option value="">— Not linked to a patient (general document) —</option>
              {patients.map(p => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          </div>
          <p className="mt-1 text-xs text-ink-300">
            Linking a document to a patient makes it searchable in their AI chat.
          </p>
        </div>

        {/* Drop Zone */}
        <motion.div
          whileHover={{ scale: 1.003 }}
          {...(getRootProps() as any)}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300
            ${isDragActive ? "border-cyan-400/70 bg-cyan-400/5 shadow-glow-cyan" : "border-white/10 hover:border-white/25"}`}
        >
          <input {...getInputProps()} />
          {uploading ? (
            <div className="space-y-2">
              <Loader2 className="w-8 h-8 mx-auto text-cyan-300 animate-spin" />
              <p className="text-sm text-cyan-200">{uploadStatus}</p>
            </div>
          ) : (
            <div className="space-y-2">
              <Upload className="w-8 h-8 mx-auto text-ink-200" />
              <p className="text-sm font-medium text-ink-50">{isDragActive ? "Drop file here" : "Drag & drop or click to upload"}</p>
              <p className="text-xs text-ink-300">PDF · DOCX · TXT · CSV — max 10MB</p>
            </div>
          )}
        </motion.div>
        {error && <p className="text-sm text-rose-300 flex items-center gap-1.5"><AlertCircle className="w-4 h-4" />{error}</p>}
      </div>

      {/* Documents Table */}
      <div className="glass overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-gray-300">All Documents</h3>
        </div>
        {loading ? (
          <div className="p-4 space-y-2">{[1, 2, 3].map(i => <div key={i} className="skeleton h-12" />)}</div>
        ) : docs.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <File className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No documents yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wider bg-gray-900/50">
                  {["Filename", "Type", "Size", "Patient", "Chunks", "Uploaded", "Status", "Actions"].map(h => (
                    <th key={h} className="text-left px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {docs.map(doc => (
                  <tr key={doc.id} className="hover:bg-gray-800/20 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-200 max-w-[160px] truncate">{doc.filename}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${TYPE_COLORS[doc.file_type] ?? "text-gray-400 bg-gray-800"}`}>
                        {doc.file_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{formatSize(doc.file_size)}</td>
                    <td className="px-4 py-3">
                      {doc.patient_id ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-900/30 text-blue-300 border border-blue-500/20">
                          <User className="w-3 h-3" />
                          {patientMap[doc.patient_id] || doc.patient_id}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-600 italic">General</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs font-mono">{doc.chunk_count}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{new Date(doc.upload_date).toLocaleDateString("en-PK")}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium flex items-center gap-1 ${doc.status === "ready" ? "text-green-400" : doc.status === "error" ? "text-red-400" : "text-amber-400"}`}>
                        {doc.status === "ready" ? <CheckCircle className="w-3 h-3" /> : doc.status === "error" ? <AlertCircle className="w-3 h-3" /> : <Clock className="w-3 h-3 animate-spin" />}
                        {doc.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => openPreview(doc)} className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors" title="Preview"><Eye className="w-4 h-4" /></button>
                        <button onClick={() => deleteDoc(doc.id, doc.filename)} className="p-1.5 rounded-lg hover:bg-rose-500/15 text-ink-300 hover:text-rose-300 transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Preview Modal */}
      <AnimatePresence>
        {previewDoc && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => { setPreviewDoc(null); setPreviewText(""); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="glass-hi w-full max-w-2xl max-h-[80vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                <h3 className="font-semibold text-ink-50">{previewDoc.filename}</h3>
                <button onClick={() => { setPreviewDoc(null); setPreviewText(""); }} className="text-ink-200 hover:text-ink-50"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 overflow-y-auto flex-1">
                <pre className="text-xs text-ink-100 whitespace-pre-wrap font-mono leading-relaxed">{previewText || "Loading…"}</pre>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
