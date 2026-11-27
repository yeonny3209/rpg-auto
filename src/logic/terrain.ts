// 지형 높이 (렌더링 무관). 값 노이즈 3옥타브 × 평탄화 마스크(마을·봉화 주변은 평지).
import w from "../../data/world.json";

export type TerrainCfg = typeof w.terrain;
type Flat = { x: number; z: number; inner: number; outer: number };

function hash(ix: number, iz: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const smooth = (t: number) => t * t * (3 - 2 * t);

/** 0~1 값 노이즈 (정수 격자 + 부드러운 보간) */
export function valueNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = smooth(x - ix), fz = smooth(z - iz);
  const a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed), c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed);
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fz;
}

function fbm(x: number, z: number, c: TerrainCfg): number {
  let sum = 0, amp = 1, freq = c.scale, norm = 0;
  for (let o = 0; o < c.octaves; o++) {
    sum += (valueNoise(x * freq, z * freq, c.seed + o * 17) * 2 - 1) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm; // -1 ~ 1
}

const flatZones = (c: TerrainCfg, beacons: { x: number; z: number }[]): Flat[] => [
  { x: c.village.x, z: c.village.z, inner: c.village.inner, outer: c.village.outer },
  ...beacons.map((b) => ({ x: b.x, z: b.z, inner: c.beaconFlat.inner, outer: c.beaconFlat.outer })),
];
const ZONES = flatZones(w.terrain, w.beacons);

/** 평탄화 마스크: 0(완전 평지) ~ 1(자유 지형) */
export function roughness(x: number, z: number, zones: Flat[] = ZONES): number {
  let m = 1;
  for (const f of zones) {
    const d = Math.hypot(x - f.x, z - f.z);
    const t = Math.min(1, Math.max(0, (d - f.inner) / (f.outer - f.inner)));
    m = Math.min(m, smooth(t));
  }
  return m;
}

export function heightAt(x: number, z: number, c: TerrainCfg = w.terrain): number {
  const m = c === w.terrain ? roughness(x, z) : roughness(x, z, flatZones(c, w.beacons));
  if (m === 0) return 0;
  return fbm(x, z, c) * c.amplitude * m;
}
