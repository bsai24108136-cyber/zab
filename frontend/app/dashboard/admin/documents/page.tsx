"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { alertConfirm, toastError, toastSuccess } from "@/lib/alerts";
import { FileText, Trash2, Search, File } from "lucide-react";

interface Doc {
  id: string; filename: string; file_type: string; file_size: number;
  status: string; chunk_count: number; upload_date: string;
  uploader_name: string; uploader_email: string;
  patient_id: string | null; patient_name: string | null;
}

const TYPE_COLOR: Record<string,string> = {
  pdf: "text-red-400 bg-red-500/10 border-red-500/20",
  docx: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  txt: "text-gray-400 bg-gray-500/10 border-gray-500/20",
  csv: "text-green-400 bg-green-500/10 border-green-500/20",
};
const STATUS_COLOR: Record<string,string> = {
  ready: "text-teal-400", pending: "text-amber-400",
  processing: "text-blue-400", error: "text-red-400",
};

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024*1024) return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/(1024*1024)).toFixed(1)} MB`;
}

export default function AdminDocumentsPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { const d = await apiFetch<Doc[]>("/admin/documents"); setDocs(d); }
    catch {} finally { setLoading(false); }
  }

  async function deleteDoc(id: string, name: string) {
    const res = await alertConfirm({
      title: "Delete document?",
      text: `"${name}" and all its embeddings will be removed.`,
      icon: "warning",
      confirmText: "Delete",
      cancelText: "Keep it",
    });
    if (!res.isConfirmed) return;
    setDeleting(id);
    try {
      await apiFetch(`/admin/documents/${id}`, { method: "DELETE" });
      setDocs(prev => prev.filter(d => d.id !== id));
      toastSuccess("Document deleted");
    } catch (e: unknown) { toastError("Delete failed", e instanceof Error ? e.message : "Unknown error"); }
    finally { setDeleting(null); }
  }

  const filtered = docs.filter(d =>
    d.filename.toLowerCase().includes(search.toLowerCase()) ||
    d.uploader_name?.toLowerCase().includes(search.toLowerCase()) ||
    d.uploader_email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-400"/>All Documents
          <span className="text-sm font-normal text-gray-500 ml-1">({docs.length})</span>
        </h2>
        <div className="flex gap-3 text-xs text-gray-500">
          {["pdf","docx","txt","csv"].map(t => (
            <span key={t} className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase ${TYPE_COLOR[t]}`}>
              {docs.filter(d => d.file_type === t).length} {t}
            </span>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600"/>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by filename, uploader…"
          className="w-full glass-sm pl-9 pr-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 rounded-lg border border-gray-800 focus:border-blue-500/50 outline-none"/>
      </div>

      {/* Table */}
      <div className="glass overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-2">{[1,2,3,4,5].map(i=><div key={i} className="skeleton h-12"/>)}</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <File className="w-10 h-10 mx-auto mb-2 opacity-30"/>
            <p className="text-sm">{search ? "No documents match your search." : "No documents uploaded yet."}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wider bg-gray-900/50">
                  {["File","Type","Size","Chunks","Status","Uploaded By","Patient","Date",""].map(h=>(
                    <th key={h} className="text-left px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {filtered.map(d => (
                  <tr key={d.id} className="hover:bg-gray-800/20">
                    <td className="px-4 py-3 max-w-[180px]">
                      <p className="text-gray-200 truncate text-xs font-medium">{d.filename}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${TYPE_COLOR[d.file_type] || "text-gray-400 border-gray-700"}`}>
                        {d.file_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{fmtSize(d.file_size)}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{d.chunk_count}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${STATUS_COLOR[d.status] || "text-gray-400"}`}>
                        {d.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-gray-300 text-xs">{d.uploader_name || "—"}</p>
                      <p className="text-gray-600 text-[10px]">{d.uploader_email}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{d.patient_name || "—"}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                      {d.upload_date ? new Date(d.upload_date).toLocaleDateString("en-PK") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => deleteDoc(d.id, d.filename)}
                        disabled={deleting === d.id}
                        className="text-red-500/50 hover:text-red-400 transition-colors disabled:opacity-30">
                        <Trash2 className="w-3.5 h-3.5"/>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
