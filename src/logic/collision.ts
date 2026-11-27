// 원형 장애물 충돌 해소 (XZ 평면)
export interface Circle { x: number; z: number; r: number }

/** pos(원 radius)를 장애물 밖으로 밀어낸다. 밀었으면 true. pos를 직접 수정. */
export function resolveCircle(pos: { x: number; z: number }, radius: number, obstacles: readonly Circle[]): boolean {
  let moved = false;
  for (const o of obstacles) {
    const dx = pos.x - o.x, dz = pos.z - o.z;
    const min = radius + o.r;
    const d2 = dx * dx + dz * dz;
    if (d2 >= min * min) continue;
    const d = Math.sqrt(d2);
    if (d < 1e-6) { pos.x = o.x + min; moved = true; continue; }
    const k = (min - d) / d;
    pos.x += dx * k;
    pos.z += dz * k;
    moved = true;
  }
  return moved;
}
