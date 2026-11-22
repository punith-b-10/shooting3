import * as THREE from 'three';
import type { MatKey } from '../maps/MapData';

type Kind = 'grain' | 'blocks' | 'planks' | 'corrugated' | 'asphalt' | 'grass' | 'brick' | 'tiles' | 'bark' | 'facade' | 'hazard' | 'metal' | 'plain' | 'sandbag';
interface Spec {
  kind: Kind;
  color: string;
  alt?: string;
  scale: number; // metres per texture tile
  rough?: number;
  metal?: number;
}

const SPECS: Record<MatKey, Spec> = {
  sand: { kind: 'grain', color: '#d9bd86', alt: '#c9aa72', scale: 5 },
  sandstone: { kind: 'blocks', color: '#c8a470', alt: '#a98456', scale: 4 },
  stone: { kind: 'blocks', color: '#9c9488', alt: '#6f6a62', scale: 3 },
  woodGate: { kind: 'planks', color: '#7a4a26', alt: '#4d2d14', scale: 3 },
  woodPlank: { kind: 'planks', color: '#9a6b3c', alt: '#6e4724', scale: 2 },
  wood: { kind: 'planks', color: '#7c5a38', alt: '#563b22', scale: 2.5 },
  rust: { kind: 'metal', color: '#8a4a2a', alt: '#5e2f18', scale: 3, rough: 0.8, metal: 0.4 },
  containerRed: { kind: 'corrugated', color: '#a8352a', alt: '#7e241c', scale: 2.4, rough: 0.55, metal: 0.35 },
  containerBlue: { kind: 'corrugated', color: '#2d5a8c', alt: '#1f3f66', scale: 2.4, rough: 0.55, metal: 0.35 },
  containerGreen: { kind: 'corrugated', color: '#3b6b45', alt: '#294a31', scale: 2.4, rough: 0.55, metal: 0.35 },
  containerOrange: { kind: 'corrugated', color: '#c9722a', alt: '#94511b', scale: 2.4, rough: 0.55, metal: 0.35 },
  concrete: { kind: 'grain', color: '#a2a29e', alt: '#85857f', scale: 4 },
  concreteDark: { kind: 'grain', color: '#62646a', alt: '#4b4d52', scale: 4 },
  asphalt: { kind: 'asphalt', color: '#3a3b3f', alt: '#2b2c2f', scale: 4, rough: 0.95 },
  grass: { kind: 'grass', color: '#55743a', alt: '#445e2d', scale: 5 },
  dirt: { kind: 'grain', color: '#86694a', alt: '#6d543a', scale: 5 },
  brick: { kind: 'brick', color: '#9a5240', alt: '#6c372b', scale: 3 },
  tile: { kind: 'tiles', color: '#d3d6d8', alt: '#9ba0a4', scale: 3, rough: 0.35 },
  rock: { kind: 'grain', color: '#7c7970', alt: '#5d5a53', scale: 3 },
  bark: { kind: 'bark', color: '#4a3727', alt: '#2e2218', scale: 2 },
  facade: { kind: 'facade', color: '#bab3a3', alt: '#7d94a8', scale: 6 },
  facadeDark: { kind: 'facade', color: '#6a717b', alt: '#8aa4bb', scale: 6 },
  hazard: { kind: 'hazard', color: '#d9a920', alt: '#1a1a1a', scale: 2 },
  steel: { kind: 'metal', color: '#6c7782', alt: '#4f5963', scale: 3, rough: 0.45, metal: 0.65 },
  carBlue: { kind: 'plain', color: '#2f5fa5', scale: 4, rough: 0.35, metal: 0.5 },
  carRed: { kind: 'plain', color: '#a02b2b', scale: 4, rough: 0.35, metal: 0.5 },
  carWhite: { kind: 'plain', color: '#dcdcdc', scale: 4, rough: 0.35, metal: 0.4 },
  carYellow: { kind: 'plain', color: '#d6a62a', scale: 4, rough: 0.35, metal: 0.4 },
  foliage: { kind: 'grain', color: '#3d6b32', alt: '#2c5226', scale: 3 },
  foliageDark: { kind: 'grain', color: '#2a4d28', alt: '#1d3a1d', scale: 3 },
  plaster: { kind: 'grain', color: '#dbd3c1', alt: '#c3baa5', scale: 4 },
  canvas: { kind: 'grain', color: '#6b7650', alt: '#58623f', scale: 3 },
  sandbag: { kind: 'sandbag', color: '#a89870', alt: '#80734f', scale: 2 },
  glow: { kind: 'plain', color: '#ffd9a0', scale: 4 },
  black: { kind: 'plain', color: '#141414', scale: 4, rough: 0.9 },
  roofMetal: { kind: 'corrugated', color: '#7d848a', alt: '#5b6166', scale: 2.4, rough: 0.5, metal: 0.5 },
};

