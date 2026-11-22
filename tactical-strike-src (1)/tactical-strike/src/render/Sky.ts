import * as THREE from 'three';
import type { SkyDef } from '../maps/MapData';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w; // always at the far plane
}`;

const FRAG = /* glsl */ `
uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom;
uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uClouds; uniform float uTime;
varying vec3 vDir;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(uHorizon, uBottom, pow(clamp(-h * 3.0, 0.0, 1.0), 0.6));
  float sd = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSunColor * (pow(sd, 900.0) * 6.0 + pow(sd, 18.0) * 0.28 + pow(sd, 4.0) * 0.08);
  if (h > 0.02 && uClouds > 0.0) {
    vec2 uv = d.xz / (h + 0.25) * 1.6 + vec2(uTime * 0.004, 0.0);
    float c = smoothstep(0.52 - uClouds * 0.25, 0.85, fbm(uv));
    col = mix(col, vec3(1.0) * (0.75 + 0.35 * sd), c * smoothstep(0.02, 0.25, h) * 0.85);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Procedural gradient sky dome with a sun disc and drifting clouds. */
export class Sky {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  constructor(def: SkyDef) {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color(def.top) },
        uHorizon: { value: new THREE.Color(def.horizon) },
        uBottom: { value: new THREE.Color(def.bottom) },
        uSunDir: { value: new THREE.Vector3(...def.sunDir).normalize() },
        uSunColor: { value: new THREE.Color(def.sunColor) },
        uClouds: { value: def.clouds },
        uTime: { value: 0 },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 16), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }
  update(camPos: THREE.Vector3, t: number) {
    this.mesh.position.copy(camPos);
    this.mat.uniforms.uTime.value = t;
  }
  dispose() {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
