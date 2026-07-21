"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, Check, Loader2, Lock, Square, CheckSquare } from "lucide-react";
import type { Message } from "@/types";
import { cn } from "@/lib/utils";

export function PollCard({
  message,
  mine,
  canClose,
  onVote,
  onClose,
}: {
  message: Message;
  mine: boolean;
  canClose: boolean;
  onVote: (optionIds: string[]) => Promise<void>;
  onClose: () => Promise<void>;
}) {
  const poll = message.poll;
  const [selected, setSelected] = useState<string[]>(poll?.myOptionIds || []);
  const [submitting, setSubmitting] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    setSelected(poll?.myOptionIds || []);
  }, [poll?.myOptionIds]);

  const maxVotes = useMemo(() => Math.max(1, ...(poll?.options || []).map((option) => option.votesCount)), [poll?.options]);
  if (!poll) return null;

  const closed = Boolean(poll.closedAt);
  const submit = async (next: string[]) => {
    if (closed || submitting) return;
    setSubmitting(true);
    try {
      await onVote(next);
      setSelected(next);
    } finally {
      setSubmitting(false);
    }
  };

  const toggle = (optionId: string) => {
    if (closed) return;
    if (!poll.allowMultiple) {
      void submit(selected.includes(optionId) ? [] : [optionId]);
      return;
    }
    setSelected((current) => current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId]);
  };

  return (
    <div className={cn(
      "w-[min(360px,78vw)] rounded-3xl border p-3.5 shadow-lg",
      mine ? "border-white/15 bg-white/10" : "border-white/8 bg-black/20",
    )}>
      <div className="flex items-start gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-neon-purple/15 text-neon-purple">
          <BarChart3 size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">Опрос</div>
          <div className="mt-0.5 break-words text-sm font-semibold text-white/90">{poll.question}</div>
          <div className="mt-1 text-[11px] text-white/40">
            {poll.anonymous ? "Анонимный" : "Открытый"} · {poll.allowMultiple ? "несколько ответов" : "один ответ"}
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {poll.options.map((option) => {
          const active = selected.includes(option.id);
          const percent = poll.totalVotes > 0 ? Math.round((option.votesCount / poll.totalVotes) * 100) : 0;
          const width = poll.totalVotes > 0 ? `${Math.max(5, (option.votesCount / maxVotes) * 100)}%` : "0%";
          return (
            <button
              key={option.id}
              type="button"
              disabled={closed || submitting}
              onClick={() => toggle(option.id)}
              className={cn(
                "relative block w-full overflow-hidden rounded-2xl border px-3 py-2.5 text-left transition",
                active ? "border-neon-purple/55 bg-neon-purple/12" : "border-white/8 bg-white/[0.035] hover:border-white/16",
                closed && "cursor-default",
              )}
            >
              <span className="absolute inset-y-0 left-0 bg-neon-purple/10 transition-all" style={{ width }} />
              <span className="relative flex items-center gap-2">
                {poll.allowMultiple
                  ? active ? <CheckSquare size={15} className="text-neon-purple" /> : <Square size={15} className="text-white/30" />
                  : <span className={cn("grid h-4 w-4 place-items-center rounded-full border", active ? "border-neon-purple bg-neon-purple" : "border-white/25")}>{active && <Check size={10} />}</span>}
                <span className="min-w-0 flex-1 break-words text-xs text-white/80">{option.text}</span>
                <span className="shrink-0 text-[11px] text-white/40">{option.votesCount} · {percent}%</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-white/35">
        <span>{poll.totalVotes} голос{poll.totalVotes === 1 ? "" : "ов"}{closed ? " · завершён" : ""}</span>
        <div className="flex items-center gap-2">
          {poll.allowMultiple && !closed && (
            <button
              type="button"
              disabled={submitting}
              onClick={() => void submit(selected)}
              className="rounded-xl bg-neon-purple/15 px-2.5 py-1.5 font-semibold text-neon-purple hover:bg-neon-purple/20 disabled:opacity-50"
            >
              {submitting ? <Loader2 size={12} className="animate-spin" /> : "Голосовать"}
            </button>
          )}
          {canClose && !closed && (
            <button
              type="button"
              disabled={closing}
              onClick={async () => {
                setClosing(true);
                try { await onClose(); } finally { setClosing(false); }
              }}
              className="inline-flex items-center gap-1 rounded-xl px-2 py-1.5 text-white/45 hover:bg-white/5 hover:text-white"
            >
              {closing ? <Loader2 size={12} className="animate-spin" /> : <Lock size={12} />} Завершить
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
