// 월드 소품(바위·고목) 배치: 결정론적 + 중요한 자리(봉화·보스 자리·마을)를 비워 둔다. 렌더링 무관.
import world from "../../data/world.json";
import bosses from "../../data/bosses.json";

export interface Zone { x: number; z: number; r: number }
export interface Spot { x: number; z: number }
export const SCATTER = world.scatter;

/** 비워 둘 구역 목록 */
export function clearZones(): Zone[] {
  const c = SCATTER.clear;
  const zones: Zone[] = [{ x: 0, z: 0, r: c.village }];
  for (const b of world.beacons) zones.push({ x: b.x, z: b.z, r: c.beacon });
  for (const id of Object.keys(bosses) as (keyof typeof bosses)[]) zones.push({ x: bosses[id].home.x, z: bosses[id].home.z, r: c.boss });
  return zones;
}

/** 링 영역(minR~maxR)에서 count개를 뽑는다. 구역 안·기존 점과 너무 가까운 점은 버린다. 시도 횟수 제한이 있어 모자랄 수 있다. */
export function scatterSpots(rng: () => number, count: number, taken: Spot[] = [], zones: Zone[] = clearZones()): Spot[] {
  const out: Spot[] = [];
  const all = [...taken];
  for (let tries = 0; out.length < count && tries < count * 40; tries++) {
    const r = Math.sqrt(SCATTER.minR * SCATTER.minR + rng() * (SCATTER.maxR * SCATTER.maxR - SCATTER.minR * SCATTER.minR));
    const th = rng() * Math.PI * 2;
    const p = { x: Math.cos(th) * r, z: Math.sin(th) * r };
    if (zones.some((z) => Math.hypot(p.x - z.x, p.z - z.z) < z.r)) continue;
    if (all.some((q) => Math.hypot(p.x - q.x, p.z - q.z) < SCATTER.spacing)) continue;
    out.push(p);
    all.push(p);
  }
  return out;
}
