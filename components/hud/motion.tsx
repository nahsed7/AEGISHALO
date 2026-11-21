"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Rolls a number to its new value (450ms, strong ease-out) so a changed severity reads as a
 * change, not a swap. Skipped under reduced motion.
 */
export function useCountTo(target: number, ms = 450) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setV(target);
      from.current = target;
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - t, 4);
      const next = a + (target - a) * e;
      setV(next);
      from.current = next;
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

export function CountTo({ value, suffix = "" }: { value: number; suffix?: string }) {
  const v = useCountTo(value);
  return (
    <span className="tabular">
      {Math.round(v)}
      {suffix}
    </span>
  );
}

/** Segmented control whose single indicator travels between equal-width cells. */
export function SlideSeg<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange(v: T): void;
  label: string;
}) {
  const i = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div className="hud-seg hud-seg--slide" role="group" aria-label={label} style={{ ["--n" as string]: options.length, ["--i" as string]: i }}>
      <span className="hud-seg__ind" aria-hidden />
      {options.map((o) => (
        <button key={String(o.value)} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
