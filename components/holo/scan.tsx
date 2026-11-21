"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useAegis } from "@/store/useAegis";

/**
 * The one authored moment: when a report lands, a scan plane sweeps the body head to pelvis.
 * Geometry below the plane waits dim and lights as the plane passes; lesions ping only once
 * the plane has reached them. Shared through a mutable singleton so every material reads
 * the same frame without React re-renders.
 */
export const scan = { y: 10, on: 0 };

const TOP = 2.15;
const BOTTOM = -1.85;
const DURATION = 1.45;
// Strong ease-in-out: the plane leaves decisively and settles at the pelvis (on-screen travel).
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function ScanController() {
  const nonce = useAegis((s) => s.scanNonce);
  const start = useRef<number | null>(null);
  const ring = useRef<THREE.Group>(null);
  const mats = useMemo(
    () => ({
      line: new THREE.MeshBasicMaterial({ color: "#bffcff", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      disc: new THREE.MeshBasicMaterial({ color: "#00f0ff", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    }),
    [],
  );

  useEffect(() => {
    if (nonce === 0 || reducedMotion()) return;
    start.current = null; // restart cleanly if a second report lands mid-sweep
    scan.on = 1;
    scan.y = TOP;
  }, [nonce]);

  useFrame((state, dt) => {
    if (scan.on > 0 && nonce > 0) {
      start.current ??= state.clock.elapsedTime;
      const t = Math.min(1, (state.clock.elapsedTime - start.current) / DURATION);
      scan.y = TOP + (BOTTOM - TOP) * easeInOut(t);
      if (t >= 1) scan.on = Math.max(0, scan.on - dt * 5); // fade the reveal out over ~200ms
    }
    const vis = scan.on;
    mats.line.opacity = vis * 0.9;
    mats.disc.opacity = vis * 0.07;
    if (ring.current) {
      ring.current.position.y = scan.y;
      ring.current.visible = vis > 0.001;
    }
  });

  return (
    <group ref={ring} visible={false}>
      <mesh rotation-x={-Math.PI / 2} scale={[1, 0.58, 1]} material={mats.line} renderOrder={20}>
        <ringGeometry args={[0.86, 0.875, 96]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} scale={[1, 0.58, 1]} material={mats.disc} renderOrder={19}>
        <circleGeometry args={[0.86, 96]} />
      </mesh>
    </group>
  );
}

/** Copy the scan state into a holo material's uniforms. */
export function applyScan(material: THREE.ShaderMaterial) {
  material.uniforms.uScanY.value = scan.y;
  material.uniforms.uScanOn.value = scan.on;
}
