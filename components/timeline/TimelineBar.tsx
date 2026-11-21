"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquareText, Copy, Check, Loader2 } from "lucide-react";
import { useAegis, useActiveRecord } from "@/store/useAegis";

const DAY = 86_400_000;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function parseDate(s?: string, fallback?: string) {
  const t = Date.parse(s ?? "");
  return Number.isFinite(t) ? t : Date.parse(fallback ?? "") || Date.now();
}

function Timeline() {
  const records = useAegis((s) => s.records);
  const sim = useAegis((s) => s.simulation);
  const day = useAegis((s) => s.day);
  const selected = useAegis((s) => s.selectedMarker);
  const setSelected = useAegis((s) => s.setSelectedMarker);
  const rec = useActiveRecord();
  const [wrap, width] = useWidth<HTMLDivElement>();

  const candidates = useMemo(() => (rec?.profile.biomarkers ?? []).filter((b) => b.flag !== "normal" && b.flag !== "negative" && b.unit), [rec]);
  const markerId = selected && rec?.profile.biomarkers.some((b) => b.id === selected) ? selected : ([...candidates].sort((a, b) => (b.ratioToUln ?? 0) - (a.ratioToUln ?? 0))[0]?.id ?? null);
  const marker = rec?.profile.biomarkers.find((b) => b.id === markerId);
  const proj = sim?.projections.find((p) => p.biomarkerId === markerId);

  if (!rec || !marker) {
    return (
      <div className="grid h-full place-items-center px-6 text-center text-[13px] text-[var(--hud-text-dim)]">
        Load a report to see each value over time, and where the What-If scenario could take it.
      </div>
    );
  }

  const anchor = parseDate(rec.profile.report.collectedOn, rec.createdAt);
  const history = records
    .map((r) => {
      const b = r.profile.biomarkers.find((x) => x.id === markerId);
      return b ? { t: parseDate(r.profile.report.collectedOn, r.createdAt), v: b.value, active: r.id === rec.id } : null;
    })
    .filter((x): x is { t: number; v: number; active: boolean } => x !== null)
    .sort((a, b) => a.t - b.t);
  const scenario = (proj?.scenario ?? []).map((p) => ({ t: anchor + p.day * DAY, v: p.value }));
  const baseline = (proj?.baseline ?? []).map((p) => ({ t: anchor + p.day * DAY, v: p.value }));

  const H = 132;
  const padL = 44;
  const padR = 12;
  const padT = 10;
  const W = Math.max(280, width);
  const t0 = Math.min(anchor - 30 * DAY, ...history.map((h) => h.t));
  const t1 = anchor + 92 * DAY;
  const values = [...history, ...scenario, ...baseline].map((p) => p.v).concat(marker.refHigh ?? [], marker.refLow ?? []);
  const vMax = Math.max(...values) * 1.1;
  const vMin = Math.min(0, ...values);
  const x = (t: number) => padL + ((t - t0) / (t1 - t0)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - vMin) / (vMax - vMin)) * (H - padT - 18);
  const line = (pts: { t: number; v: number }[]) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const ticks = [vMin, (vMin + vMax) / 2, vMax].map((v) => Math.round(v));
  const months: number[] = [];
  const d = new Date(t0);
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  for (; d.getTime() < t1; d.setMonth(d.getMonth() + 1)) months.push(d.getTime());
  const scrub = anchor + day * DAY;

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex flex-wrap items-center gap-1.5">
        {(candidates.length ? candidates : [marker]).map((b) => (
          <button key={b.id} className="hud-chip !min-h-6 !py-0.5 text-[11.5px]" aria-pressed={b.id === markerId} onClick={() => setSelected(b.id)}>
            {b.name}
          </button>
        ))}
      </div>
      <div ref={wrap} className="mt-2 min-h-0 flex-1">
        <svg width={W} height={H} role="img" aria-label={`${marker.name} history and 90-day projection`} className="block overflow-visible">
          {marker.refHigh !== undefined && (
            <rect x={padL} width={W - padL - padR} y={y(marker.refHigh)} height={Math.max(0, y(marker.refLow ?? vMin) - y(marker.refHigh))} fill="rgba(0,240,255,0.06)" />
          )}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="rgba(0,240,255,0.08)" />
              <text x={padL - 6} y={y(t) + 3} textAnchor="end" className="fill-[var(--hud-text-faint)] font-mono text-[10px]">
                {t}
              </text>
            </g>
          ))}
          {months.map((m) => (
            <text key={m} x={x(m)} y={H - 2} textAnchor="middle" className="fill-[var(--hud-text-faint)] font-mono text-[10px]">
              {new Date(m).toLocaleString("en", { month: "short" })}
            </text>
          ))}
          <line x1={x(anchor)} x2={x(anchor)} y1={padT} y2={H - 16} stroke="rgba(220,247,255,0.25)" strokeDasharray="2 3" />
          <text x={x(anchor) + 4} y={padT + 8} className="fill-[var(--hud-text-dim)] font-mono text-[10px]">
            this report
          </text>
          {baseline.length > 0 && <path d={line(baseline)} fill="none" stroke="var(--hud-amber)" strokeOpacity={0.75} strokeWidth={1.4} strokeDasharray="4 4" />}
          {scenario.length > 0 && <path d={line(scenario)} fill="none" stroke="var(--hud-cyan)" strokeWidth={2} />}
          {history.length > 1 && <path d={line(history)} fill="none" stroke="var(--hud-text)" strokeOpacity={0.7} strokeWidth={1.5} />}
          {history.map((h) => (
            <circle key={h.t} cx={x(h.t)} cy={y(h.v)} r={h.active ? 4 : 3} fill={h.active ? "var(--hud-cyan)" : "var(--hud-text)"} />
          ))}
          {day > 0 && <line x1={x(scrub)} x2={x(scrub)} y1={padT} y2={H - 16} stroke="var(--hud-cyan)" strokeOpacity={0.6} />}
        </svg>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--hud-text-dim)]">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 bg-[var(--hud-text)]" /> measured
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 bg-[var(--hud-cyan)]" /> with your What-If
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0 w-4 border-t border-dashed border-[var(--hud-amber)]" /> no change
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 bg-[rgba(0,240,255,0.15)]" /> reference range
        </span>
      </div>
    </div>
  );
}

