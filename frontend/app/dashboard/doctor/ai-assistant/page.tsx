"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { apiFetch } from "@/lib/api";
import { toastWarn } from "@/lib/alerts";
import { fadeUp } from "@/lib/motion";
import {
  Brain, Loader2, ChevronDown, ChevronUp, Wrench,
  CheckCircle, Zap,
  FlaskConical, TrendingUp, Pill, Activity, Shield, HelpCircle
} from "lucide-react";

type Tab = "query" | "treatment" | "pharmacy" | "risk" | "lab" | "contraindication";

interface AgentResult {
  answer: string;
  tools_called: string[];
  steps: { step: number; label: string; tool?: string }[];
  model: string;
  tokens?: number;
  cost_usd?: number;
  confidence?: number;
  disclaimer: string;
}

const TABS: { id: Tab; label: string; icon: React.ReactNode; hint: string }[] = [
  { id: "query",            label: "Q&A",             icon: <HelpCircle className="w-4 h-4" />,    hint: "Ask anything about a patient's documents" },
  { id: "treatment",        label: "Treatment",       icon: <Pill className="w-4 h-4" />,          hint: "Get drug options, dosages, and monitoring plan" },
  { id: "pharmacy",         label: "Pharmacy",        icon: <FlaskConical className="w-4 h-4" />,  hint: "Adherence score, refill forecast, risk" },
  { id: "risk",             label: "Risk Forecast",   icon: <TrendingUp className="w-4 h-4" />,    hint: "30-day readmission & disease progression" },
  { id: "lab",              label: "Lab Analysis",    icon: <Activity className="w-4 h-4" />,      hint: "Abnormal values, trends, suggested actions" },
  { id: "contraindication", label: "Interactions",    icon: <Shield className="w-4 h-4" />,        hint: "Drug safety check with full reasoning trace" },
];

function StepIndicator({ steps, running }: { steps: AgentResult["steps"]; running: boolean }) {
  if (!steps.length) return null;
  return (
    <div className="glass-sm p-4 space-y-1.5">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Agent Steps</p>
      {steps.map((s, i) => {
        const isLast = i === steps.length - 1;
        return (
          <div key={i} className={`flex items-center gap-2 text-xs transition-all ${isLast && running ? "text-teal-300 step-active" : "text-gray-500"}`}>
            {isLast && running ? (
              <Loader2 className="w-3 h-3 animate-spin text-teal-400" />
            ) : (
              <CheckCircle className="w-3 h-3 text-green-400" />
            )}
            {s.label}
            {s.tool && <span className="tool-chip ml-1">{s.tool}</span>}
          </div>
        );
      })}
    </div>
  );
}

function ToolChips({ tools }: { tools: string[] }) {
  if (!tools.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className="text-xs text-gray-500 mr-1">Tools used:</span>
      {tools.map(t => (
        <span key={t} className="tool-chip">
          <Wrench className="w-2.5 h-2.5" />
          {t}
        </span>
      ))}
    </div>
  );
}