const cache = new Map<MatKey, THREE.MeshStandardMaterial | THREE.MeshBasicMaterial>();
const texCache = new Map<string, THREE.CanvasTexture>();

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function paint(kind: Kind, color: string, alt: string, size: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!;
  const r = rng(color.split('').reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7));
  g.fillStyle = color;
  g.fillRect(0, 0, size, size);
  const speckle = (n: number, a: number, c: string, s = 2) => {
    g.globalAlpha = a;
    g.fillStyle = c;
    for (let i = 0; i < n; i++) g.fillRect(r() * size, r() * size, 1 + r() * s, 1 + r() * s);
    g.globalAlpha = 1;
  };
  switch (kind) {
    case 'grain':
      speckle(1800, 0.25, alt, 3);
      speckle(900, 0.12, '#ffffff', 2);
      break;
    case 'grass':
      speckle(2500, 0.35, alt, 2);
      for (let i = 0; i < 700; i++) {
        g.strokeStyle = r() < 0.5 ? alt : '#7c9a50';
        g.globalAlpha = 0.35;
        const x = r() * size, y = r() * size;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 5, y - 3 - r() * 5); g.stroke();
      }
      g.globalAlpha = 1;
      break;
    case 'blocks': {
      const rows = 4;
      const h = size / rows;
      g.strokeStyle = alt; g.lineWidth = 3;
      for (let y = 0; y < rows; y++) {
        const off = y % 2 ? size / 4 : 0;
        for (let x = -1; x < 3; x++) {
          const bx = x * (size / 2) + off;
          g.globalAlpha = 0.12 + r() * 0.12; g.fillStyle = r() < 0.5 ? '#000' : '#fff';
          g.fillRect(bx, y * h, size / 2, h);
          g.globalAlpha = 0.9; g.strokeRect(bx, y * h, size / 2, h);
        }
      }
      g.globalAlpha = 1;
      speckle(1200, 0.15, alt, 3);
      break;
    }
    case 'brick': {
      const rows = 8, h = size / rows, w = size / 4;
      g.strokeStyle = '#b7aa98'; g.lineWidth = 2;
      for (let y = 0; y < rows; y++) {
        const off = y % 2 ? w / 2 : 0;
        for (let x = -1; x < 5; x++) {
          g.globalAlpha = 0.18 * r(); g.fillStyle = r() < 0.5 ? '#000' : alt;
          g.fillRect(x * w + off, y * h, w, h);
          g.globalAlpha = 0.8; g.strokeRect(x * w + off, y * h, w, h);
        }
      }
      g.globalAlpha = 1;
      speckle(800, 0.15, alt, 2);
      break;
    }
    case 'planks': {
      const n = 6, w = size / n;
      for (let i = 0; i < n; i++) {
        g.globalAlpha = 0.25; g.fillStyle = r() < 0.5 ? '#000' : alt;
        g.fillRect(i * w, 0, w, size);
        g.globalAlpha = 1; g.strokeStyle = alt; g.lineWidth = 2;
        g.strokeRect(i * w, -2, w, size + 4);
        g.globalAlpha = 0.25; g.strokeStyle = alt; g.lineWidth = 1;
        for (let k = 0; k < 7; k++) { const y = r() * size; g.beginPath(); g.moveTo(i * w + 2, y); g.lineTo((i + 1) * w - 2, y + (r() - 0.5) * 6); g.stroke(); }
      }
      g.globalAlpha = 1;
      break;
    }
    case 'corrugated': {
      const n = 16, w = size / n;
      for (let i = 0; i < n; i++) {
        const gr = g.createLinearGradient(i * w, 0, (i + 1) * w, 0);
        gr.addColorStop(0, alt); gr.addColorStop(0.5, color); gr.addColorStop(1, alt);
        g.fillStyle = gr; g.fillRect(i * w, 0, w, size);
      }
      speckle(700, 0.15, '#000', 3);
      speckle(300, 0.12, '#fff', 2);
      break;
    }
    case 'asphalt':
      speckle(4000, 0.35, alt, 2);
      speckle(1500, 0.18, '#8c8c8c', 1.5);
      break;
    case 'tiles': {
      const n = 4, w = size / n;
      g.strokeStyle = alt; g.lineWidth = 2;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { g.globalAlpha = 0.07 * r(); g.fillStyle = '#000'; g.fillRect(x * w, y * w, w, w); g.globalAlpha = 0.9; g.strokeRect(x * w, y * w, w, w); }
      g.globalAlpha = 1;
      break;
    }
    case 'bark':
      for (let i = 0; i < 90; i++) { g.globalAlpha = 0.4; g.fillStyle = r() < 0.5 ? alt : '#6b5338'; g.fillRect(r() * size, 0, 2 + r() * 4, size); }
      g.globalAlpha = 1;
      break;
    case 'facade': {
      // Wall with a regular grid of windows (alt = glass colour)
      const cols = 4, rows = 4, cw = size / cols, rh = size / rows;
      speckle(900, 0.18, '#000', 2);
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        g.fillStyle = '#2a3038'; g.fillRect(x * cw + cw * 0.18, y * rh + rh * 0.2, cw * 0.64, rh * 0.6);
        const gr = g.createLinearGradient(0, y * rh, 0, (y + 1) * rh);
        gr.addColorStop(0, alt); gr.addColorStop(1, '#31414f');
        g.fillStyle = gr; g.fillRect(x * cw + cw * 0.22, y * rh + rh * 0.24, cw * 0.56, rh * 0.52);
      }
      break;
    }
    case 'hazard': {
      g.fillStyle = alt;
      for (let i = -size; i < size * 2; i += 64) {
        g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 32, 0); g.lineTo(i + 32 - size, size); g.lineTo(i - size, size); g.closePath(); g.fill();
      }
      break;
    }
    case 'metal':
      speckle(1500, 0.3, alt, 5);
      for (let i = 0; i < 12; i++) { g.globalAlpha = 0.2; g.fillStyle = alt; g.fillRect(0, r() * size, size, 1 + r() * 2); }
      g.globalAlpha = 1;
      break;
    case 'sandbag': {
      const n = 4, h = size / n;
      for (let y = 0; y < n; y++) for (let x = -1; x < 3; x++) {
        const bx = x * (size / 2) + (y % 2 ? size / 4 : 0);
        g.fillStyle = r() < 0.5 ? color : alt; g.globalAlpha = 0.9;
        g.beginPath(); g.ellipse(bx + size / 4, y * h + h / 2, size / 4 - 2, h / 2 - 2, 0, 0, Math.PI * 2); g.fill();
        g.globalAlpha = 0.5; g.strokeStyle = '#3b341f'; g.stroke();
      }
      g.globalAlpha = 1;
      break;
    }
    case 'plain':
      break;
  }
  return cv;
}

