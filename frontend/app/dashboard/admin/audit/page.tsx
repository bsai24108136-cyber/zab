"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { apiFetch } from "@/lib/api";
import { fadeUp } from "@/lib/motion";
import { Shield } from "lucide-react";

interface AuditRow {
  id: string; user_hash: string; model_used: string;
  tokens_used: number; cost_usd: number; response_time_ms: number;
  confidence_score: number; timestamp: string;
}

export default function AdminAuditPage() {
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    apiFetch<AuditRow[]>("/admin/audit-log").then(setAudit).catch(()=>{}).finally(()=>setLoading(false));
  }, []);

  const filtered = filter === "all" ? audit : audit.filter(r => r.model_used === filter);
  const models = ["all", "gemini-1.5-flash", "gpt-4o-mini"];

  return (
    <div className="space-y-6">
      <motion.div initial="hidden" animate="visible" variants={fadeUp}
        className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-ink-50 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-glow-violet">
            <Shield className="w-4.5 h-4.5 text-white"/>
          </span>
          Audit <span className="gradient-text">Log</span>
        </h2>
        <div className="flex gap-1.5">
          {models.map(m => (
            <button key={m} onClick={()=>setFilter(m)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                ${filter===m ? "bg-purple-500/20 text-purple-300 border border-purple-500/30" : "text-gray-500 hover:text-gray-300 glass-sm"}`}>
              {m==="all" ? "All" : m==="gemini-1.5-flash" ? "Gemini" : "GPT-4o-mini"}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Summary stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="glass-sm p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Total Interactions</p>
          <p className="text-xl font-bold text-gray-100 mt-1">{audit.length}</p>
        </div>
        <div className="glass-sm p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Total Tokens</p>
          <p className="text-xl font-bold text-gray-100 mt-1">{audit.reduce((a,r)=>a+(r.tokens_used||0),0).toLocaleString()}</p>
        </div>
        <div className="glass-sm p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Total Cost</p>
          <p className="text-xl font-bold text-green-400 mt-1">${audit.reduce((a,r)=>a+Number(r.cost_usd||0),0).toFixed(6)}</p>
        </div>
      </div>

      <div className="glass overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-2">{[1,2,3,4,5].map(i=><div key={i} className="skeleton h-12"/>)}</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <Shield className="w-10 h-10 mx-auto mb-2 opacity-30"/>
            <p className="text-sm">No audit entries yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wider bg-gray-900/50">
                  {["Model","User","Tokens","Cost","Response Time","Confidence","Timestamp"].map(h=>(
                    <th key={h} className="text-left px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {filtered.map(row => (
                  <tr key={row.id} className="hover:bg-gray-800/20">
                    <td className="px-4 py-3">
                      {row.model_used==="gemini-1.5-flash"
                        ? <span className="badge-gemini text-[10px]">Gemini Flash</span>
                        : <span className="badge-gpt text-[10px]">GPT-4o-mini</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs font-mono">{row.user_hash?.slice(0,12)}…</td>
                    <td className="px-4 py-3 text-gray-300 text-xs font-mono">{(row.tokens_used||0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-green-400 text-xs font-mono">${Number(row.cost_usd||0).toFixed(6)}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{row.response_time_ms||0}ms</td>
                    <td className="px-4 py-3 text-teal-400 text-xs">{row.confidence_score!=null?`${row.confidence_score.toFixed(1)}%`:"—"}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{row.timestamp ? new Date(row.timestamp).toLocaleString("en-PK") : "—"}</td>
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