function ResultCard({ result }: { result: AgentResult }) {
  const [showReasoning, setShowReasoning] = useState(false);
  return (
    <div className="space-y-3">
      {/* Model + confidence header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="badge-gpt">{result.model || "Groq / Llama-3.3"}</div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          {result.tokens && <span>{result.tokens.toLocaleString()} tokens</span>}
          {result.cost_usd !== undefined && <span>${result.cost_usd.toFixed(6)}</span>}
        </div>
      </div>

      {/* Answer */}
      <div className="glass-sm p-5">
        <div className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">{result.answer}</div>
      </div>

      {/* Tool chips */}
      <ToolChips tools={result.tools_called} />

      {/* Reasoning trace (collapsible) */}
      {result.steps.length > 0 && (
        <div>
          <button
            onClick={() => setShowReasoning(v => !v)}
            className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            {showReasoning ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            How I reached this conclusion
          </button>
          {showReasoning && (
            <div className="mt-2 glass-sm p-4 space-y-1.5">
              {result.steps.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-gray-400">
                  <span className="text-gray-600">{i + 1}.</span>
                  {s.label}
                  {s.tool && <span className="tool-chip">{s.tool}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Disclaimer */}
      <div className="text-xs text-gray-600 italic border-t border-gray-800 pt-3">{result.disclaimer}</div>
    </div>
  );
}

export default function DoctorAIPage() {
  const searchParams = useSearchParams();
  const defaultPatient = searchParams.get("patient_id") ?? "";

  const [activeTab, setActiveTab] = useState<Tab>("query");
  const [patientId, setPatientId] = useState(defaultPatient);
  const [query, setQuery] = useState("");
  const [drugName, setDrugName] = useState("");
  const [result, setResult] = useState<AgentResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState<AgentResult["steps"]>([]);

  // Endpoint map per tab
  const ENDPOINTS: Record<Tab, string> = {
    query: "/ai/doctor/query",
    treatment: "/ai/doctor/suggest",
    pharmacy: "/ai/doctor/pharmacy-predict",
    risk: "/ai/doctor/risk-forecast",
    lab: "/ai/doctor/analyze-lab",
    contraindication: "/ai/doctor/contraindication",
  };

  function buildPayload(): Record<string, string | number> {
    const base = { patient_id: patientId };
    if (activeTab === "query") return { ...base, query };
    if (activeTab === "treatment") return { ...base, presenting_complaint: query };
    if (activeTab === "contraindication") return { ...base, drug_name: drugName };
    return base;
  }

  async function runAgent() {
    if (!patientId.trim()) { toastWarn("Patient ID required", "Enter a patient ID to run the agent."); return; }
    setLoading(true);
    setResult(null);
    setSteps([{ step: 1, label: "Analyzing query..." }]);

    // Progressive step simulation for UX
    const stepLabels: Record<Tab, string[]> = {
      query: ["Analyzing query...", "Searching documents...", "Generating answer..."],
      treatment: ["Fetching patient history...", "Checking drug interactions...", "Generating treatment plan..."],
      pharmacy: ["Loading prescription history...", "Calculating adherence...", "Forecasting refills..."],
      risk: ["Loading patient history...", "Analyzing progression...", "Generating forecast..."],
      lab: ["Loading lab values...", "Checking trends...", "Generating analysis..."],
      contraindication: ["Fetching patient history...", "Normalizing drug name...", "Checking contradictions..."],
    };

    let stepIdx = 0;
    const stepLabelsForTab = stepLabels[activeTab];
    const stepInterval = setInterval(() => {
      if (stepIdx < stepLabelsForTab.length - 1) {
        stepIdx++;
        setSteps(prev => [...prev, { step: stepIdx + 1, label: stepLabelsForTab[stepIdx] }]);
      }
    }, 1200);

    try {
      const res = await apiFetch<AgentResult>(ENDPOINTS[activeTab], {
        method: "POST",
        body: JSON.stringify(buildPayload()),
      });
      clearInterval(stepInterval);
      setSteps(res.steps ?? []);
      setResult(res);
    } catch (err: unknown) {
      clearInterval(stepInterval);
      setResult({
        answer: err instanceof Error ? err.message : "An error occurred.",
        tools_called: [],
        steps: [],
        model: "Groq / Llama-3.3",
        disclaimer: "Clinical AI output — final decision rests with the clinician.",
      });
    } finally {
      setLoading(false);
    }
  }

  const activeTabInfo = TABS.find(t => t.id === activeTab)!;

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp}
        className="glass relative overflow-hidden p-5 flex items-center gap-3">
        <div className="pointer-events-none absolute -top-16 -right-12 h-44 w-44 rounded-full bg-violet-500/25 blur-3xl" />
        <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-glow-violet">
          <Brain className="w-5 h-5 text-white" />
        </div>
        <div className="relative">
          <h2 className="text-xl font-bold text-ink-50">Clinical AI <span className="gradient-text-animated">Assistant</span></h2>
          <div className="badge-violet text-[10px] mt-0.5">Groq / Llama-3.3 · Function Calling · Agentic</div>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5">
        {TABS.map(tab => (
          <motion.button
            key={tab.id}
            whileTap={{ scale: 0.96 }}
            onClick={() => { setActiveTab(tab.id); setResult(null); setSteps([]); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all
              ${activeTab === tab.id
                ? "bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 text-white border border-violet-400/40 shadow-glow-violet"
                : "text-ink-200 hover:text-ink-50 glass-sm"}`}
          >
            {tab.icon}
            {tab.label}
          </motion.button>
        ))}
      </div>

      {/* Input panel */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="glass p-5 space-y-4">
        <p className="text-xs text-gray-500">{activeTabInfo.hint}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Patient ID</label>
            <input
              type="text"
              value={patientId}
              onChange={e => setPatientId(e.target.value)}
              placeholder="e.g. PT-001 or UUID"
              className="input"
            />
          </div>

          {(activeTab === "query" || activeTab === "treatment") && (
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                {activeTab === "query" ? "Question" : "Presenting Complaint"}
              </label>
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={activeTab === "query" ? "Ask about this patient…" : "e.g. chest pain, diabetes management…"}
                className="input"
                onKeyDown={e => e.key === "Enter" && runAgent()}
              />
            </div>
          )}

          {activeTab === "contraindication" && (
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Drug Name</label>
              <input
                type="text"
                value={drugName}
                onChange={e => setDrugName(e.target.value)}
                placeholder="e.g. Loprin, Aspirin, Metformin…"
                className="input"
                onKeyDown={e => e.key === "Enter" && runAgent()}
              />
            </div>
          )}
        </div>

        <button
          onClick={runAgent}
          disabled={loading}
          className="btn-primary"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          {loading ? "Agent running…" : "Run Agent"}
        </button>
      </motion.div>

      {/* Step indicators (live while running) */}
      {(loading || steps.length > 0) && (
        <StepIndicator steps={steps} running={loading} />
      )}

      {/* Result */}
      {result && <ResultCard result={result} />}
    </div>
  );
}
