"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { apiFetch } from "@/lib/api";
import { fadeUp } from "@/lib/motion";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import { BarChart3, TrendingUp, Cpu } from "lucide-react";

interface Analytics {
  file_type_breakdown: { name: string; value: number }[];
  model_usage: { name: string; value: number }[];
  searches_by_day: { date: string; count: number }[];
}

const PIE_COLORS = ["#22D3EE","#A855F7","#F472B6","#34D399","#FBBF24"];

export default function DoctorAnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<Analytics>("/admin/analytics").then(setData).catch(()=>{}).finally(()=>setLoading(false));
  }, []);

  if (loading) return (
    <div className="space-y-4">{[1,2,3,4].map(i=><div key={i} className="skeleton h-48 rounded-2xl"/>)}</div>
  );

  return (
    <div className="space-y-6 max-w-5xl">
      <motion.h2 initial="hidden" animate="visible" variants={fadeUp}
        className="text-xl font-bold text-ink-50 flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 shadow-glow-cyan">
          <BarChart3 className="w-4.5 h-4.5 text-white"/>
        </span>
        <span className="gradient-text-animated">Analytics</span>
      </motion.h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* File type breakdown */}
        <div className="glass p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-teal-400"/>File Type Breakdown
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={data?.file_type_breakdown ?? []} cx="50%" cy="50%" outerRadius={80}
                dataKey="value" nameKey="name" label={({ name, value }) => `${name}: ${value}`}>
                {(data?.file_type_breakdown ?? []).map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]}/>
                ))}
              </Pie>
              <Tooltip contentStyle={{ background:"rgba(17,16,42,0.96)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:"12px", color:"#E6E6F0", backdropFilter:"blur(8px)" }} cursor={{fill:"rgba(255,255,255,0.04)"}}/>
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* AI model usage */}
        <div className="glass p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-purple-400"/>AI Model Usage
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data?.model_usage ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
              <XAxis dataKey="name" tick={{ fill:"#64748b", fontSize:11 }}/>
              <YAxis tick={{ fill:"#64748b", fontSize:11 }}/>
              <Tooltip contentStyle={{ background:"rgba(17,16,42,0.96)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:"12px", color:"#E6E6F0", backdropFilter:"blur(8px)" }} cursor={{fill:"rgba(255,255,255,0.04)"}}/>
              <Bar dataKey="value" fill="#818cf8" radius={[6,6,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Search queries per day */}
        <div className="glass p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-400"/>Search Queries (Last 7 Days)
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data?.searches_by_day ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
              <XAxis dataKey="date" tick={{ fill:"#64748b", fontSize:11 }}/>
              <YAxis tick={{ fill:"#64748b", fontSize:11 }}/>
              <Tooltip contentStyle={{ background:"rgba(17,16,42,0.96)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:"12px", color:"#E6E6F0", backdropFilter:"blur(8px)" }} cursor={{fill:"rgba(255,255,255,0.04)"}}/>
              <Line type="monotone" dataKey="count" stroke="#38bdf8" strokeWidth={2} dot={{ fill:"#38bdf8", r:4 }}/>
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
