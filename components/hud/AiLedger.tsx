"use client";

import { X } from "lucide-react";
import { useEffect } from "react";
import { useAegis } from "@/store/useAegis";
import type { InferenceRoute } from "@/types/health";

const ROUTE_STYLE: Record<InferenceRoute, { label: string; cls: string }> = {
  ON_DEVICE: { label: "On device", cls: "route-tag--device" },
  IN_CLOUD: { label: "Cloud", cls: "route-tag--cloud" },
  LOCAL_RULES: { label: "Local code", cls: "border-[var(--hud-line-strong)] text-[var(--hud-text-dim)]" },
  APP_SERVER: { label: "App server", cls: "border-[var(--hud-line-strong)] text-[var(--hud-text)]" },
  BLOCKED: { label: "Blocked", cls: "border-[var(--hud-crimson)] text-[var(--hud-crimson)]" },
};

function bytes(n: number) {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} kB`;
}

/** Every inference and data hop, with where it ran and what left the device. */
export function AiLedger() {
  const open = useAegis((s) => s.ledgerOpen);
  const setOpen = useAegis((s) => s.setLedgerOpen);
  const ledger = useAegis((s) => s.ledger);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const out = ledger.reduce((a, l) => a + l.bytesOut, 0);
  const onDevice = ledger.filter((l) => l.route === "ON_DEVICE").length;
  const inCloud = ledger.filter((l) => l.route === "IN_CLOUD").length;

  return (
    <aside
      id="ai-ledger"
      data-open={open}
      aria-hidden={!open}
      className="ledger-drawer hud-panel !bg-[rgba(5,14,26,0.94)] absolute top-0 right-0 bottom-0 z-40 flex w-[min(400px,100%)] flex-col"
    >
      <div className="flex items-start justify-between gap-3 border-b border-[var(--hud-line)] p-4">
        <div>
          <h2 className="hud-heading">AI route log</h2>
          <p className="mt-1 text-[12px] text-[var(--hud-text-dim)]">Where each step ran, and exactly what left this device.</p>
        </div>
        <button className="hud-btn hud-btn--ghost !h-8 !w-8 !px-0" aria-label="Close AI route log" onClick={() => setOpen(false)}>
          <X size={15} />
        </button>
      </div>
      <dl className="grid grid-cols-3 gap-px border-b border-[var(--hud-line)] text-center">
        {[
          ["On device", onDevice, "text-[var(--hud-device)]"],
          ["Cloud", inCloud, "text-[var(--hud-cloud)]"],
          ["Sent", bytes(out), "text-[var(--hud-text)]"],
        ].map(([k, v, c]) => (
          <div key={String(k)} className="px-2 py-3">
            <dt className="hud-label">{k}</dt>
            <dd className={`tabular mt-1 font-mono text-[16px] ${c}`}>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="border-b border-[var(--hud-line)] px-4 py-2.5 text-[12px] text-[var(--hud-text-dim)]">
        Personal details sent: <span className="font-mono text-[var(--hud-device)]">0</span>. Every outbound payload passes the privacy guard first.
      </p>
      <ol className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {ledger.length === 0 && <li className="p-3 text-[13px] text-[var(--hud-text-dim)]">Nothing has run yet. Load a sample report to watch the routing.</li>}
        {ledger.map((l) => {
          const r = ROUTE_STYLE[l.route];
          return (
            <li key={l.id} className="ledger-entry rounded-[10px] border border-[var(--hud-line)] bg-[rgba(3,8,17,0.5)] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-medium text-[var(--hud-text)]">{l.task}</span>
                <span className={`shrink-0 rounded-md border px-1.5 py-0.5 font-display text-[10px] font-semibold tracking-[0.08em] uppercase ${r.cls}`}>{r.label}</span>
              </div>
              <div className="tabular mt-1.5 flex flex-wrap gap-x-3 font-mono text-[11px] text-[var(--hud-text-dim)]">
                {l.mode && <span>{l.mode}</span>}
                <span>{l.ms} ms</span>
                <span>out {bytes(l.bytesOut)}</span>
                <span>{new Date(l.at).toLocaleTimeString()}</span>
              </div>
              {l.note && <p className={`mt-1.5 text-[12px] ${l.ok ? "text-[var(--hud-text-dim)]" : "text-[#ffb3ad]"}`}>{l.note}</p>}
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
