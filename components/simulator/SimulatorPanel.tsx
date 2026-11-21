"use client";

import { AlertTriangle, Globe2, Loader2, ExternalLink } from "lucide-react";
import { useAegis } from "@/store/useAegis";
import { SYMPTOM_LABELS } from "@/lib/ai/simulationEngine";
import { ORGANS } from "@/lib/anatomy/layout";
import type { ProjectionDay, ScenarioToggles, SymptomId } from "@/types/health";
import { PROJECTION_DAYS } from "@/types/health";
import { CountTo, SlideSeg } from "@/components/hud/motion";

const LEVERS: { key: keyof ScenarioToggles; label: string; hint: string }[] = [
  { key: "dietReduction", label: "Cut dietary sugar, acid & fat", hint: "Low-fat, low-sugar, fewer acidic and spicy meals" },
  { key: "alcoholCessation", label: "Stop alcohol", hint: "The strongest lever for pancreas and liver values" },
  { key: "smokingCessation", label: "Stop smoking", hint: "Slows ulcer healing and pancreatic recovery" },
  { key: "hydration", label: "Steady hydration", hint: "Supports kidney values and enzyme clearance" },
];

/** Severity at the chosen day drives words and colour, so the list agrees with the 3D body. */
const sevColor = (s: number) => (s >= 0.5 ? "var(--hud-crimson)" : s > 0.08 ? "var(--hud-amber)" : "var(--hud-cyan)");
const sevTone = (s: number) => (s >= 0.5 ? "text-[var(--hud-crimson)]" : s > 0.08 ? "text-[var(--hud-amber)]" : "text-[var(--hud-cyan)]");
const statusWord = (s: number) => (s >= 0.5 ? "alert" : s > 0.08 ? "watch" : "in range");

function Switch({ checked, onChange, label }: { checked: boolean; onChange(v: boolean): void; label: string }) {
  return <button role="switch" aria-checked={checked} aria-label={label} className="hud-switch" onClick={() => onChange(!checked)} />;
}

