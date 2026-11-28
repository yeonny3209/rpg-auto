// 봉화 빠른이동: 밝힌 봉화 곁에서 다른 밝힌 봉화로. 거리에 비례한 골드 비용. 렌더링 무관.
export interface TravelBeacon { id: string; name: string; x: number; z: number; lit: boolean }
export interface TravelTarget { id: string; name: string; cost: number; affordable: boolean }

export const TRAVEL_MIN_COST = 10;
export const TRAVEL_PER_10M = 5;

export function travelCost(ax: number, az: number, bx: number, bz: number): number {
  const d = Math.hypot(ax - bx, az - bz);
  return Math.max(TRAVEL_MIN_COST, Math.round(d / 10) * TRAVEL_PER_10M);
}

/** 출발 봉화(fromId)가 밝혀져 있을 때, 갈 수 있는 밝힌 봉화 목록(가까운 순). 출발지가 꺼져 있으면 빈 목록. */
export function travelTargets(beacons: TravelBeacon[], fromId: string, gold: number): TravelTarget[] {
  const from = beacons.find((b) => b.id === fromId);
  if (!from || !from.lit) return [];
  return beacons
    .filter((b) => b.lit && b.id !== fromId)
    .map((b) => ({ id: b.id, name: b.name, cost: travelCost(from.x, from.z, b.x, b.z), d: Math.hypot(from.x - b.x, from.z - b.z) }))
    .sort((p, q) => p.d - q.d)
    .map(({ id, name, cost }) => ({ id, name, cost, affordable: gold >= cost }));
}
