"use client";

import { Html, Line } from "@react-three/drei";
import * as THREE from "three";
import type { BiomarkerProjection, HealthProfileJSON, OrganId, ProjectionDay, SimulationResponse } from "@/types/health";
import { ORGANS } from "@/lib/anatomy/layout";

/** Tiny 90-day trajectory: scenario (solid) against no-change baseline (dashed). */
function RecoveryCurve({ p, day }: { p: BiomarkerProjection; day: ProjectionDay }) {
  const W = 196;
  const H = 54;
  const all = [...p.scenario, ...p.baseline].map((x) => x.value).concat(p.refHigh ?? [], p.refLow ?? []);
  const max = Math.max(...all) * 1.08;
  const min = Math.min(0, ...all);
  const x = (d: number) => (d / 90) * W;
  const y = (v: number) => H - ((v - min) / (max - min)) * H;
  const path = (pts: { day: number; value: number }[]) => pts.map((q, i) => `${i ? "L" : "M"}${x(q.day).toFixed(1)},${y(q.value).toFixed(1)}`).join(" ");
  return (
    <svg width={W} height={H + 14} className="block overflow-visible" aria-label={`${p.name} projected over 90 days`}>
      {p.refHigh !== undefined && (
        <>
          <line x1={0} x2={W} y1={y(p.refHigh)} y2={y(p.refHigh)} className="stroke-[var(--hud-cyan)]" strokeOpacity={0.35} strokeDasharray="2 3" />
          <text x={W} y={y(p.refHigh) - 3} textAnchor="end" className="fill-[var(--hud-cyan-dim)] font-mono text-[9px]">
            upper limit {p.refHigh}
          </text>
        </>
      )}
      <path d={path(p.baseline)} fill="none" className="stroke-[var(--hud-amber)]" strokeOpacity={0.7} strokeDasharray="3 3" strokeWidth={1.25} />
      <path d={path(p.scenario)} fill="none" className="stroke-[var(--hud-cyan)]" strokeWidth={1.75} />
      <line x1={x(day)} x2={x(day)} y1={0} y2={H} className="stroke-white" strokeOpacity={0.5} />
      {[0, 30, 60, 90].map((d) => (
        <text key={d} x={x(d)} y={H + 12} textAnchor={d === 0 ? "start" : d === 90 ? "end" : "middle"} className="fill-[var(--hud-text-dim)] font-mono text-[9px]">
          d{d}
        </text>
      ))}
    </svg>
  );
}

export function HoloCallouts({
  organ,
  anchor,
  sim,
  profile,
  day,
}: {
  organ: OrganId;
  anchor: THREE.Vector3;
  sim: SimulationResponse;
  profile: HealthProfileJSON;
  day: ProjectionDay;
}) {
  const state = sim.organs.find((o) => o.organ === organ);
  if (!state) return null;
  const side = anchor.x >= 0 ? 1 : -1;
  const label = new THREE.Vector3(anchor.x + side * 0.62, anchor.y + 0.32, anchor.z + 0.25);
  const elbow = new THREE.Vector3(anchor.x + side * 0.42, anchor.y + 0.32, anchor.z + 0.2);
  const triggers = state.triggers.map((id) => profile.biomarkers.find((b) => b.id === id)).filter(Boolean);
  const connection = sim.connections.find((c) => c.active && c.organs.includes(organ));
  const proj = sim.projections.find((p) => state.triggers.includes(p.biomarkerId));
  const lesion = sim.lesions.find((l) => l.organ === organ);
  const tone = state.status === "alert" ? "text-[var(--hud-crimson)]" : state.status === "watch" ? "text-[var(--hud-amber)]" : "text-[var(--hud-cyan)]";

  return (
    <group>
      <Line points={[anchor, elbow, label]} color={state.status === "healthy" ? "#00f0ff" : state.status === "watch" ? "#ffb020" : "#ff3b30"} lineWidth={1.2} transparent opacity={0.85} depthTest={false} />
      <Html position={label} zIndexRange={[30, 0]} style={{ pointerEvents: "none" }} center={false}>
        <div
          className="holo-callout w-[236px] -translate-y-1/2 rounded-[10px] p-3 text-[12px] leading-snug"
          style={{ transform: `translate(${side > 0 ? "8px" : "calc(-100% - 8px)"}, -50%)` }}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-display text-[15px] font-semibold tracking-[0.02em] text-[var(--hud-text)]">{ORGANS[organ].label}</span>
            <span className={`font-mono text-[10px] uppercase ${tone}`}>
              {state.status} · {Math.round((state.severityByDay[day] ?? state.severity) * 100)}%
            </span>
          </div>
          {lesion && <p className="mt-1 text-[var(--hud-text-dim)]">{lesion.label}</p>}

          <p className="hud-label mt-3">Lab values behind this</p>
          {triggers.length ? (
            <ul className="mt-1 space-y-0.5 font-mono text-[11px] tabular-nums">
              {triggers.map((b) => (
                <li key={b!.id} className="flex justify-between gap-2">
                  <span className="text-[var(--hud-text-dim)]">{b!.name}</span>
                  <span className="text-[var(--hud-text)]">
                    {b!.flag === "positive" ? "POSITIVE" : `${b!.value} ${b!.unit}`}
                    {b!.ratioToUln && b!.ratioToUln > 1 ? <span className={tone}> ×{b!.ratioToUln}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[var(--hud-text-dim)]">None out of range.</p>
          )}

          {connection && (
            <>
              <p className="hud-label mt-3">Connected route</p>
              <p className="mt-1 text-[var(--hud-text)]">{connection.label}</p>
              <p className="mt-0.5 text-[11px] text-[var(--hud-text-dim)]">{connection.description}</p>
            </>
          )}

          {proj && (
            <>
              <p className="hud-label mt-3">{proj.name}: 90-day What-If</p>
              <div className="mt-1.5">
                <RecoveryCurve p={proj} day={day} />
              </div>
            </>
          )}
        </div>
      </Html>
    </group>
  );
}

/** Small floating tag for flagged organs in the full-body view. */
export function OrganTag({ organ, position, status }: { organ: OrganId; position: THREE.Vector3; status: string }) {
  return (
    <Html position={position} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
      <div className={`organ-tag organ-tag--${status}`}>{ORGANS[organ].label}</div>
    </Html>
  );
}
