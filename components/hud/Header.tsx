"use client";

import { Cpu, Cloud, ShieldCheck, Activity } from "lucide-react";
import { useAegis } from "@/store/useAegis";
import { getAppCheckState } from "@/lib/firebase";
import { useEffect, useState } from "react";

const DEVICE_COPY: Record<string, { text: string; tone: string }> = {
  available: { text: "Gemini Nano ready", tone: "text-[var(--hud-device)]" },
  downloading: { text: "Gemini Nano downloading", tone: "text-[var(--hud-amber)]" },
  downloadable: { text: "Gemini Nano not downloaded", tone: "text-[var(--hud-amber)]" },
  unavailable: { text: "Gemini Nano unavailable", tone: "text-[var(--hud-text-dim)]" },
  unsupported: { text: "No on-device model in this browser", tone: "text-[var(--hud-text-dim)]" },
};

function Dot({ on, warn }: { on: boolean; warn?: boolean }) {
  return <span className={`inline-block size-1.5 rounded-full ${on ? "bg-[var(--hud-device)]" : warn ? "bg-[var(--hud-cloud)]" : "bg-[var(--hud-text-faint)]"}`} aria-hidden />;
}

export function Header() {
  const device = useAegis((s) => s.device);
  const progress = useAegis((s) => s.deviceProgress);
  const cloud = useAegis((s) => s.cloud);
  const ledger = useAegis((s) => s.ledger);
  const ledgerOpen = useAegis((s) => s.ledgerOpen);
  const setLedgerOpen = useAegis((s) => s.setLedgerOpen);
  const enableOnDevice = useAegis((s) => s.enableOnDevice);
  const [appCheck, setAppCheck] = useState<string>("off");
  useEffect(() => setAppCheck(getAppCheckState().state), [cloud]);

  const d = DEVICE_COPY[device];
  const canEnable = device === "downloadable" || device === "downloading";

  return (
    <header className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5">
      <div className="flex items-center gap-2.5">
        <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden className="text-[var(--hud-cyan)]">
          <path d="M13 1.5 23 6.5v7c0 5.6-4.2 9.6-10 11-5.8-1.4-10-5.4-10-11v-7L13 1.5Z" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M7 13.5h3.2l1.6-3.6 2.6 7 1.7-3.4H19" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h1 className="font-display text-[17px] font-bold tracking-[0.06em]">
          AEGISHOLO <span className="font-semibold text-[var(--hud-cyan)]">HEALTH</span>
        </h1>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2 text-[12px]">
        <div className="flex items-center gap-2 rounded-lg border border-[var(--hud-line)] px-2.5 py-1.5">
          <Cpu size={14} className={d.tone} aria-hidden />
          <span className={d.tone}>
            {d.text}
            {device === "downloading" && progress !== null ? ` ${Math.round(progress * 100)}%` : ""}
          </span>
          {canEnable && (
            <button className="hud-btn !h-6 !px-2 text-[11px]" onClick={enableOnDevice}>
              {device === "downloading" ? "Retry" : "Download"}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-[var(--hud-line)] px-2.5 py-1.5" title="Firebase AI Logic">
          <Cloud size={14} className={cloud ? "text-[var(--hud-cloud)]" : "text-[var(--hud-text-dim)]"} aria-hidden />
          <span className={cloud ? "text-[var(--hud-text)]" : "text-[var(--hud-text-dim)]"}>{cloud ? "Firebase AI Logic connected" : "Demo mode: no Firebase keys"}</span>
        </div>
        <div className="hidden items-center gap-2 rounded-lg border border-[var(--hud-line)] px-2.5 py-1.5 lg:flex">
          <ShieldCheck size={14} className={appCheck !== "off" ? "text-[var(--hud-cyan)]" : "text-[var(--hud-text-dim)]"} aria-hidden />
          <span className="text-[var(--hud-text-dim)]">App Check {appCheck === "off" ? "off" : appCheck === "debug" ? "debug" : "on"}</span>
        </div>
        <button className="hud-btn" aria-expanded={ledgerOpen} aria-controls="ai-ledger" onClick={() => setLedgerOpen(!ledgerOpen)}>
          <Activity size={14} aria-hidden />
          AI route log
          <span className="tabular rounded bg-[rgba(0,240,255,0.16)] px-1.5 font-mono text-[11px] text-[var(--hud-cyan)]">{ledger.length}</span>
          <Dot on={ledger.some((l) => l.route === "ON_DEVICE")} warn={ledger.some((l) => l.route === "IN_CLOUD")} />
        </button>
      </div>
    </header>
  );
}
