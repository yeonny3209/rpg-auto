// 지역 정의(원형 지역 + 두 지역을 잇는 통로). 렌더링 무관: 이동 가능 범위, 지역 판정, 지역별 적 풀.
import data from "../../data/regions.json";

export interface Region { id: string; name: string; x: number; z: number; r: number; enemies: string[]; count: number; ground: string[]; fog: string; recommendedLevel: number }
export const REGIONS = data.regions as Region[];
export const BRIDGE = data.bridge;
export const regionById = (id: string): Region => REGIONS.find((r) => r.id === id) ?? REGIONS[0];

const seg = () => ({ a: regionById(BRIDGE.from), b: regionById(BRIDGE.to) });

/** 점에서 통로 중심선(두 지역 중심을 잇는 선분)까지 거리와 가장 가까운 점 */
function nearestOnBridge(x: number, z: number) {
  const { a, b } = seg();
  const dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz;
  const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / len2));
  const px = a.x + dx * t, pz = a.z + dz * t;
  return { px, pz, d: Math.hypot(x - px, z - pz) };
}

export function walkable(x: number, z: number): boolean {
  if (REGIONS.some((r) => Math.hypot(x - r.x, z - r.z) <= r.r)) return true;
  return nearestOnBridge(x, z).d <= BRIDGE.halfWidth;
}

const EPS = 1e-6; // 경계 위 부동소수 오차로 다시 불가 판정이 나지 않게 살짝 안쪽으로

/** 이동 불가능한 점을 가장 가까운 이동 가능 점으로 끌어당긴다 */
export function clampWalkable(x: number, z: number): { x: number; z: number } {
  if (walkable(x, z)) return { x, z };
  let best = { x, z }, bd = Infinity;
  for (const r of REGIONS) {
    const d = Math.hypot(x - r.x, z - r.z), rr = r.r - EPS;
    if (d - r.r < bd) { bd = d - r.r; best = { x: r.x + ((x - r.x) / d) * rr, z: r.z + ((z - r.z) / d) * rr }; }
  }
  const n = nearestOnBridge(x, z), over = n.d - BRIDGE.halfWidth;
  if (over < bd) best = { x: n.px + ((x - n.px) / n.d) * (BRIDGE.halfWidth - EPS), z: n.pz + ((z - n.pz) / n.d) * (BRIDGE.halfWidth - EPS) };
  return best;
}

/** 위치가 속한 지역(통로는 더 가까운 지역 중심 쪽) */
export function regionAt(x: number, z: number): Region {
  let best = REGIONS[0], bd = Infinity;
  for (const r of REGIONS) { const d = Math.hypot(x - r.x, z - r.z) - r.r; if (d < bd) { bd = d; best = r; } }
  return best;
}

/** 지역 안의 무작위 점(중심에서 minFromCenter~r-margin), rng는 0~1 */
export function pointInRegion(r: Region, rng: () => number, minFromCenter = 12, margin = 4): { x: number; z: number } {
  const rad = minFromCenter + rng() * Math.max(1, r.r - margin - minFromCenter), th = rng() * Math.PI * 2;
  return { x: r.x + Math.cos(th) * rad, z: r.z + Math.sin(th) * rad };
}

/** 지역별 스폰 가중치(적 데이터의 spawnWeight 사용) */
export function weightsFor(regionId: string, enemyData: Record<string, { spawnWeight: number }>): Record<string, number> {
  return Object.fromEntries(regionById(regionId).enemies.map((id) => [id, enemyData[id]?.spawnWeight ?? 0]));
}

/** 지역 권장 레벨 대비 위험도: 권장보다 3 이상 낮으면 deadly, 1 이상 낮으면 risky */
export function dangerOf(rg: Region, level: number): "safe" | "risky" | "deadly" {
  const gap = rg.recommendedLevel - level;
  return gap >= 3 ? "deadly" : gap >= 1 ? "risky" : "safe";
}
