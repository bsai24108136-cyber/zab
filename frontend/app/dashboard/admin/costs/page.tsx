"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { apiFetch } from "@/lib/api";
import { fadeUp } from "@/lib/motion";
import { DollarSign, TrendingUp, CheckCircle, AlertTriangle } from "lucide-react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface Costs {
  gemini: { total_calls: number; total_tokens: number; estimated_cost_usd: number };
  gpt4o_mini: { total_calls: number; total_tokens: number; exact_cost_usd: number };
  combined_total_usd: number; budget_status: string;
}
interface AuditRow {
  id: string; user_hash: string; model_used: string;
  tokens_used: number; cost_usd: number; response_time_ms: number;
  confidence_score: number; timestamp: string;
}

export default function AdminCostsPage() {
  const [costs, setCosts] = useState<Costs|null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch<Costs>("/admin/costs").catch(()=>null),
      apiFetch<AuditRow[]>("/admin/audit-log").catch(()=>[]),
    ]).then(([c,a]) => { setCosts(c); setAudit(a); }).finally(()=>setLoading(false));
  }, []);

  // Build chart data from audit log
  const chartData = (() => {
    const byModel: Record<string, { calls: number; cost: number; tokens: number }> = {};
    for (const row of audit) {
      if (!byModel[row.model_used]) byModel[row.model_used] = { calls: 0, cost: 0, tokens: 0 };
      byModel[row.model_used].calls++;
      byModel[row.model_used].cost += Number(row.cost_usd ?? 0);
      byModel[row.model_used].tokens += row.tokens_used ?? 0;
    }
    return Object.entries(byModel).map(([name, v]) => ({ name, ...v, cost: parseFloat(v.cost.toFixed(6)) }));
  })();

  const underBudget = (costs?.combined_total_usd ?? 0) < 10;

  return (
    <div className="space-y-6">
      <motion.h2 initial="hidden" animate="visible" variants={fadeUp}
        className="text-xl font-bold text-ink-50 flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-glow-cyan">
          <DollarSign className="w-4.5 h-4.5 text-white"/>
        </span>
        Cost <span className="gradient-text">Monitor</span>
      </motion.h2>

      {loading ? (
        <div className="space-y-4">{[1,2,3].map(i=><div key={i} className="skeleton h-32 rounded-xl"/>)}</div>
      ) : (<>
        {/* Budget status banner */}
        <div className={`glass p-4 flex items-center gap-3 ${underBudget?"border-green-500/30 bg-green-500/5":"border-red-500/30 bg-red-500/5"}`}>
          {underBudget ? <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0"/> : <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0"/>}
          <div>
            <p className={`font-semibold text-sm ${underBudget?"text-green-300":"text-red-300"}`}>
              Total Spend: ${costs?.combined_total_usd?.toFixed(6) ?? "0.000000"}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{underBudget ? "✓ Under $10 project budget" : "⚠ Exceeds $10 budget"}</p>
          </div>
        </div>

        {/* Model breakdown cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="glass p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="badge-gemini">Gemini 1.5 Flash</div>
              <span className="text-xs text-gray-500">Patient AI</span>
            </div>
            <p className="text-3xl font-bold text-gray-100">${costs?.gemini.estimated_cost_usd?.toFixed(6) ?? "0.00"}</p>
            <div className="mt-3 space-y-1 text-xs text-gray-500">
              <div className="flex justify-between"><span>Total Calls</span><span className="text-gray-300 font-medium">{costs?.gemini.total_calls ?? 0}</span></div>
              <div className="flex justify-between"><span>Total Tokens</span><span className="text-gray-300 font-medium">{(costs?.gemini.total_tokens ?? 0).toLocaleString()}</span></div>
              <div className="flex justify-between"><span>Rate</span><span className="text-green-400 font-medium">Free tier</span></div>
            </div>
          </div>
          <div className="glass p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="badge-gpt">GPT-4o-mini</div>
              <span className="text-xs text-gray-500">Doctor AI</span>
            </div>
            <p className="text-3xl font-bold text-gray-100">${costs?.gpt4o_mini.exact_cost_usd?.toFixed(6) ?? "0.00"}</p>
            <div className="mt-3 space-y-1 text-xs text-gray-500">
              <div className="flex justify-between"><span>Total Calls</span><span className="text-gray-300 font-medium">{costs?.gpt4o_mini.total_calls ?? 0}</span></div>
              <div className="flex justify-between"><span>Total Tokens</span><span className="text-gray-300 font-medium">{(costs?.gpt4o_mini.total_tokens ?? 0).toLocaleString()}</span></div>
              <div className="flex justify-between"><span>Input Rate</span><span className="text-gray-300 font-medium">$0.00015/1K</span></div>
              <div className="flex justify-between"><span>Output Rate</span><span className="text-gray-300 font-medium">$0.0006/1K</span></div>
            </div>
          </div>
        </div>

        {/* Chart */}
        {chartData.length > 0 && (
          <div className="glass p-5">
            <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-teal-400"/>Model Usage Comparison
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
                <XAxis dataKey="name" tick={{fill:"#64748b",fontSize:11}}/>
                <YAxis yAxisId="left" tick={{fill:"#64748b",fontSize:11}}/>
                <YAxis yAxisId="right" orientation="right" tick={{fill:"#64748b",fontSize:11}}/>
                <Tooltip contentStyle={{background:"rgba(17,16,42,0.96)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:"12px",color:"#E6E6F0",backdropFilter:"blur(8px)"}} cursor={{fill:"rgba(255,255,255,0.04)"}}/>
                <Legend wrapperStyle={{fontSize:"12px",color:"#94a3b8"}}/>
                <Bar yAxisId="left" dataKey="calls" name="API Calls" fill="#818cf8" radius={[6,6,0,0]}/>
                <Bar yAxisId="right" dataKey="tokens" name="Tokens" fill="#14b8a6" radius={[6,6,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Recent interactions */}
        <div className="glass overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-800"><h3 className="text-sm font-semibold text-gray-300">Recent AI Interactions</h3></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wider bg-gray-900/50">
                  {["Model","Tokens","Cost","Response Time","Confidence","Time"].map(h=><th key={h} className="text-left px-4 py-3">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {audit.slice(0,10).map(row=>(
                  <tr key={row.id} className="hover:bg-gray-800/20">
                    <td className="px-4 py-3">
                      {row.model_used==="gemini-1.5-flash"
                        ? <span className="badge-gemini text-[10px]">Gemini Flash</span>
                        : <span className="badge-gpt text-[10px]">GPT-4o-mini</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs font-mono">{row.tokens_used?.toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs font-mono text-green-400">${Number(row.cost_usd??0).toFixed(6)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{row.response_time_ms}ms</td>
                    <td className="px-4 py-3 text-teal-400 text-xs">{row.confidence_score?.toFixed(1) ?? "—"}%</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{row.timestamp ? new Date(row.timestamp).toLocaleString("en-PK") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>)}
    </div>
  );
}
