import * as THREE from "three";

export const HUD_CYAN = new THREE.Color("#00f0ff");
export const HUD_AMBER = new THREE.Color("#ffb020");
export const HUD_CRIMSON = new THREE.Color("#ff3b30");

/** Healthy → watch → alert colour ramp. */
export function severityColor(severity: number, out = new THREE.Color()): THREE.Color {
  if (severity <= 0.08) return out.copy(HUD_CYAN);
  if (severity < 0.5) return out.copy(HUD_CYAN).lerp(HUD_AMBER, Math.min(1, (severity - 0.08) / 0.42));
  return out.copy(HUD_AMBER).lerp(HUD_CRIMSON, Math.min(1, (severity - 0.5) / 0.35));
}

const vertex = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uPulse;      // 0 = steady, 1 = full alert pulse
  uniform float uCore;       // inner fill strength
  uniform float uHover;
  uniform float uScanY;      // world-space height of the scan plane
  uniform float uScanOn;     // 1 while a scan is sweeping
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vWorld;
  void main() {
    vec3 n = normalize(vNormalW);
    if (!gl_FrontFacing) n = -n;
    float fres = pow(1.0 - clamp(abs(dot(n, vViewDir)), 0.0, 1.0), 2.4);
    // Horizontal scan bands drifting upward: the "hologram" read.
    float bands = smoothstep(0.82, 1.0, sin(vWorld.y * 70.0 - uTime * 2.2) * 0.5 + 0.5) * 0.35;
    float sweep = smoothstep(0.06, 0.0, abs(fract(vWorld.y * 0.18 - uTime * 0.12) - 0.5)) * 0.6;
    float pulse = 1.0 + uPulse * (0.55 + 0.45 * sin(uTime * 4.2));
    float a = (uCore * 0.22 + fres * 0.95 + bands * 0.25 + sweep * 0.2) * pulse * (1.0 + uHover * 0.6);
    vec3 col = uColor * (0.55 + fres * 1.1 + sweep * 0.5) * (1.0 + uHover * 0.35);
    // Scan: geometry below the plane waits dim; the plane itself is a bright cut line.
    float d = vWorld.y - uScanY;
    float edge = smoothstep(0.05, 0.0, abs(d)) * uScanOn;
    float revealed = mix(1.0, d > 0.0 ? 1.0 : 0.18, uScanOn);
    float flash = smoothstep(0.35, 0.0, d) * step(0.0, d) * uScanOn * 0.8;
    col = col * (1.0 + flash) + vec3(0.75, 1.0, 1.0) * edge * 1.6;
    a = a * revealed + edge * 0.9 + flash * 0.25;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0) * uOpacity);
  }
`;

export function createHoloMaterial(color: THREE.Color = HUD_CYAN, core = 1): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color.clone() },
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      uPulse: { value: 0 },
      uCore: { value: core },
      uHover: { value: 0 },
      uScanY: { value: 10 },
      uScanOn: { value: 0 },
    },
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

/** Animated dashes flowing along a tube's length (uv.x). */
export function createFlowMaterial(color: THREE.Color = HUD_CYAN): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color.clone() }, uTime: { value: 0 }, uOpacity: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uTime; uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        // A steady filament with short pulses travelling along it (direction of flow).
        float pulse = smoothstep(0.0, 0.08, fract(vUv.x * 3.0 - uTime * 0.35)) * smoothstep(0.22, 0.08, fract(vUv.x * 3.0 - uTime * 0.35));
        float a = (0.32 + pulse * 0.9) * uOpacity;
        gl_FragColor = vec4(uColor * (0.9 + pulse * 1.4), a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}
