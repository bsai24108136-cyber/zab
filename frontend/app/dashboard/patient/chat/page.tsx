"use client";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/lib/api";
import { getAuth } from "@/lib/auth";
import { toastError } from "@/lib/alerts";
import { fadeUp, stagger } from "@/lib/motion";
import {
  Send, Bot, User, Loader2, AlertTriangle, CheckCircle,
  Wrench, Sparkles,
} from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  tools_called?: string[];
  triage?: {
    urgency: string;
    suggested_action: string;
    possible_concerns: string[];
    disclaimer: string;
  };
  model?: string;
  streaming?: boolean;
}

const URGENCY_STYLES: Record<string, string> = {
  low: "urgency-low",
  moderate: "urgency-moderate",
  high: "urgency-high",
  emergency: "urgency-emergency",
};

export default function PatientChatPage() {
  const user = getAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hello! I'm your MediTrace Health Assistant 👋\n\nI can help you understand your medical records, check your medications, triage symptoms, and much more. How can I help you today?",
      model: "grok-llama-3.3",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState<{ step: number; label: string }[]>([]);
  const [showSteps, setShowSteps] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
    };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setSteps([{ step: 1, label: "Analyzing your question..." }]);
    setShowSteps(true);

    try {
      const res = await apiFetch<{
        answer: string;
        tools_called: string[];
        steps: { step: number; label: string }[];
        triage?: Message["triage"];
        model: string;
      }>("/ai/patient/agent", {
        method: "POST",
        body: JSON.stringify({ query: input, patient_id: user?.user_id }),
      });

      setSteps(res.steps ?? []);

      const assistantMsg: Message = {
        id: Date.now().toString() + "_a",
        role: "assistant",
        content: res.answer,
        tools_called: res.tools_called,
        triage: res.triage,
        model: res.model,
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch {
      toastError("Couldn't reach the assistant", "Please try again in a moment.");
      setMessages(prev => [
        ...prev,
        {
          id: Date.now().toString() + "_err",
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => setShowSteps(false), 2000);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const suggestions = [
    "What medications am I currently on?",
    "I have a headache and fever since 2 days",
    "What does hypertension mean?",
    "When is my next prescription refill?",
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-3xl mx-auto">
      {/* Hero header */}
      <motion.div
        initial="hidden" animate="visible" variants={stagger(0, 0.07)}
        className="glass relative overflow-hidden px-5 py-4 mb-4"
      >
        <div className="pointer-events-none absolute -top-16 -right-8 h-40 w-40 rounded-full bg-amber-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-8 h-40 w-40 rounded-full bg-orange-500/20 blur-3xl" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <motion.div
              variants={fadeUp}
              animate={{ y: [0, -3, 0] }}
              transition={{ y: { repeat: Infinity, duration: 3, ease: "easeInOut" } }}
              className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 via-orange-500 to-pink-500 shadow-glow"
            >
              <Bot className="w-5 h-5 text-white" />
              <span className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-amber-400 to-pink-500 opacity-30 blur-md -z-10" />
            </motion.div>
            <div>
              <motion.h2 variants={fadeUp} className="text-base font-semibold text-ink-50">
                Health <span className="gradient-text-animated">Assistant</span>
              </motion.h2>
              <motion.div variants={fadeUp} className="mt-0.5 flex items-center gap-1.5">
                <span className="badge-gemini text-[10px]"><Sparkles className="w-2.5 h-2.5" />Grok / Llama-3.3</span>
              </motion.div>
            </div>
          </div>
          <motion.div variants={fadeUp} className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
            </span>
            <span className="text-xs text-gray-500">Online</span>
          </motion.div>
        </div>
      </motion.div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        <AnimatePresence initial={false}>
          {messages.map(msg => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
            >
              <div className={`w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center ${
                msg.role === "user"
                  ? "bg-gradient-to-br from-blue-500 to-teal-500 shadow-glow-cyan"
                  : "bg-gradient-to-br from-amber-500 to-orange-500 shadow-glow"
              }`}>
                {msg.role === "user" ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-white" />}
              </div>

              <div className={`max-w-[80%] space-y-2 ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col`}>
                <div className={`glass-sm px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user" ? "bg-blue-500/10 border-blue-500/20" : ""
                }`}>
                  {msg.content}
                </div>

                {/* Triage badge */}
                {msg.triage && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.15, type: "spring", stiffness: 260, damping: 22 }}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${URGENCY_STYLES[msg.triage.urgency] ?? "urgency-low"}`}
                  >
                    <AlertTriangle className="w-3 h-3" />
                    {msg.triage.urgency.toUpperCase()} — {msg.triage.suggested_action}
                  </motion.div>
                )}

                {/* Tool chips */}
                {msg.tools_called && msg.tools_called.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {msg.tools_called.map((t, i) => (
                      <motion.span
                        key={t}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 + i * 0.05 }}
                        className="tool-chip"
                      >
                        <Wrench className="w-2.5 h-2.5" />
                        {t}
                      </motion.span>
                    ))}
                  </div>
                )}

                {/* Model badge */}
                {msg.model && <div className="badge-gemini text-[10px]"><Sparkles className="w-2.5 h-2.5" />Grok / Llama-3.3</div>}

                {/* Disclaimer */}
                {msg.role === "assistant" && msg.id !== "welcome" && (
                  <p className="text-[10px] text-gray-600 italic">
                    Not medical advice. Always consult your doctor.
                  </p>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Agent step indicators */}
        <AnimatePresence>
          {loading && showSteps && steps.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
              className="flex gap-3"
            >
              <div className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center bg-gradient-to-br from-amber-500 to-orange-500 shadow-glow">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="glass-sm px-4 py-3 space-y-2">
                {steps.map((s, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className={`flex items-center gap-2 text-xs ${i === steps.length - 1 ? "text-teal-300 step-active" : "text-gray-500"}`}
                  >
                    {i === steps.length - 1 ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <CheckCircle className="w-3 h-3 text-green-400" />
                    )}
                    {s.label}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={bottomRef} />
      </div>

      {/* Quick suggestions */}
      <AnimatePresence>
        {messages.length === 1 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="flex flex-wrap gap-2 my-3"
          >
            {suggestions.map((s, i) => (
              <motion.button
                key={s}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.06 }}
                whileHover={{ y: -2, scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setInput(s)}
                className="text-xs px-3 py-1.5 rounded-full glass-sm hover:border-teal-500/40 text-gray-400 hover:text-teal-300 transition-all"
              >
                {s}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.4 }}
        className="mt-3 glass-sm p-3 flex gap-3 items-end"
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask about your records, symptoms, or medications…"
          rows={1}
          className="flex-1 bg-transparent resize-none text-sm text-gray-200 placeholder-gray-500 focus:outline-none leading-relaxed max-h-32"
          disabled={loading}
        />
        <motion.button
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.92 }}
          onClick={sendMessage}
          disabled={!input.trim() || loading}
          className="btn-primary flex-shrink-0 !py-2 !px-3"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </motion.button>
      </motion.div>
    </div>
  );
}
