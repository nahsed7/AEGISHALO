import * as THREE from "three";
import type { OrganId, Vec3 } from "@/types/health";

/**
 * Sculpted procedural organs, positioned in the viewer-space anatomy map (lib/anatomy/layout).
 * Built once and cached. A real multi-mesh /models/anatomy.glb replaces them when present.
 */

const v = (p: Vec3) => new THREE.Vector3(...p);

/** Tube whose radius follows a profile along the curve. */
function taperedTube(points: Vec3[], radius: (t: number) => number, tubular = 96, radial = 20, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map(v), closed, "centripetal");
  const geo = new THREE.TubeGeometry(curve, tubular, 1, radial, closed);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    curve.getPointAt(t, c);
    const r = radius(t);
    for (let j = 0; j <= radial; j++) {
      const idx = i * (radial + 1) + j;
      p.fromBufferAttribute(pos, idx).sub(c).multiplyScalar(r).add(c);
      pos.setXYZ(idx, p.x, p.y, p.z);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

function deformSphere(radius: number, fn: (p: THREE.Vector3) => void, w = 64, h = 48) {
  const geo = new THREE.SphereGeometry(radius, w, h);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    fn(p);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  geo.computeVertexNormals();
  return geo;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Cheap deterministic lobulation noise. */
const lobes = (p: THREE.Vector3, f: number) => Math.sin(p.x * f) * Math.sin(p.y * f * 1.3) * Math.sin(p.z * f * 0.9);

function heart() {
  const g = deformSphere(0.2, (p) => {
    // Cone toward the apex (down-left of the patient = +x, -y in viewer space).
    const down = smooth(0.05, -0.2, p.y);
    p.x *= 1 - down * 0.45;
    p.z *= 1 - down * 0.45;
    p.y *= 1.12;
    // Two atrial bulges on top.
    p.y += Math.max(0, p.y) * 0.25 * Math.abs(Math.sin(p.x * 14));
    p.z *= 0.85;
  });
  g.rotateZ(0.55);
  g.rotateY(-0.35);
  g.translate(0.12, 0.78, 0.12);
  return g;
}

function liver() {
  const g = deformSphere(1, (p) => {
    // Wedge: thick right lobe (-x), thin left lobe tapering under the heart toward +x.
    const tx = smooth(-1, 1, p.x);
    p.x *= 0.46;
    p.y *= 0.24 * (1.25 - tx * 0.85);
    p.z *= 0.27 * (1.15 - tx * 0.55);
    // Flatter inferior (visceral) surface.
    if (p.y < 0) p.y *= 0.55;
    p.y += 0.012 * lobes(p, 22);
  });
  g.rotateZ(-0.12);
  g.translate(-0.3, 0.2, 0.08);
  return g;
}

function stomach() {
  return taperedTube(
    [
      [0.2, 0.36, 0.06],
      [0.36, 0.34, 0.12],
      [0.48, 0.2, 0.18],
      [0.46, 0.0, 0.22],
      [0.3, -0.1, 0.27],
      [0.12, -0.07, 0.27],
    ],
    (t) => 0.045 + Math.sin(Math.min(1, t * 1.35) * Math.PI) * 0.1 * (1 - t * 0.35),
  );
}

function duodenum() {
  return taperedTube(
    [
      [0.12, -0.07, 0.27],
      [-0.06, -0.04, 0.22],
      [-0.25, -0.06, 0.14],
      [-0.3, -0.22, 0.07],
      [-0.2, -0.36, 0.04],
      [0.02, -0.35, 0.02],
      [0.14, -0.26, 0.0],
    ],
    (t) => 0.042 + Math.sin(t * Math.PI * 6) * 0.004 + (t < 0.18 ? 0.012 : 0),
  );
}

function pancreas() {
  const g = taperedTube(
    [
      [-0.2, -0.24, 0.01],
      [-0.12, -0.19, -0.02],
      [0.02, -0.14, -0.06],
      [0.25, -0.08, -0.1],
      [0.42, -0.04, -0.13],
      [0.57, 0.0, -0.14],
    ],
    (t) => (t < 0.22 ? 0.085 - t * 0.12 : 0.06 - (t - 0.22) * 0.035),
    120,
    24,
  );
  const pos = g.attributes.position as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const n = lobes(p, 60) * 0.008;
    pos.setXYZ(i, p.x + n, p.y + n, p.z + n);
  }
  g.computeVertexNormals();
  return g;
}

function kidney(side: 1 | -1) {
  const g = deformSphere(1, (p) => {
    // Bean: indent the medial edge (toward the spine).
    const medial = -side * p.x;
    const hilum = Math.exp(-(p.y * p.y) / 0.12) * smooth(0.2, 1, medial);
    p.x = p.x * 0.1 + side * hilum * 0.035;
    p.y *= 0.19;
    p.z *= 0.085;
  });
  g.rotateZ(side * 0.25);
  g.translate(side * 0.42, side > 0 ? -0.4 : -0.45, -0.3);
  return g;
}

function kidneys() {
  const a = kidney(1);
  const b = kidney(-1);
  const merged = new THREE.BufferGeometry();
  const posA = a.attributes.position.array as Float32Array;
  const posB = b.attributes.position.array as Float32Array;
  const nA = a.attributes.normal.array as Float32Array;
  const nB = b.attributes.normal.array as Float32Array;
  merged.setAttribute("position", new THREE.BufferAttribute(new Float32Array([...posA, ...posB]), 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(new Float32Array([...nA, ...nB]), 3));
  const idxA = Array.from(a.index!.array);
  const offset = a.attributes.position.count;
  const idxB = Array.from(b.index!.array).map((i) => i + offset);
  merged.setIndex([...idxA, ...idxB]);
  return merged;
}

let cache: Record<OrganId, THREE.BufferGeometry> | null = null;

export function organGeometries(): Record<OrganId, THREE.BufferGeometry> {
  cache ??= {
    heart: heart(),
    liver: liver(),
    stomach: stomach(),
    duodenum: duodenum(),
    pancreas: pancreas(),
    kidneys: kidneys(),
  };
  return cache;
}

/** Translucent torso shell built on a lathe profile, flattened front-to-back. */
export function torsoGeometry(): THREE.BufferGeometry {
  const profile: [number, number][] = [
    [0.0, 2.08],
    [0.16, 2.05],
    [0.19, 1.86],
    [0.3, 1.74],
    [0.66, 1.6],
    [0.76, 1.45],
    [0.72, 1.1],
    [0.66, 0.7],
    [0.6, 0.3],
    [0.55, -0.05],
    [0.58, -0.5],
    [0.66, -0.95],
    [0.68, -1.3],
    [0.58, -1.62],
    [0.0, -1.72],
  ];
  const g = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    72,
  );
  g.scale(1, 1, 0.56);
  g.computeVertexNormals();
  return g;
}

/** Rib arcs as point lists for <Line>. */
export function ribArcs(): Vec3[][] {
  const arcs: Vec3[][] = [];
  for (let i = 0; i < 9; i++) {
    const y = 1.3 - i * 0.13;
    const rx = 0.5 + Math.sin((i / 8) * Math.PI) * 0.12;
    const rz = 0.3;
    const open = 0.22 + i * 0.03; // ribs open wider toward the bottom (costal margin)
    const pts: Vec3[] = [];
    for (let k = 0; k <= 48; k++) {
      const a = open + (k / 48) * (Math.PI * 2 - open * 2);
      pts.push([Math.sin(a) * rx, y - Math.abs(Math.cos(a)) * 0.05 * (i / 8), Math.cos(a) * rz]);
    }
    arcs.push(pts);
  }
  return arcs;
}

export function spinePoints(): Vec3[] {
  const pts: Vec3[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const y = 1.8 - t * 3.3;
    pts.push([0, y, -0.38 + Math.sin(t * Math.PI * 2) * 0.04]);
  }
  return pts;
}
