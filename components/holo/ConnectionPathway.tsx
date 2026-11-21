"use client";

import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { AnatomicalConnection } from "@/types/health";
import { createFlowMaterial, HUD_AMBER, HUD_CYAN } from "./holoMaterial";

/** Volumetric spline for an anatomical route, with energy flowing along it. */
export function ConnectionPathway({ connection, emphasis, alert }: { connection: AnatomicalConnection; emphasis: number; alert: boolean }) {
  const geometry = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(connection.points.map((p) => new THREE.Vector3(...p)), false, "centripetal");
    return new THREE.TubeGeometry(curve, 160, 0.0055, 8, false);
  }, [connection.points]);
  const sheath = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(connection.points.map((p) => new THREE.Vector3(...p)), false, "centripetal");
    return new THREE.TubeGeometry(curve, 160, 0.02, 12, false);
  }, [connection.points]);
  const flow = useMemo(() => createFlowMaterial(alert ? HUD_AMBER : HUD_CYAN), [alert]);
  const glow = useMemo(
    () => new THREE.MeshBasicMaterial({ color: alert ? HUD_AMBER : HUD_CYAN, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false }),
    [alert],
  );

  useEffect(() => () => {
    geometry.dispose();
    sheath.dispose();
    flow.dispose();
    glow.dispose();
  }, [geometry, sheath, flow, glow]);

  useFrame((state, dt) => {
    flow.uniforms.uTime.value = state.clock.elapsedTime;
    flow.uniforms.uOpacity.value = THREE.MathUtils.damp(flow.uniforms.uOpacity.value, emphasis, 5, dt);
    glow.opacity = flow.uniforms.uOpacity.value * 0.1;
  });

  return (
    <group renderOrder={8}>
      <mesh geometry={geometry} material={flow} renderOrder={8} raycast={() => null} />
      <mesh geometry={sheath} material={glow} renderOrder={7} raycast={() => null} />
    </group>
  );
}
