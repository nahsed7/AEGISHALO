"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { OrganId } from "@/types/health";
import { createHoloMaterial, severityColor } from "./holoMaterial";
import { applyScan } from "./scan";

const damp = THREE.MathUtils.damp;

export interface OrganVisual {
  severity: number;
  dimmed: boolean;
  /** Anatomically connected to the focused organ: kept readable but secondary. */
  secondary?: boolean;
  focused: boolean;
  explode: THREE.Vector3;
}

interface Props {
  id: OrganId;
  geometry: THREE.BufferGeometry;
  visual: OrganVisual;
  onSelect(id: OrganId): void;
  onHover(id: OrganId | null): void;
}

/** One organ: holographic Fresnel core + faint additive wireframe, animated toward its target state. */
export function OrganMesh({ id, geometry, visual, onSelect, onHover }: Props) {
  const group = useRef<THREE.Group>(null);
  const core = useMemo(() => createHoloMaterial(), []);
  const wire = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        wireframe: true,
        transparent: true,
        opacity: 0.1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [],
  );
  const [hover, setHover] = useState(false);
  const target = useMemo(() => new THREE.Color(), []);

  useEffect(() => () => {
    core.dispose();
    wire.dispose();
  }, [core, wire]);

  useFrame((state, dt) => {
    const u = core.uniforms;
    u.uTime.value = state.clock.elapsedTime;
    applyScan(core);
    severityColor(visual.severity, target);
    (u.uColor.value as THREE.Color).lerp(target, 1 - Math.exp(-6 * dt));
    wire.color.copy(u.uColor.value as THREE.Color);
    const opacity = visual.dimmed ? 0.08 : visual.secondary ? 0.4 : 1;
    u.uOpacity.value = damp(u.uOpacity.value, opacity, 7, dt);
    u.uPulse.value = damp(u.uPulse.value, visual.severity >= 0.5 ? Math.min(1, visual.severity) : visual.severity * 0.4, 5, dt);
    u.uHover.value = damp(u.uHover.value, hover || visual.focused ? 1 : 0, 10, dt);
    wire.opacity = 0.1 * u.uOpacity.value + u.uHover.value * 0.08;
    if (group.current) {
      const p = group.current.position;
      p.x = damp(p.x, visual.explode.x, 5, dt);
      p.y = damp(p.y, visual.explode.y, 5, dt);
      p.z = damp(p.z, visual.explode.z, 5, dt);
    }
  });

  const handlers = {
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      onSelect(id);
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setHover(true);
      onHover(id);
      document.body.style.cursor = "pointer";
    },
    onPointerOut: () => {
      setHover(false);
      onHover(null);
      document.body.style.cursor = "";
    },
  };

  return (
    <group ref={group} name={`organ-${id}`}>
      <mesh geometry={geometry} material={core} renderOrder={2} {...handlers} />
      <mesh geometry={geometry} material={wire} renderOrder={3} raycast={() => null} />
    </group>
  );
}
