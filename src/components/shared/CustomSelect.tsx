"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type CustomSelectOption = {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  /** Optional visual color for color/frame pickers. If omitted, #HEX value/description is detected automatically. */
  color?: string;
};

function detectOptionColor(option?: CustomSelectOption): string | null {
  if (!option) return null;
  const direct = option.color || option.value;
  const fromDirect = String(direct || "").match(/#[0-9a-f]{6}/i)?.[0];
  if (fromDirect) return fromDirect;
  if (typeof option.description === "string") return option.description.match(/#[0-9a-f]{6}/i)?.[0] ?? null;
  return null;
}

export function CustomSelect({
  value,
  onChange,
  options,
  placeholder = "Выбрать",
  disabled = false,
  className,
  buttonClassName,
  menuClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  options: CustomSelectOption[];
  placeholder?: ReactNode;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 260, maxHeight: 280 });
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => options.find((item) => item.value === value), [options, value]);
  const selectedColor = detectOptionColor(selected);

  useEffect(() => setMounted(true), []);

  const updatePosition = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const edgeGap = 18;
    const menuGap = 8;
    const desired = Math.min(320, Math.max(220, window.innerHeight * 0.42));
    const roomBelow = window.innerHeight - rect.bottom - edgeGap;
    const roomAbove = rect.top - edgeGap;
    const openAbove = roomBelow < 190 && roomAbove > roomBelow;
    const available = Math.max(120, (openAbove ? roomAbove : roomBelow) - menuGap);
    const maxHeight = Math.max(120, Math.min(desired, available));
    const top = openAbove
      ? Math.max(edgeGap, rect.top - maxHeight - menuGap)
      : Math.min(rect.bottom + menuGap, window.innerHeight - edgeGap - maxHeight);

    setPosition({
      top,
      left: Math.min(Math.max(edgeGap, rect.left), Math.max(edgeGap, window.innerWidth - rect.width - edgeGap)),
      width: Math.max(180, rect.width),
      maxHeight,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const coloredButtonStyle: CSSProperties | undefined = selectedColor
    ? {
        background: `linear-gradient(135deg, ${selectedColor}42, rgba(7,3,18,0.98) 62%)`,
        borderColor: `${selectedColor}88`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), 0 0 18px ${selectedColor}22`,
      }
    : undefined;

  return (
    <div ref={rootRef} className={cn("relative min-w-0", className)}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={cn(
          "group flex min-h-10 w-full items-center gap-2 rounded-2xl border border-white/10 px-3 py-2.5 text-left text-sm outline-none transition",
          "bg-white/[0.055] text-white/82 hover:border-neon-purple/40 hover:bg-white/[0.075] focus:border-neon-purple/60 focus:shadow-[0_0_0_3px_rgb(var(--accent-main-rgb)/0.15)]",
          disabled && "cursor-not-allowed opacity-50",
          buttonClassName,
        )}
        style={coloredButtonStyle}
      >
        {selectedColor && <span className="h-4 w-4 shrink-0 rounded-md border border-white/25" style={{ background: selectedColor, boxShadow: `0 0 10px ${selectedColor}77` }} />}
        <span className={cn("min-w-0 flex-1 truncate", !selected && "text-white/35")}>{selected?.label ?? placeholder}</span>
        <ChevronDown size={15} className={cn("shrink-0 text-white/40 transition", open && "rotate-180 text-neon-purple")} />
      </button>

      {mounted && createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={menuRef}
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.14 }}
              className={cn(
                "fixed z-[120000] overflow-hidden rounded-3xl border border-neon-purple/30 bg-[#090512] p-1.5 shadow-[0_0_34px_rgba(168,85,247,0.28)]",
                menuClassName,
              )}
              style={{ top: position.top, left: position.left, width: position.width }}
            >
              <div className="ng-select-scroll overflow-y-auto pr-2" style={{ maxHeight: position.maxHeight, scrollbarGutter: "stable" }}>
                {options.map((item) => {
                  const active = item.value === value;
                  const optionColor = detectOptionColor(item);
                  const activeStyle: CSSProperties | undefined = active && optionColor
                    ? {
                        background: `linear-gradient(135deg, ${optionColor}44, rgba(255,255,255,0.06))`,
                        borderColor: `${optionColor}88`,
                        boxShadow: `0 0 14px ${optionColor}22`,
                      }
                    : undefined;
                  return (
                    <button
                      key={item.value || "__empty"}
                      type="button"
                      disabled={item.disabled}
                      onClick={() => {
                        if (item.disabled) return;
                        onChange(item.value);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-2xl border border-transparent px-3 py-2.5 text-left text-sm transition",
                        active ? "bg-neon-purple/22 text-white" : "text-white/70 hover:bg-white/8 hover:text-white",
                        item.disabled && "cursor-not-allowed opacity-45",
                      )}
                      style={activeStyle}
                    >
                      {optionColor && <span className="h-4 w-4 shrink-0 rounded-md border border-white/25" style={{ background: optionColor, boxShadow: active ? `0 0 10px ${optionColor}` : undefined }} />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{item.label}</span>
                        {item.description && <span className="mt-0.5 block truncate text-[11px] text-white/38">{item.description}</span>}
                      </span>
                      {active && <Check size={14} className="shrink-0 text-white" />}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