function DoctorQuestions() {
  const sim = useAegis((s) => s.simulation);
  const questions = useAegis((s) => s.doctorQuestions);
  const busy = useAegis((s) => s.questionsBusy);
  const ask = useAegis((s) => s.askQuestions);
  const [copied, setCopied] = useState(false);
  const list = questions.length ? questions : (sim?.doctorQuestions ?? []);

  const copy = async () => {
    await navigator.clipboard.writeText(list.map((q, i) => `${i + 1}. ${q}`).join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2">
        <h2 className="hud-heading">Questions for your doctor</h2>
        <div className="flex gap-1.5">
          <button className="hud-btn !h-7 text-[11px]" disabled={!sim || busy} onClick={() => void ask()}>
            {busy ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <MessageSquareText size={13} aria-hidden />}
            {busy ? "Writing…" : "Write with AI"}
          </button>
          <button className="hud-btn hud-btn--ghost !h-7 !w-7 !px-0" disabled={!list.length} aria-label="Copy questions" onClick={() => void copy()}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
        </div>
      </div>
      <p className="mt-0.5 text-[11.5px] text-[var(--hud-text-faint)]">Gemini Nano writes these on this device when it can, and the cloud model when it can't.</p>
      <ol className="mt-2 min-h-0 flex-1 list-decimal space-y-1.5 overflow-y-auto pl-5 text-[12.5px] leading-snug text-[var(--hud-text)] marker:font-mono marker:text-[var(--hud-cyan-dim)]">
        {list.map((q) => (
          <li key={q}>{q}</li>
        ))}
        {!list.length && <li className="list-none text-[var(--hud-text-dim)]">Questions appear once a report is loaded.</li>}
      </ol>
    </div>
  );
}

export function TimelineBar() {
  return (
    <section aria-label="Biomarker timeline and doctor questions" className="hud-panel grid grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.55fr)]">
      <div className="min-w-0">
        <h2 className="hud-heading mb-2">Biomarker timeline</h2>
        <div className="h-[196px]">
          <Timeline />
        </div>
      </div>
      <div className="h-[230px] min-w-0 border-t border-[var(--hud-line)] pt-3 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-4">
        <DoctorQuestions />
      </div>
    </section>
  );
}
