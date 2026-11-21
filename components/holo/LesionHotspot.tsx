"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Lesion } from "@/types/health";
import { severityColor } from "./holoMaterial";
import { scan } from "./scan";

/** Glowing lesion node: hard core, breathing halo, and an expanding ring "ping". */
export function LesionHotspot({ lesion, intensity, offset, dimmed }: { lesion: Lesion; intensity: number; offset: THREE.Vector3; dimmed: boolean }) {
  const group = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const color = useMemo(() => new THREE.Color(), []);
  const mats = useMemo(
    () => ({
      core: new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }),
      halo: new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }),
      ring: new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, depthTest: false }),
    }),
    [],
  );

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    severityColor(Math.max(0.55, intensity), color);
    const reached = scan.on === 0 || scan.y <= lesion.position[1];
    const vis = intensity <= 0.02 || !reached ? 0 : dimmed ? 0.15 : 1;
    mats.core.color.copy(color);
    mats.halo.color.copy(color);
    mats.ring.color.copy(color);
    mats.core.opacity = THREE.MathUtils.damp(mats.core.opacity, vis, 6, dt);
    mats.halo.opacity = mats.core.opacity * (0.25 + 0.15 * Math.sin(t * 4));
    const ping = (t * 0.8) % 1;
    mats.ring.opacity = mats.core.opacity * (1 - ping) * 0.8;
    const s = 0.6 + intensity * 0.9;
    halo.current?.scale.setScalar(s * (1 + 0.15 * Math.sin(t * 4)));
    ring.current?.scale.setScalar(s * (0.6 + ping * 2.2));
    ring.current?.lookAt(state.camera.position);
    if (group.current) {
      const target = new THREE.Vector3(...lesion.position).add(offset);
      group.current.position.lerp(target, 1 - Math.exp(-5 * dt));
    }
  });

  return (
    <group ref={group} position={lesion.position} renderOrder={10}>
      <mesh material={mats.core} renderOrder={10}>
        <sphereGeometry args={[0.022, 20, 20]} />
      </mesh>
      <mesh ref={halo} material={mats.halo} renderOrder={10}>
        <sphereGeometry args={[0.06, 24, 24]} />
      </mesh>
      <mesh ref={ring} material={mats.ring} renderOrder={10}>
        <ringGeometry args={[0.07, 0.078, 48]} />
      </mesh>
    </group>
  );
}
