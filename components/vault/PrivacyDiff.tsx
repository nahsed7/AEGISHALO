"use client";

import { useEffect, useMemo } from "react";
import { X } from "lucide-react";
import { useAegis, useActiveRecord } from "@/store/useAegis";
import type { RedactionResult } from "@/types/health";

function RawWithMarks({ r }: { r: RedactionResult }) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  r.spans.forEach((s, i) => {
    parts.push(r.raw.slice(cursor, s.start));
    parts.push(
      <mark key={i} className="pii-raw" title={`${s.type} · found by ${s.detector === "on-device-ai" ? "Gemini Nano" : "rules"}`}>
        {s.text}
      </mark>,
    );
    cursor = s.end;
  });
  parts.push(r.raw.slice(cursor));
  return <>{parts}</>;
}

function RedactedWithTokens({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\[[A-Z_]+_\d+\])/g).map((p, i) =>
        /^\[[A-Z_]+_\d+\]$/.test(p) ? (
          <mark key={i} className="pii-token">
            {p}
          </mark>
        ) : (
          p
        ),
      )}
    </>
  );
}

/** Side-by-side raw vs redacted, plus the exact outbound payload. Overlays the 3D stage. */
export function PrivacyDiff() {
  const show = useAegis((s) => s.showDiff);
  const setShow = useAegis((s) => s.setShowDiff);
  const symptoms = useAegis((s) => s.symptoms);
  const scenario = useAegis((s) => s.scenario);
  const rec = useActiveRecord();

  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setShow(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show, setShow]);

  const payload = useMemo(() => (rec ? JSON.stringify({ profile: rec.profile, symptoms, scenario }, null, 2) : ""), [rec, symptoms, scenario]);
  if (!show || !rec) return null;
  const r = rec.redaction;

  return (
    <section aria-label="Privacy firewall diff" className="absolute inset-3 z-30 flex flex-col overflow-hidden rounded-[12px] border border-[var(--hud-line-strong)] bg-[rgba(3,9,18,0.94)] backdrop-blur-md">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--hud-line)] px-4 py-3">
        <div>
          <h2 className="hud-heading">Privacy firewall</h2>
          <p className="mt-0.5 text-[12px] text-[var(--hud-text-dim)]">Left: what stays on this device. Middle: the redacted text. Right: the exact JSON that may leave.</p>
        </div>
        <button className="hud-btn hud-btn--ghost !h-8 !w-8 !px-0" aria-label="Close privacy diff" onClick={() => setShow(false)}>
          <X size={15} />
        </button>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-px bg-[var(--hud-line)] md:grid-cols-3">
        {[
          { title: "Raw · device only", body: <RawWithMarks r={r} />, tone: "text-[#ffb3ad]" },
          { title: "Redacted", body: <RedactedWithTokens text={r.redacted} />, tone: "text-[var(--hud-cyan)]" },
          { title: `Outbound payload · ${new TextEncoder().encode(payload).length} bytes`, body: payload, tone: "text-[var(--hud-text)]" },
        ].map((col) => (
          <div key={col.title} className="flex min-h-0 flex-col bg-[rgba(3,9,18,0.96)]">
            <h3 className={`hud-label border-b border-[var(--hud-line)] px-4 py-2 ${col.tone}`}>{col.title}</h3>
            <pre className="min-h-0 flex-1 overflow-auto px-4 py-3 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-[var(--hud-text-dim)]">{col.body}</pre>
          </div>
        ))}
      </div>
    </section>
  );
}
