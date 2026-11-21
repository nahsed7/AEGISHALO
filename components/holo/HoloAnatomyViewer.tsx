"use client";

import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { CameraControls, Grid, Line, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { OrganId, ProjectionDay, SimulationResponse, HealthProfileJSON, Vec3 } from "@/types/health";
import { ORGAN_IDS } from "@/types/health";
import { ORGANS } from "@/lib/anatomy/layout";
import { useAegis } from "@/store/useAegis";
import { useActiveRecord } from "@/store/useAegis";
import { organGeometries, ribArcs, spinePoints, torsoGeometry } from "./organGeometry";
import { createHoloMaterial, HUD_CYAN } from "./holoMaterial";
import { OrganMesh } from "./OrganMesh";
import { LesionHotspot } from "./LesionHotspot";
import { ConnectionPathway } from "./ConnectionPathway";
import { HoloCallouts, OrganTag } from "./HoloCallouts";
import { applyScan, ScanController } from "./scan";

/** Opt-in: set NEXT_PUBLIC_ANATOMY_GLB=/models/anatomy.glb after dropping a model in /public/models. */
const GLB_URL = process.env.NEXT_PUBLIC_ANATOMY_GLB || "";
const HOME: [Vec3, Vec3] = [
  [0, 0.3, 7.4],
  [0, 0.05, 0],
];
const EXPLODED: [Vec3, Vec3] = [
  [2.4, 0.9, 6.4],
  [0, 0.05, 0],
];

// ─────────────────────────────── Torso shell ───────────────────────────────

function TorsoShell({ dim }: { dim: boolean }) {
  const geo = useMemo(() => torsoGeometry(), []);
  const mat = useMemo(() => {
    const m = createHoloMaterial(HUD_CYAN, 0.05);
    return m;
  }, []);
  const wire = useMemo(
    () => new THREE.MeshBasicMaterial({ color: HUD_CYAN, wireframe: true, transparent: true, opacity: 0.035, blending: THREE.AdditiveBlending, depthWrite: false }),
    [],
  );
  const ribs = useMemo(() => ribArcs(), []);
  const spine = useMemo(() => spinePoints(), []);
  useFrame((s, dt) => {
    mat.uniforms.uTime.value = s.clock.elapsedTime;
    applyScan(mat);
    mat.uniforms.uOpacity.value = THREE.MathUtils.damp(mat.uniforms.uOpacity.value, dim ? 0.18 : 0.45, 4, dt);
    wire.opacity = mat.uniforms.uOpacity.value * 0.08;
  });
  return (
    <group>
      <mesh geometry={geo} material={mat} renderOrder={1} raycast={() => null} />
      <mesh geometry={geo} material={wire} renderOrder={1} raycast={() => null} />
      {ribs.map((pts, i) => (
        <Line key={i} points={pts} color="#00f0ff" lineWidth={0.8} transparent opacity={dim ? 0.05 : 0.14} />
      ))}
      <Line points={spine} color="#00f0ff" lineWidth={2.2} transparent opacity={dim ? 0.06 : 0.2} dashed dashSize={0.04} gapSize={0.025} />
    </group>
  );
}

// ─────────────────────────────── Geometry sources ───────────────────────────────

type OrganGeoms = Partial<Record<OrganId, THREE.BufferGeometry>>;

const ORGAN_MATCHERS: [OrganId, RegExp][] = [
  ["pancreas", /pancrea/i],
  ["duodenum", /duoden/i],
  ["stomach", /stomach|gastr/i],
  ["liver", /liver|hepat/i],
  ["heart", /heart|cardi|myocard/i],
  ["kidneys", /kidney|renal/i],
];

/** Loads a multi-mesh anatomy GLB and maps meshes to organs by name. */
function GlbOrgans({ children }: { children(geoms: OrganGeoms): ReactNode }) {
  const gltf = useGLTF(GLB_URL);
  const geoms = useMemo(() => {
    const scene = gltf.scene.clone(true);
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const norm = new THREE.Matrix4().makeScale(3.7 / size.y, 3.7 / size.y, 3.7 / size.y).multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
    const parts: Partial<Record<OrganId, THREE.BufferGeometry[]>> = {};
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const name = `${mesh.name} ${mesh.parent?.name ?? ""}`;
      const organ = ORGAN_MATCHERS.find(([, re]) => re.test(name))?.[0];
      if (!organ) return;
      const g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld).applyMatrix4(norm);
      g.deleteAttribute("uv");
      (parts[organ] ??= []).push(g);
    });
    const out: OrganGeoms = {};
    for (const [organ, list] of Object.entries(parts) as [OrganId, THREE.BufferGeometry[]][]) {
      out[organ] = list.length === 1 ? list[0] : mergeGeometries(list);
    }
    return out;
  }, [gltf]);
  return <>{children(geoms)}</>;
}

