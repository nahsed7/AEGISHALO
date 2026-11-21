"use client";

import { useRef, useState } from "react";
import { FileUp, FlaskConical, Trash2, FileJson, FileSpreadsheet, CloudUpload, ShieldCheck, Eye } from "lucide-react";
import { useAegis, useActiveRecord } from "@/store/useAegis";
import { SAMPLE_REPORTS } from "@/lib/samples/reports";
import { exportProfileCsv, exportProfileJson } from "@/lib/export";
import type { Biomarker, PiiType } from "@/types/health";

const PII_LABEL: Record<PiiType, string> = {
  name: "name",
  national_id: "NIC",
  phone: "phone",
  address: "address",
  hospital_id: "hospital ID",
  email: "email",
  dob: "date of birth",
  doctor: "doctor",
};

function flagTone(b: Biomarker) {
  if (b.flag === "critical") return "text-[var(--hud-crimson)]";
  if (b.flag === "high" || b.flag === "low" || b.flag === "positive") return "text-[var(--hud-amber)]";
  return "text-[var(--hud-text-dim)]";
}

function Dropzone() {
  const ingest = useAegis((s) => s.ingest);
  const busy = useAegis((s) => Boolean(s.processing));
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const take = (f?: File | null) => {
    if (!f) return;
    const kind = f.type === "application/pdf" ? "pdf" : f.type.startsWith("image/") ? "image" : "text";
    if (!f.type.startsWith("image/")) return void ingest(f, f.name, kind);
    // Keep a data-URL thumbnail so the vault still shows it after a reload.
    const fr = new FileReader();
    fr.onload = () => void ingest(f, f.name, kind, f.size < 3_000_000 ? String(fr.result) : undefined);
    fr.readAsDataURL(f);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        take(e.dataTransfer.files?.[0]);
      }}
      className={`rounded-xl border border-dashed p-4 text-center transition-colors duration-150 ${over ? "border-[var(--hud-cyan)] bg-[var(--hud-cyan-wash)]" : "border-[var(--hud-line-strong)]"}`}
    >
      <FileUp size={20} className="mx-auto text-[var(--hud-cyan)]" aria-hidden />
      <p className="mt-2 text-[13px] text-[var(--hud-text)]">Drop a lab report or prescription</p>
      <p className="mt-0.5 text-[12px] text-[var(--hud-text-dim)]">JPG, PNG, PDF or TXT. It is read on this device.</p>
      <button className="hud-btn mt-3" disabled={busy} onClick={() => input.current?.click()}>
        Choose file
      </button>
      <input ref={input} type="file" accept="image/png,image/jpeg,application/pdf,text/plain" className="sr-only" onChange={(e) => take(e.target.files?.[0])} />
    </div>
  );
}

