// 함께 사냥(M8-3)의 공유 상태. enemies/player/net이 서로를 직접 import하지 않도록 중간에 둔다.
export const coop = {
  me: "",
  connected: false,
  send: (_m: unknown) => { /* net.ts가 연결되면 채워 넣는다 */ },
  others: (): { name: string; x: number; z: number }[] => [],
};
// 시드 난수(mulberry32): 모든 접속자가 같은 적 배치를 만들도록
export function rng32(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