function mergeGeometries(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  for (const g0 of list) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.push(...(g.attributes.position.array as Float32Array));
    nor.push(...(g.attributes.normal.array as Float32Array));
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  m.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  return m;
}

class GlbBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function useGlbAvailable() {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (!GLB_URL) return;
    fetch(GLB_URL, { method: "HEAD" })
      .then((r) => setOk(r.ok && !(r.headers.get("content-type") ?? "").includes("text/html")))
      .catch(() => setOk(false));
  }, []);
  return ok;
}

// ─────────────────────────────── Scene ───────────────────────────────

function Anatomy({ geoms, sim, profile, day }: { geoms: OrganGeoms; sim: SimulationResponse | null; profile: HealthProfileJSON | null; day: ProjectionDay }) {
  const view = useAegis((s) => s.view);
  const focusOrgan = useAegis((s) => s.focusOrgan);
  const setView = useAegis((s) => s.setView);
  const [hovered, setHovered] = useState<OrganId | null>(null);

  const severity = (o: OrganId) => sim?.organs.find((x) => x.organ === o)?.severityByDay[day] ?? 0;
  const status = (o: OrganId) => sim?.organs.find((x) => x.organ === o)?.status ?? "healthy";
  const explodeOf = (o: OrganId) => (view === "exploded" ? new THREE.Vector3(...ORGANS[o].explode) : new THREE.Vector3());

  const centers = useMemo(() => {
    const out = {} as Record<OrganId, THREE.Vector3>;
    for (const o of ORGAN_IDS) {
      const g = geoms[o];
      if (g) {
        g.computeBoundingBox();
        out[o] = g.boundingBox!.getCenter(new THREE.Vector3());
      } else out[o] = new THREE.Vector3(...ORGANS[o].center);
    }
    return out;
  }, [geoms]);

  const focusSet = useMemo(() => {
    if (!focusOrgan) return null;
    const s = new Set<OrganId>([focusOrgan]);
    // Keep anatomically connected organs readable when drilling into a route.
    sim?.connections.filter((c) => c.active && c.organs.includes(focusOrgan)).forEach((c) => c.organs.forEach((o) => s.add(o)));
    return s;
  }, [focusOrgan, sim]);

  const flagged = (sim?.organs ?? []).filter((o) => o.status !== "healthy").map((o) => o.organ);

  return (
    <group>
      <TorsoShell dim={Boolean(focusOrgan)} />
      {ORGAN_IDS.map((o) =>
        geoms[o] ? (
          <OrganMesh
            key={o}
            id={o}
            geometry={geoms[o]!}
            visual={{
              severity: severity(o),
              dimmed: Boolean(focusSet && !focusSet.has(o)),
              secondary: Boolean(focusSet && focusSet.has(o) && o !== focusOrgan),
              focused: focusOrgan === o || hovered === o,
              explode: explodeOf(o),
            }}
            onSelect={(id) => setView("focus", id)}
            onHover={setHovered}
          />
        ) : null,
      )}

      {sim?.connections.map((c) => {
        const relevant = !focusOrgan || c.organs.includes(focusOrgan);
        const emphasis = c.active ? (relevant ? 1 : 0.15) : 0;
        if (view === "exploded") return null;
        return <ConnectionPathway key={c.id} connection={c} emphasis={emphasis} alert={c.organs.some((o) => status(o) === "alert")} />;
      })}

      {sim?.lesions.map((l) => (
        <LesionHotspot key={l.id} lesion={l} intensity={l.intensityByDay[day] ?? 0} offset={explodeOf(l.organ)} dimmed={Boolean(focusOrgan && l.organ !== focusOrgan)} />
      ))}

      {sim && profile && focusOrgan && view === "focus" && (
        <HoloCallouts
          organ={focusOrgan}
          anchor={new THREE.Vector3(...(sim.lesions.find((l) => l.organ === focusOrgan)?.position ?? centers[focusOrgan].toArray()))}
          sim={sim}
          profile={profile}
          day={day}
        />
      )}

      {!focusOrgan &&
        flagged.map((o) => (
          <OrganTag key={o} organ={o} status={status(o)} position={centers[o].clone().add(explodeOf(o)).add(new THREE.Vector3(0, 0.02, 0.32))} />
        ))}
      {hovered && !focusOrgan && !flagged.includes(hovered) && <OrganTag organ={hovered} status="healthy" position={centers[hovered].clone().add(explodeOf(hovered)).add(new THREE.Vector3(0, 0, 0.3))} />}
    </group>
  );
}

