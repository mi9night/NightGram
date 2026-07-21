"use client";

import { useState } from "react";
import { BarChart3, Check, Loader2, Plus, Trash2, X } from "lucide-react";
import { motion } from "framer-motion";

export function CreatePollModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (payload: { question: string; options: string[]; allowMultiple: boolean; anonymous: boolean }) => Promise<void>;
}) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [anonymous, setAnonymous] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const validOptions = options.map((value) => value.trim()).filter(Boolean);
  const valid = question.trim().length >= 3 && validOptions.length >= 2;

  return (
    <div className="fixed inset-0 z-[10060] grid place-items-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={() => !submitting && onClose()} />
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="relative z-10 w-full max-w-lg rounded-[28px] ng-solid p-5 shadow-glow-lg"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-neon-purple/15 text-neon-purple"><BarChart3 size={18} /></span>
            <div>
              <h3 className="font-display text-lg font-bold">Новый опрос</h3>
              <p className="text-xs text-white/40">До 10 вариантов ответа</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl glass text-white/45 hover:text-white"><X size={16} /></button>
        </div>

        <label className="mt-5 block text-xs font-semibold text-white/55">Вопрос</label>
        <textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value.slice(0, 300))}
          rows={3}
          placeholder="О чём спросим?"
          className="mt-2 w-full resize-none rounded-2xl glass px-4 py-3 text-sm outline-none focus:border-neon-purple/45"
        />

        <div className="mt-4 space-y-2">
          {options.map((option, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/5 text-xs text-white/35">{index + 1}</span>
              <input
                value={option}
                onChange={(event) => setOptions((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.value.slice(0, 120) : value))}
                placeholder={`Вариант ${index + 1}`}
                className="min-w-0 flex-1 rounded-2xl glass px-3.5 py-2.5 text-sm outline-none focus:border-neon-purple/45"
              />
              {options.length > 2 && (
                <button type="button" onClick={() => setOptions((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="grid h-9 w-9 place-items-center rounded-xl text-white/35 hover:bg-red-500/10 hover:text-red-300"><Trash2 size={14} /></button>
              )}
            </div>
          ))}
        </div>

        {options.length < 10 && (
          <button type="button" onClick={() => setOptions((current) => [...current, ""])} className="mt-3 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-neon-purple hover:bg-neon-purple/10"><Plus size={14} /> Добавить вариант</button>
        )}

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={() => setAllowMultiple((value) => !value)} className="flex items-center gap-2 rounded-2xl glass px-3 py-3 text-left text-xs text-white/65">
            <span className={`grid h-5 w-5 place-items-center rounded-md border ${allowMultiple ? "border-neon-purple bg-neon-purple" : "border-white/20"}`}>{allowMultiple && <Check size={12} />}</span>
            Несколько ответов
          </button>
          <button type="button" onClick={() => setAnonymous((value) => !value)} className="flex items-center gap-2 rounded-2xl glass px-3 py-3 text-left text-xs text-white/65">
            <span className={`grid h-5 w-5 place-items-center rounded-md border ${anonymous ? "border-neon-purple bg-neon-purple" : "border-white/20"}`}>{anonymous && <Check size={12} />}</span>
            Анонимный опрос
          </button>
        </div>

        {error && <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div>}

        <button
          type="button"
          disabled={!valid || submitting}
          onClick={async () => {
            setSubmitting(true);
            setError("");
            try {
              await onCreate({ question: question.trim(), options: validOptions, allowMultiple, anonymous });
              onClose();
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : "Не удалось создать опрос");
            } finally {
              setSubmitting(false);
            }
          }}
          className="btn-glow mt-5 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-40"
        >
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <BarChart3 size={16} />}
          Создать опрос
        </button>
      </motion.div>
    </div>
  );
}
