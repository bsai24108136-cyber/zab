"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { apiFetch } from "@/lib/api";
import { fadeUp } from "@/lib/motion";
import { Search, Star } from "lucide-react";

interface SearchRecord {
  id: string; query_text: string; search_type: string;
  confidence_score: number; response_time_ms: number;
  created_at: string; rating?: number;
}

const MATCH_COLORS: Record<string,string> = {
  semantic: "bg-teal-500/15 text-teal-300 border-teal-500/30",
  keyword:  "bg-blue-500/15 text-blue-300 border-blue-500/30",
  hybrid:   "bg-purple-500/15 text-purple-300 border-purple-500/30",
};

export default function AdminSearchesPage() {
  const [history, setHistory] = useState<SearchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    apiFetch<SearchRecord[]>("/search/history").then(setHistory).catch(()=>{}).finally(()=>setLoading(false));
  }, []);

  async function rateSearch(search_id: string, rating: number) {
    await apiFetch("/search/rate", { method:"POST", body: JSON.stringify({search_id, rating}) });
    setHistory(prev => prev.map(s => s.id===search_id ? {...s, rating} : s));
  }

  const types = ["all","semantic","keyword","hybrid"];
  const filtered = filter==="all" ? history : history.filter(s=>s.search_type===filter);
  const avgRating = history.filter(s=>s.rating).reduce((a,s)=>a+(s.rating??0),0) / Math.max(history.filter(s=>s.rating).length,1);
  const avgConf = history.reduce((a,s)=>a+(s.confidence_score??0),0) / Math.max(history.length,1);
  const avgTime = history.reduce((a,s)=>a+(s.response_time_ms??0),0) / Math.max(history.length,1);

  return (
    <div className="space-y-6">
      <motion.h2 initial="hidden" animate="visible" variants={fadeUp}
        className="text-xl font-bold text-ink-50 flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 shadow-glow-cyan">
          <Search className="w-4.5 h-4.5 text-white"/>
        </span>
        Search <span className="gradient-text">History</span>
      </motion.h2>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-4">
        <div className="glass-sm p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Avg Confidence</p>
          <p className="text-xl font-bold text-teal-400 mt-1">{avgConf.toFixed(1)}%</p>
        </div>
        <div className="glass-sm p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Avg Response Time</p>
          <p className="text-xl font-bold text-gray-100 mt-1">{avgTime.toFixed(0)}ms</p>
        </div>
        <div className="glass-sm p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Avg Rating</p>
          <p className="text-xl font-bold text-amber-400 mt-1">{avgRating.toFixed(1)} / 5</p>
        </div>
      </div>

      {/* Type filter */}
      <div className="flex gap-1.5">
        {types.map(t=>(
          <button key={t} onClick={()=>setFilter(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all
              ${filter===t ? "bg-teal-500/20 text-teal-300 border border-teal-500/30" : "text-gray-500 hover:text-gray-300 glass-sm"}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="glass overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-2">{[1,2,3].map(i=><div key={i} className="skeleton h-12"/>)}</div>
        ) : filtered.length===0 ? (
          <div className="p-12 text-center text-gray-500">
            <Search className="w-10 h-10 mx-auto mb-2 opacity-30"/><p className="text-sm">No searches found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wider bg-gray-900/50">
                  {["Query","Type","Confidence","Time","Date","Rating"].map(h=><th key={h} className="text-left px-4 py-3">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {filtered.map(s=>(
                  <tr key={s.id} className="hover:bg-gray-800/20">
                    <td className="px-4 py-3 text-gray-300 max-w-[220px] truncate">{s.query_text}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${MATCH_COLORS[s.search_type]??MATCH_COLORS.hybrid}`}>{s.search_type}</span>
                    </td>
                    <td className="px-4 py-3 text-teal-400 text-xs font-semibold">{s.confidence_score?.toFixed(1)}%</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{s.response_time_ms}ms</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{new Date(s.created_at).toLocaleDateString("en-PK")}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-0.5">
                        {[1,2,3,4,5].map(star=>(
                          <button key={star} onClick={()=>rateSearch(s.id,star)}>
                            <Star className={`w-3.5 h-3.5 fill-current ${(s.rating??0)>=star?"text-amber-400":"text-gray-700"}`}/>
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
    </div>
  );
}