export function SimulatorPanel() {
  const sim = useAegis((s) => s.simulation);
  const symptoms = useAegis((s) => s.symptoms);
  const scenario = useAegis((s) => s.scenario);
  const day = useAegis((s) => s.day);
  const grounding = useAegis((s) => s.grounding);
  const cloud = useAegis((s) => s.cloud);
  const toggleSymptom = useAegis((s) => s.toggleSymptom);
  const setScenario = useAegis((s) => s.setScenario);
  const setDay = useAegis((s) => s.setDay);
  const ground = useAegis((s) => s.ground);
  const setView = useAegis((s) => s.setView);
  const hasRecord = useAegis((s) => Boolean(s.activeId));

  const flagged = (sim?.organs ?? []).filter((o) => o.status !== "healthy").sort((a, b) => b.severity - a.severity);
  const citeById = new Map((sim?.citations ?? []).map((c) => [c.id, c]));

  return (
    <section aria-labelledby="sim-h" className="hud-panel flex h-full min-h-0 flex-col overflow-hidden">
      <div className="border-b border-[var(--hud-line)] px-4 pt-4 pb-3">
        <h2 id="sim-h" className="hud-heading">
          What-If simulator
        </h2>
        <p className="mt-1 text-[12px] text-[var(--hud-text-dim)]">Change the inputs; the body and the 90-day curves update.</p>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        {sim?.redFlags.length ? (
          <div role="alert" className="rounded-[12px] border border-[var(--hud-crimson)] bg-[var(--hud-crimson-wash)] p-3">
            <div className="flex items-center gap-2 text-[#ffb3ad]">
              <AlertTriangle size={15} aria-hidden />
              <h3 className="text-[13px] font-semibold">See a clinician about these</h3>
            </div>
            <ul className="mt-1.5 space-y-1 text-[12px] text-[#ffd6d2]">
              {sim.redFlags.map((f) => (
                <li key={f.id}>{f.message}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {sim?.pattern && (
          <div>
            <h3 className="hud-label">Pattern in the numbers</h3>
            <p className="mt-1.5 font-display text-[16px] leading-snug font-semibold text-[var(--hud-text)]">{sim.pattern.label}</p>
            <p className="tabular mt-0.5 font-mono text-[11px] text-[var(--hud-text-dim)]">rule confidence {Math.round(sim.pattern.confidence * 100)}% · not a diagnosis</p>
          </div>
        )}

        {flagged.length > 0 && (
          <div>
            <h3 className="hud-label">Flagged organs</h3>
            <ul className="mt-2 space-y-1.5">
              {flagged.map((o) => (
                <li key={o.organ}>
                  <button
                    onClick={() => setView("focus", o.organ)}
                    className="block w-full rounded-[10px] border border-[var(--hud-line)] px-3 pt-2 pb-2.5 text-left transition-[border-color,transform] duration-150 active:scale-[0.985] [@media(hover:hover)]:hover:-translate-y-px [@media(hover:hover)]:hover:border-[var(--hud-line-strong)]"
                  >
                    <span className="flex items-center justify-between">
                      <span className="text-[13px]">{ORGANS[o.organ].label}</span>
                      <span className={`font-mono text-[11px] ${sevTone(o.severityByDay[day])}`}>
                        {statusWord(o.severityByDay[day])} · <CountTo value={o.severityByDay[day] * 100} suffix="%" />
                      </span>
                    </span>
                    <span className="meter mt-2 block">
                      <span style={{ transform: `scaleX(${Math.max(0.02, o.severityByDay[day])})`, backgroundColor: sevColor(o.severityByDay[day]) }} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <h3 className="hud-label">Symptoms</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(Object.keys(SYMPTOM_LABELS) as SymptomId[]).map((s) => (
              <button key={s} className="hud-chip" aria-pressed={symptoms.includes(s)} onClick={() => toggleSymptom(s)}>
                {SYMPTOM_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="hud-label">What if…</h3>
          <ul className="mt-2 space-y-2.5">
            {LEVERS.map((l) => (
              <li key={l.key} className="flex items-start justify-between gap-3">
                <span>
                  <span className="block text-[13px]">{l.label}</span>
                  <span className="block text-[11.5px] text-[var(--hud-text-dim)]">{l.hint}</span>
                </span>
                <Switch checked={Boolean(scenario[l.key])} label={l.label} onChange={(v) => setScenario({ [l.key]: v })} />
              </li>
            ))}
            <li>
              <label className="flex items-baseline justify-between text-[13px]" htmlFor="adherence">
                Medication adherence
                <span className="tabular font-mono text-[12px] text-[var(--hud-cyan)]">{scenario.medicationAdherence}%</span>
              </label>
              <input
                id="adherence"
                type="range"
                min={0}
                max={100}
                step={5}
                value={scenario.medicationAdherence}
                onChange={(e) => setScenario({ medicationAdherence: Number(e.target.value) })}
                className="mt-1.5 w-full"
              />
              <span className="block text-[11.5px] text-[var(--hud-text-dim)]">Taking a clinician-prescribed plan as directed</span>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="hud-label">Show the body at</h3>
          <div className="mt-2">
            <SlideSeg
              label="Projection day"
              value={day}
              onChange={(d) => setDay(d as ProjectionDay)}
              options={PROJECTION_DAYS.map((d) => ({ value: d, label: d === 0 ? "Today" : `Day ${d}` }))}
            />
          </div>
        </div>

        <div className="rounded-[12px] border border-[var(--hud-line)] p-3">
          <div className="flex items-center gap-2">
            <Globe2 size={15} className="text-[var(--hud-amber)]" aria-hidden />
            <h3 className="text-[13px] font-medium">Grounded research</h3>
          </div>
          <p className="mt-1 text-[12px] text-[var(--hud-text-dim)]">
            Sends only the anonymised values, symptoms and scenario to Gemini in the cloud, with Google Search for current guidance.
          </p>
          <button className="hud-btn hud-btn--primary mt-2.5 w-full" disabled={!hasRecord || grounding === "running"} onClick={() => void ground()}>
            {grounding === "running" ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Globe2 size={14} aria-hidden />}
            {grounding === "running" ? "Researching…" : grounding === "done" ? "Research again" : "Research with Gemini + Search"}
          </button>
          {!cloud && <p className="mt-1.5 text-[11.5px] text-[var(--hud-text-faint)]">Needs Firebase keys. Curated references are shown until then.</p>}
          {grounding === "failed" && <p className="mt-1.5 text-[11.5px] text-[#ffb3ad]">The cloud model did not return usable research. The curated explanations below still apply.</p>}
        </div>

        {sim && sim.explanations.length > 0 && (
          <div>
            <h3 className="hud-label">Why it looks like this</h3>
            <ul className="mt-2 space-y-3">
              {sim.explanations.map((e) => (
                <li key={e.id}>
                  <p className="text-[13px] font-medium text-[var(--hud-text)]">
                    {e.title}
                    <span className="ml-2 rounded border border-[var(--hud-line)] px-1 align-[1px] font-mono text-[9.5px] text-[var(--hud-text-dim)]">
                      {e.provenance === "cloud-ai" ? "GEMINI · GROUNDED" : "CURATED"}
                    </span>
                  </p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--hud-text-dim)]">{e.body}</p>
                  {e.provenance !== "cloud-ai" && e.citationIds.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5">
                      {e.citationIds.map((id) => {
                        const c = citeById.get(id);
                        return c ? (
                          <li key={id}>
                            <a href={c.url} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1 text-[11.5px] text-[var(--hud-cyan-dim)] underline-offset-4 hover:underline">
                              <ExternalLink size={11} className="mt-0.5 shrink-0" aria-hidden />
                              {c.title} · {c.source}
                            </a>
                          </li>
                        ) : null;
                      })}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
            {sim.citations.some((c) => c.kind === "grounded-search") && (
              <div className="mt-3">
                <h4 className="hud-label">Web sources from Google Search grounding</h4>
                <ul className="mt-1.5 space-y-0.5">
                  {sim.citations
                    .filter((c) => c.kind === "grounded-search")
                    .map((c) => (
                      <li key={c.id}>
                        <a href={c.url} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1 text-[11.5px] text-[var(--hud-cyan-dim)] underline-offset-4 hover:underline">
                          <ExternalLink size={11} className="mt-0.5 shrink-0" aria-hidden />
                          {c.title}
                        </a>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {sim && <p className="border-t border-[var(--hud-line)] pt-3 text-[11.5px] leading-relaxed text-[var(--hud-text-faint)]">{sim.disclaimer}</p>}
      </div>
    </section>
  );
}