function CameraRig() {
  const ref = useRef<CameraControls>(null);
  const nonce = useAegis((s) => s.cameraNonce);
  const view = useAegis((s) => s.view);
  const focusOrgan = useAegis((s) => s.focusOrgan);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.smoothTime = 0.55;
    if (view === "focus" && focusOrgan) {
      const o = ORGANS[focusOrgan];
      void c.setLookAt(...o.focusCamera, ...o.center, true);
    } else if (view === "exploded") {
      void c.setLookAt(...EXPLODED[0], ...EXPLODED[1], true);
    } else {
      void c.setLookAt(...HOME[0], ...HOME[1], true);
    }
  }, [nonce, view, focusOrgan]);

  return <CameraControls ref={ref} makeDefault minDistance={0.9} maxDistance={9} dollySpeed={0.6} />;
}

function Scene() {
  const sim = useAegis((s) => s.simulation);
  const day = useAegis((s) => s.day);
  const record = useActiveRecord();
  const glb = useGlbAvailable();
  const procedural = useMemo(() => organGeometries(), []);
  const profile = record?.profile ?? null;

  const procScene = <Anatomy geoms={procedural} sim={sim} profile={profile} day={day} />;
  return (
    <>
      <color attach="background" args={["#030811"]} />
      <fog attach="fog" args={["#030811", 6, 12]} />
      <CameraRig />
      <ScanController />
      {glb ? (
        <GlbBoundary fallback={procScene}>
          <Suspense fallback={procScene}>
            <GlbOrgans>{(geoms) => <Anatomy geoms={{ ...procedural, ...geoms }} sim={sim} profile={profile} day={day} />}</GlbOrgans>
          </Suspense>
        </GlbBoundary>
      ) : (
        procScene
      )}
      <Grid
        position={[0, -1.85, 0]}
        args={[12, 12]}
        cellSize={0.25}
        cellThickness={0.5}
        cellColor="#0b3a4a"
        sectionSize={1}
        sectionThickness={1}
        sectionColor="#00b8c8"
        fadeDistance={9}
        fadeStrength={2}
        infiniteGrid
      />
    </>
  );
}

export default function HoloAnatomyViewer() {
  return (
    <Canvas
      camera={{ position: HOME[0], fov: 36, near: 0.05, far: 50 }}
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onPointerMissed={() => undefined}
      aria-label="Interactive 3D holographic anatomy. Click an organ to inspect it."
    >
      <Scene />
    </Canvas>
  );
}
