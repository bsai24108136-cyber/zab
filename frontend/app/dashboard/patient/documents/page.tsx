"use client";
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch, apiUpload } from "@/lib/api";
import { useDropzone } from "react-dropzone";
import { alertConfirm, toastError, toastSuccess } from "@/lib/alerts";
import {
  Upload, FileText, Trash2, Eye, CheckCircle,
  Clock, AlertCircle, Loader2, X, File
} from "lucide-react";

interface Doc {
  id: string;
  filename: string;
  file_type: string;
  file_size: number;
  upload_date: string;
  chunk_count: number;
  status: string;
}

const TYPE_COLORS: Record<string, string> = {
  pdf: "text-red-400 bg-red-900/20",
  docx: "text-blue-400 bg-blue-900/20",
  txt: "text-gray-400 bg-gray-800",
  csv: "text-green-400 bg-green-900/20",
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export default function DocumentsPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("idle");
  const [error, setError] = useState("");
  const [previewDoc, setPreviewDoc] = useState<Doc | null>(null);
  const [previewText, setPreviewText] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchDocs = useCallback(async () => {
    try {
      const data = await apiFetch<Doc[]>("/documents/");
      setDocs(data);
    } catch { } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const onDrop = useCallback(async (accepted: File[]) => {
    if (!accepted.length) return;
    const file = accepted[0];

    // Frontend validation
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["pdf", "docx", "txt", "csv"].includes(ext)) {
      setError("Only PDF, DOCX, TXT, and CSV files are supported.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("File must be under 10MB.");
      return;
    }

    setError("");
    setUploading(true);
    setUploadProgress("Uploading…");

    try {
      const fd = new FormData();
      fd.append("file", file);
      await apiUpload("/documents/upload", fd);
      setUploadProgress("Processing…");
      setTimeout(() => {
        setUploadProgress("idle");
        setUploading(false);
        fetchDocs();
      }, 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setUploading(false);
      setUploadProgress("idle");
    }
  }, [fetchDocs]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
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
      text: `"${name}" and all its embeddings will be removed. This can't be undone.`,
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

  async function previewDoc_(doc: Doc) {
    setPreviewDoc(doc);
    const res = await apiFetch<{ preview_text: string }>(`/documents/${doc.id}/preview`);
    setPreviewText(res.preview_text);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-100">Documents</h2>
        <span className="text-sm text-gray-500">{docs.length} files</span>
      </div>

      {/* Dropzone */}
      <motion.div
        whileHover={{ scale: 1.005 }}
        {...(getRootProps() as any)}
        className={`glass p-10 border-2 border-dashed text-center cursor-pointer transition-all duration-300
          ${isDragActive ? "border-cyan-400/70 bg-cyan-400/5 shadow-glow-cyan" : "border-white/10 hover:border-white/25"}`}
      >
        <input {...getInputProps()} />
        {uploading ? (
          <div className="space-y-3">
            <Loader2 className="w-10 h-10 mx-auto text-cyan-300 animate-spin" />
            <p className="text-sm font-medium text-cyan-200">{uploadProgress}</p>
            <div className="w-48 mx-auto bg-white/5 rounded-full h-1.5 overflow-hidden">
              <div className="bg-brand-gradient h-1.5 rounded-full animate-pulse w-3/4" />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Upload className="w-10 h-10 mx-auto text-ink-200" />
            <div>
              <p className="text-sm font-semibold text-ink-50">
                {isDragActive ? "Drop file here" : "Drag & drop or click to upload"}
              </p>
              <p className="text-xs text-ink-300 mt-1">PDF, DOCX, TXT, CSV — max 10MB</p>
            </div>
            <div className="flex justify-center gap-2">
              {["PDF", "DOCX", "TXT", "CSV"].map(t => (
                <span key={t} className="text-[10px] font-bold px-2 py-0.5 rounded bg-white/5 text-ink-200">{t}</span>
              ))}
            </div>
          </div>
        )}
      </motion.div>

      {error && (
        <div className="glass-sm p-3 bg-red-900/20 border-red-700/50 flex items-center gap-2 text-sm text-red-300">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Documents table */}
      <div className="glass overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-gray-300">File Manager</h3>
        </div>
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="skeleton h-12" />)}
          </div>
        ) : docs.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <File className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No documents yet. Upload your first file above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wider bg-gray-900/50">
                  <th className="text-left px-6 py-3">Filename</th>
                  <th className="text-left px-4 py-3">Type</th>
                  <th className="text-left px-4 py-3">Size</th>
                  <th className="text-left px-4 py-3">Uploaded</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {docs.map(doc => (
                  <tr key={doc.id} className="hover:bg-gray-800/20 transition-colors">
                    <td className="px-6 py-3 font-medium text-gray-200 max-w-[200px] truncate">{doc.filename}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${TYPE_COLORS[doc.file_type] ?? "text-gray-400 bg-gray-800"}`}>
                        {doc.file_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{formatSize(doc.file_size)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{new Date(doc.upload_date).toLocaleDateString("en-PK")}</td>
                    <td className="px-4 py-3">
                      <span className={`flex items-center gap-1 text-xs font-medium ${
                        doc.status === "ready" ? "text-green-400"
                        : doc.status === "error" ? "text-red-400"
                        : "text-amber-400"
                      }`}>
                        {doc.status === "ready" ? <CheckCircle className="w-3 h-3" />
                         : doc.status === "error" ? <AlertCircle className="w-3 h-3" />
                         : <Clock className="w-3 h-3 animate-spin" />}
                        {doc.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => previewDoc_(doc)}
                          className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
                          title="Preview"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteDoc(doc.id, doc.filename)}
                          className="p-1.5 rounded-lg hover:bg-rose-500/15 text-ink-300 hover:text-rose-300 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Preview modal */}
      <AnimatePresence>
        {previewDoc && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => { setPreviewDoc(null); setPreviewText(""); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="glass-hi w-full max-w-2xl max-h-[80vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                <div>
                  <h3 className="font-semibold text-ink-50">{previewDoc.filename}</h3>
                  <p className="text-xs text-ink-300 mt-0.5">Preview (first 5000 chars)</p>
                </div>
                <button onClick={() => { setPreviewDoc(null); setPreviewText(""); }} className="text-ink-200 hover:text-ink-50">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 overflow-y-auto flex-1">
                <pre className="text-xs text-ink-100 whitespace-pre-wrap font-mono leading-relaxed">
                  {previewText || "Loading preview…"}
                </pre>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
