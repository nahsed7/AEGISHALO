"use client";

import dynamic from "next/dynamic";
import { Crosshair, Expand, RotateCcw, User } from "lucide-react";
import { useAegis } from "@/store/useAegis";
import { PrivacyDiff } from "@/components/vault/PrivacyDiff";
import { SAMPLE_REPORTS } from "@/lib/samples/reports";

const HoloAnatomyViewer = dynamic(() => import("./HoloAnatomyViewer"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center font-mono text-[12px] text-[var(--hud-text-dim)]">Initialising hologram…</div>,
});

export function HoloStage() {
  const view = useAegis((s) => s.view);
  const setView = useAegis((s) => s.setView);
  const resetCamera = useAegis((s) => s.resetCamera);
  const sim = useAegis((s) => s.simulation);
  const hasRecord = useAegis((s) => Boolean(s.activeId));
  const ready = useAegis((s) => s.ready);
  const processing = useAegis((s) => s.processing);
  const loadSample = useAegis((s) => s.loadSample);
  const day = useAegis((s) => s.day);

  const worst = sim?.organs.filter((o) => o.status !== "healthy").sort((a, b) => b.severity - a.severity)[0];

  return (
    <section aria-label="3D holographic anatomy" data-state={worst?.status ?? "healthy"} className="holo-stage min-h-[420px] flex-1">
      <div className="absolute inset-0">
        <HoloAnatomyViewer />
      </div>
      <div className="holo-frame" aria-hidden />

      <div className="absolute top-4 left-4 z-20 flex flex-wrap gap-2">
        <div className="hud-seg" role="group" aria-label="Camera view">
          <button aria-pressed={view === "full"} onClick={() => setView("full")}>
            <span className="inline-flex items-center gap-1.5">
              <User size={13} aria-hidden /> Full body
            </span>
          </button>
          <button aria-pressed={view === "focus"} disabled={!worst} onClick={() => worst && setView("focus", worst.organ)} className="disabled:opacity-40">
            <span className="inline-flex items-center gap-1.5">
              <Crosshair size={13} aria-hidden /> {worst ? "Inspect pathology" : "Zoom to organ"}
            </span>
          </button>
          <button aria-pressed={view === "exploded"} onClick={() => setView("exploded")}>
            <span className="inline-flex items-center gap-1.5">
              <Expand size={13} aria-hidden /> Exploded
            </span>
          </button>
        </div>
        <button className="hud-btn hud-btn--ghost !h-[36px] bg-[rgba(3,8,17,0.6)]" onClick={resetCamera}>
          <RotateCcw size={13} aria-hidden /> Reset camera
        </button>
      </div>

      <div className="pointer-events-none absolute right-4 bottom-4 left-4 z-20 flex flex-wrap items-end justify-between gap-3">
        <ul className="flex gap-3 rounded-lg bg-[rgba(3,8,17,0.6)] px-3 py-2 text-[11px] text-[var(--hud-text-dim)]" aria-label="Legend">
          <li className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[var(--hud-cyan)]" /> in range
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[var(--hud-amber)]" /> watch
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[var(--hud-crimson)]" /> alert
          </li>
          <li className="tabular font-mono text-[var(--hud-text)]">{day === 0 ? "today" : `day ${day}`}</li>
        </ul>
        <p className="rounded-lg bg-[rgba(3,8,17,0.6)] px-3 py-2 text-[11px] text-[var(--hud-text-dim)]">Drag to rotate · scroll to zoom · click an organ</p>
      </div>

      {ready && !hasRecord && !processing && (
        <div className="absolute inset-x-0 top-1/2 z-10 mx-auto w-[min(380px,calc(100%-32px))] -translate-y-1/2 rounded-[14px] border border-[var(--hud-line-strong)] bg-[rgba(3,9,18,0.82)] p-5 text-center backdrop-blur-md">
          <h2 className="font-display text-[18px] font-semibold">No report loaded</h2>
          <p className="mt-1.5 text-[13px] text-[var(--hud-text-dim)]">
            Load the sample pancreas and duodenal report to watch it get read, redacted and mapped onto the body, all on this device first.
          </p>
          <button className="hud-btn hud-btn--primary mt-4" onClick={() => void loadSample(SAMPLE_REPORTS[0])}>
            Load sample report
          </button>
        </div>
      )}

      <PrivacyDiff />
    </section>
  );
}