/** Patch a material to sample its map using world-space triplanar coordinates, so one texture tiles evenly on every box size. */
function makeTriplanar(mat: THREE.MeshStandardMaterial, metersPerTile: number) {
  mat.customProgramCacheKey = () => 'triplanar-v2';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTexScale = { value: 1 / metersPerTile };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTpPos;\nvarying vec3 vTpNrm;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 tpW = vec4(transformed, 1.0);
        vec3 tpN = objectNormal;
        #ifdef USE_INSTANCING
          tpW = instanceMatrix * tpW;
          tpN = mat3(instanceMatrix) * tpN;
        #endif
        tpW = modelMatrix * tpW;
        vTpPos = tpW.xyz;
        vTpNrm = normalize(mat3(modelMatrix) * tpN);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTpPos;\nvarying vec3 vTpNrm;\nuniform float uTexScale;')
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
          vec3 tpB = pow(abs(normalize(vTpNrm)), vec3(6.0));
          tpB /= (tpB.x + tpB.y + tpB.z);
          vec4 tpC = texture2D(map, vTpPos.zy * uTexScale) * tpB.x + texture2D(map, vTpPos.xz * uTexScale) * tpB.y + texture2D(map, vTpPos.xy * uTexScale) * tpB.z;
          diffuseColor *= tpC;
        #endif`,
      );
  };
}

export function getMaterial(key: MatKey, maxAniso = 4): THREE.Material {
  let m = cache.get(key);
  if (m) return m;
  const s = SPECS[key];
  if (key === 'glow') {
    m = new THREE.MeshBasicMaterial({ color: new THREE.Color(s.color) });
  } else if (s.kind === 'plain') {
    m = new THREE.MeshStandardMaterial({ color: s.color, roughness: s.rough ?? 0.8, metalness: s.metal ?? 0 });
  } else {
    const id = `${s.kind}|${s.color}|${s.alt}`;
    let tex = texCache.get(id);
    if (!tex) {
      tex = new THREE.CanvasTexture(paint(s.kind, s.color, s.alt ?? s.color, 256));
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = maxAniso;
      tex.generateMipmaps = true;
      texCache.set(id, tex);
    }
    const sm = new THREE.MeshStandardMaterial({ map: tex, roughness: s.rough ?? 0.92, metalness: s.metal ?? 0 });
    makeTriplanar(sm, s.scale);
    m = sm;
  }
  cache.set(key, m);
  return m;
}

export function disposeMaterials() {
  for (const m of cache.values()) m.dispose();
  for (const t of texCache.values()) t.dispose();
  cache.clear();
  texCache.clear();
}

/** Colour used when drawing a material on the minimap. */
export function matColor(key: MatKey): string {
  return SPECS[key].color;
}
