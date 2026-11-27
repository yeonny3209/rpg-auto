// 가중치 기반 무작위 선택
export function weightedPick<T extends string>(weights: Record<T, number>, r: number): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((s, [, w]) => s + Math.max(0, w), 0);
  if (total <= 0) throw new Error("no positive weights");
  let x = Math.min(0.999999, Math.max(0, r)) * total;
  for (const [k, w] of entries) {
    if (w <= 0) continue;
    if (x < w) return k;
    x -= w;
  }
  return entries[entries.length - 1][0];
}
