"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/lib/api";
import { toastSuccess, toastError, alertConfirm } from "@/lib/alerts";
import { fadeUp, stagger } from "@/lib/motion";
import Reveal from "@/components/ui/Reveal";
import { Search, Star, Clock, Zap, Layers, Stethoscope, Sparkles, Trash2 } from "lucide-react";

interface SearchResult {
  chunk_text: string; source_document: string;
  page_or_chunk_number: number; confidence_score: number;
  match_type: string; upload_date?: string;
  document_id?: string;
}
interface SearchRecord {
  id: string; query_text: string; search_type: string;
  confidence_score: number; response_time_ms: number;
  created_at: string; rating?: number;
}

const MATCH_COLORS: Record<string,string> = {
  semantic: "bg-teal-500/15 text-teal-300 border-teal-500/30",
  keyword: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  hybrid: "bg-purple-500/15 text-purple-300 border-purple-500/30",
};

export default function DoctorSearchPage() {
  const [query, setQuery] = useState("");
  const [patientId, setPatientId] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchId, setSearchId] = useState<string|null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<SearchRecord[]>([]);
  const [tab, setTab] = useState<"search"|"history">("search");
  const [responseTime, setResponseTime] = useState<number|null>(null);

  useEffect(() => {
    apiFetch<SearchRecord[]>("/search/history").then(setHistory).catch(()=>{});
  }, []);

  async function doSearch() {
    if (!query.trim() || loading) return;
    setLoading(true); setResults([]);
    try {
      const res = await apiFetch<{ results: SearchResult[]; search_id: string; response_time_ms: number }>(
        "/search/hybrid", { method:"POST", body: JSON.stringify({ query, top_k:10, patient_id: patientId||undefined }) }
      );
      setResults(res.results); setSearchId(res.search_id); setResponseTime(res.response_time_ms);
      apiFetch<SearchRecord[]>("/search/history").then(setHistory).catch(()=>{});
    } catch {
      toastError("Search failed", "Please try again in a moment.");
    } finally { setLoading(false); }
  }

  async function rateSearch(search_id: string, rating: number) {
    try {
      await apiFetch("/search/rate", { method:"POST", body: JSON.stringify({ search_id, rating }) });
      setHistory(prev => prev.map(s => s.id===search_id ? {...s, rating} : s));
      toastSuccess("Thanks for the feedback");
    } catch {
      toastError("Couldn't save rating");
    }
  }

  async function deleteDocument(doc_id: string, doc_name: string) {
    const res = await alertConfirm({
      title: "Delete document?",
      text: `"${doc_name}" and all its embeddings will be removed.`,
      icon: "warning",
      confirmText: "Delete",
      cancelText: "Keep it",
    });
    if (!res.isConfirmed) return;
    try {
      await apiFetch(`/documents/${doc_id}`, { method: "DELETE" });
      setResults(prev => prev.filter(r => r.document_id !== doc_id));
      toastSuccess("Document deleted");
    } catch (e) {
      toastError("Delete failed", e instanceof Error ? e.message : "Please try again.");
    }
  }

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Hero header */}
      <motion.div
        initial="hidden" animate="visible" variants={stagger(0, 0.08)}
        className="glass relative overflow-hidden p-6 sm:p-8"
      >
        <div className="pointer-events-none absolute -top-24 -right-12 h-64 w-64 rounded-full bg-teal-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-12 h-64 w-64 rounded-full bg-purple-500/20 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <motion.div variants={fadeUp}
              className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400 via-cyan-500 to-purple-500 shadow-glow-cyan">
              <Stethoscope className="h-7 w-7 text-white" strokeWidth={2.2} />
            </motion.div>
            <div>
              <motion.h2 variants={fadeUp} className="text-2xl font-bold tracking-tight text-ink-50 sm:text-3xl">
                Clinical <span className="gradient-text-animated">Search</span>
              </motion.h2>
              <motion.p variants={fadeUp} className="mt-1 text-sm text-ink-200">
                Hybrid retrieval across patient documents — cited, ranked, instant.
              </motion.p>
            </div>
          </div>
          <motion.div variants={fadeUp} className="flex items-center gap-2">
            <span className="badge-cyan"><Sparkles className="h-3.5 w-3.5" /> 40% keyword · 60% semantic</span>
          </motion.div>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-1">
        {(["search","history"] as const).map(t => (
          <button key={t} onClick={()=>setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-all
              ${tab===t ? "bg-teal-500/20 text-teal-300 border border-teal-500/30" : "text-gray-500 hover:text-gray-300"}`}>
            {t}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {tab === "search" && (
          <motion.div
            key="search"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="space-y-6"
          >
            <Reveal>
              <div className="glass p-4 space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"/>
                    <input type="text" value={query} onChange={e=>setQuery(e.target.value)}
                      onKeyDown={e=>e.key==="Enter"&&doSearch()} placeholder="Search patient documents…" className="input pl-10"/>
                  </div>
                  <input type="text" value={patientId} onChange={e=>setPatientId(e.target.value)}
                    placeholder="Patient ID (optional)" className="input w-full sm:w-48"/>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={doSearch}
                    disabled={loading||!query.trim()}
                    className="btn-primary flex items-center gap-2"
                  >
                    {loading ? <span className="w-4 h-4 border-2 border-gray-950/30 border-t-gray-950 rounded-full animate-spin"/> : <Zap className="w-4 h-4"/>}
                    Search
                  </motion.button>
                </div>
                <p className="text-xs text-gray-600">Hybrid search: 40% keyword + 60% semantic · Citations on every result</p>
              </div>
            </Reveal>

            {responseTime !== null && (
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1"><Clock className="w-3 h-3"/>{responseTime}ms</span>
                <span>{results.length} results</span>
              </div>
            )}

            {loading && <div className="space-y-3">{[1,2,3].map(i=><div key={i} className="skeleton h-28 rounded-xl"/>)}</div>}

            {results.length>0 && (
              <motion.div
                initial="hidden" animate="visible" variants={stagger(0, 0.06)}
                className="space-y-3"
              >
                {results.map((r,i) => (
                  <motion.div
                    key={i}
                    variants={fadeUp}
                    whileHover={{ y: -2 }}
                    className="glass p-4 space-y-2 hover:border-teal-500/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${MATCH_COLORS[r.match_type]??MATCH_COLORS.hybrid}`}>{r.match_type}</span>
                      <div className="flex items-center gap-1.5">
                        <div className="text-xs font-semibold text-teal-400">{r.confidence_score}%</div>
                        <div className="w-16 bg-gray-800 rounded-full h-1.5">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${r.confidence_score}%` }}
                            transition={{ duration: 0.8, delay: 0.1 + i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                            className="bg-gradient-to-r from-teal-500 to-cyan-500 h-1.5 rounded-full"
                          />
                        </div>
                      </div>
                    </div>
                    <p className="text-sm text-gray-300 leading-relaxed"
                      dangerouslySetInnerHTML={{__html: r.chunk_text.replace(/\*\*(.*?)\*\*/g,'<mark class="bg-teal-500/20 text-teal-300 px-0.5 rounded">$1</mark>')}}/>
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-gray-500 flex items-center gap-1.5">
                        <Layers className="w-3 h-3"/>
                        Source: <span className="text-gray-400 font-medium">{r.source_document}</span>
                        · Chunk {r.page_or_chunk_number}
                        {r.upload_date && <span>· {new Date(r.upload_date).toLocaleDateString("en-PK")}</span>}
                      </div>
                      {r.document_id && (
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => deleteDocument(r.document_id!, r.source_document)}
                          className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Delete document"
                        >
                          <Trash2 className="w-4 h-4" />
                        </motion.button>
                      )}
                    </div>
                  </motion.div>
                ))}
                {searchId && (
                  <motion.div variants={fadeUp} className="glass-sm p-4 flex items-center gap-3">
                    <span className="text-sm text-gray-400">Rate results:</span>
                    <div className="flex gap-1">
                      {[1,2,3,4,5].map(star=>(
                        <motion.button
                          key={star}
                          whileHover={{ scale: 1.18, rotate: -8 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={()=>rateSearch(searchId,star)}
                          className="text-gray-600 hover:text-amber-400 transition-colors"
                        >
                          <Star className="w-5 h-5 fill-current"/>
                        </motion.button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}
          </motion.div>
        )}

        {tab === "history" && (
          <motion.div
            key="history"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            <div className="glass overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-800"><h3 className="text-sm font-semibold text-gray-300">Search History</h3></div>
              {history.length===0 ? (
                <div className="p-8 text-center text-gray-500 text-sm">No searches yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500 uppercase tracking-wider bg-gray-900/50">
                        {["Query","Type","Confidence","Time","Date","Rating"].map(h=><th key={h} className="text-left px-4 py-3">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/50">
                      {history.map(s=>(
                        <tr key={s.id} className="hover:bg-gray-800/20 transition-colors">
                          <td className="px-4 py-3 text-gray-300 max-w-[200px] truncate">{s.query_text}</td>
                          <td className="px-4 py-3"><span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${MATCH_COLORS[s.search_type]??MATCH_COLORS.hybrid}`}>{s.search_type}</span></td>
                          <td className="px-4 py-3 text-teal-400 text-xs font-semibold">{s.confidence_score?.toFixed(1)}%</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{s.response_time_ms}ms</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{new Date(s.created_at).toLocaleDateString("en-PK")}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-0.5">
                              {[1,2,3,4,5].map(star=>(
                                <button key={star} onClick={()=>rateSearch(s.id,star)}>
                                  <Star className={`w-3.5 h-3.5 fill-current transition-colors ${(s.rating??0)>=star?"text-amber-400":"text-gray-700 hover:text-amber-400/60"}`}/>
                                </button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