export function VaultPanel() {
  const records = useAegis((s) => s.records);
  const activeId = useAegis((s) => s.activeId);
  const processing = useAegis((s) => s.processing);
  const loadSample = useAegis((s) => s.loadSample);
  const selectRecord = useAegis((s) => s.selectRecord);
  const removeRecord = useAegis((s) => s.removeRecord);
  const showDiff = useAegis((s) => s.showDiff);
  const setShowDiff = useAegis((s) => s.setShowDiff);
  const sync = useAegis((s) => s.sync);
  const syncAnonymised = useAegis((s) => s.syncAnonymised);
  const setSelectedMarker = useAegis((s) => s.setSelectedMarker);
  const rec = useActiveRecord();

  const types = rec ? [...new Set(rec.redaction.spans.map((s) => s.type))] : [];
  const onDevicePii = rec?.redaction.spans.some((s) => s.detector === "on-device-ai");

  return (
    <section aria-labelledby="vault-h" className="hud-panel flex h-full min-h-0 flex-col overflow-hidden">
      <div className="border-b border-[var(--hud-line)] px-4 pt-4 pb-3">
        <h2 id="vault-h" className="hud-heading">
          Report vault
        </h2>
        <p className="mt-1 text-[12px] text-[var(--hud-text-dim)]">Stored only in this browser.</p>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <Dropzone />

        <div>
          <h3 className="hud-label">Sample reports (fictional patient)</h3>
          <div className="mt-2 space-y-1.5">
            {SAMPLE_REPORTS.map((s) => (
              <button
                key={s.id}
                disabled={Boolean(processing)}
                onClick={() => void loadSample(s)}
                className="group flex w-full items-start gap-2.5 rounded-[10px] border border-[var(--hud-line)] px-3 py-2.5 text-left transition-[border-color,background-color,transform] duration-150 active:scale-[0.98] disabled:opacity-50 [@media(hover:hover)]:hover:border-[var(--hud-line-strong)] [@media(hover:hover)]:hover:bg-[var(--hud-cyan-wash)]"
              >
                <FlaskConical size={15} className="mt-0.5 shrink-0 text-[var(--hud-cyan)]" aria-hidden />
                <span>
                  <span className="block text-[13px] text-[var(--hud-text)]">Load {s.title}</span>
                  <span className="block text-[11.5px] text-[var(--hud-text-dim)]">{s.description}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {processing && (
          <div role="status" aria-live="polite">
            <p className="text-[12px] text-[var(--hud-text)]">{processing.label}</p>
            <div className="progress-track mt-1.5">
              <div className="progress-fill" style={{ transform: `scaleX(${Math.max(0.04, processing.fraction)})` }} />
            </div>
          </div>
        )}

        {records.length > 0 && (
          <div>
            <h3 className="hud-label">Your reports</h3>
            <ul className="mt-2 space-y-1.5">
              {records.map((r) => (
                <li key={r.id}>
                  <div
                    className={`flex items-center gap-2.5 rounded-[10px] border px-2 py-2 ${r.id === activeId ? "border-[var(--hud-cyan)] bg-[var(--hud-cyan-wash)]" : "border-[var(--hud-line)]"}`}
                  >
                    <button className="flex min-w-0 flex-1 items-center gap-2.5 text-left" onClick={() => selectRecord(r.id)} aria-current={r.id === activeId}>
                      {r.previewDataUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.previewDataUrl} alt="" className="h-10 w-8 shrink-0 rounded object-cover object-top opacity-80" />
                      ) : (
                        <span className="grid h-10 w-8 shrink-0 place-items-center rounded border border-[var(--hud-line)] font-mono text-[9px] text-[var(--hud-text-dim)]">{r.profile.report.sourceKind}</span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-[12.5px] text-[var(--hud-text)]">{r.profile.report.title}</span>
                        <span className="tabular block font-mono text-[10.5px] text-[var(--hud-text-dim)]">
                          {r.profile.report.collectedOn ?? r.createdAt.slice(0, 10)} · {r.profile.biomarkers.length} values · {r.profile.privacy.piiRemoved} redacted
                        </span>
                      </span>
                    </button>
                    <button className="hud-btn hud-btn--ghost !h-7 !w-7 !px-0" aria-label={`Delete ${r.profile.report.title}`} onClick={() => void removeRecord(r.id)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {rec && (
          <>
            <div className="rounded-[12px] border border-[var(--hud-line)] p-3">
              <div className="flex items-center gap-2">
                <ShieldCheck size={15} className="text-[var(--hud-cyan)]" aria-hidden />
                <h3 className="text-[13px] font-medium">Privacy firewall</h3>
              </div>
              <p className="mt-1.5 text-[12px] text-[var(--hud-text-dim)]">
                {rec.profile.privacy.piiRemoved} identifiers replaced before anything left this device
                {types.length ? `: ${types.map((t) => PII_LABEL[t]).join(", ")}` : ""}. Detected by {onDevicePii ? "Gemini Nano and local rules" : "local rules"}.
              </p>
              <button className="hud-btn mt-2.5 w-full" aria-pressed={showDiff} onClick={() => setShowDiff(!showDiff)}>
                <Eye size={14} aria-hidden />
                {showDiff ? "Hide redaction diff" : "Show raw vs redacted"}
              </button>
            </div>

            <div>
              <h3 className="hud-label">Structured values</h3>
              <table className="mt-2 w-full text-[12px]">
                <tbody>
                  {rec.profile.biomarkers.map((b) => (
                    <tr key={b.id} className="border-b border-[rgba(0,240,255,0.07)] last:border-0">
                      <td className="py-1.5 pr-2">
                        <button className="text-left text-[var(--hud-text)] underline-offset-4 [@media(hover:hover)]:hover:underline" onClick={() => setSelectedMarker(b.id)}>
                          {b.name}
                        </button>
                        {b.provenance !== "rule" && <span className="ml-1.5 rounded border border-[var(--hud-line-strong)] px-1 font-mono text-[9.5px] text-[var(--hud-cyan)]">{b.provenance === "on-device-ai" ? "NANO" : "CLOUD"}</span>}
                      </td>
                      <td className={`tabular py-1.5 text-right font-mono ${flagTone(b)}`}>
                        {b.flag === "positive" ? "POS" : b.flag === "negative" ? "NEG" : b.value}
                        <span className="ml-1 text-[10px] text-[var(--hud-text-faint)]">{b.unit}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rec.profile.biomarkers.length === 0 && <p className="mt-2 text-[12px] text-[var(--hud-text-dim)]">No lab values recognised. Try a sharper photo, or a PDF from the lab.</p>}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button className="hud-btn" onClick={() => exportProfileJson(rec.profile)}>
                <FileJson size={14} aria-hidden />
                Export JSON
              </button>
              <button className="hud-btn" onClick={() => exportProfileCsv(records.map((r) => r.profile))}>
                <FileSpreadsheet size={14} aria-hidden />
                Export CSV
              </button>
              <button className="hud-btn col-span-2" disabled={sync === "syncing"} onClick={() => void syncAnonymised()}>
                <CloudUpload size={14} aria-hidden />
                {sync === "synced" ? "Synced to Firestore" : sync === "syncing" ? "Syncing…" : sync === "failed" ? "Sync failed. Retry" : "Sync anonymised record"}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
