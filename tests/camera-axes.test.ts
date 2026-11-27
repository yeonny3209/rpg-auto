import { describe, it, expect } from "vitest";
// 카메라는 -forward 쪽 뒤에서 내려다본다. Three.js 오른손 좌표계에서
// 카메라가 +z를 볼 때 화면 오른쪽은 -x다. moveInput/미니맵이 같은 축을 쓰는지 확인.
function screenRight(yaw: number) {
  const f = { x: Math.sin(yaw), z: Math.cos(yaw) };
  return { x: -f.z, z: f.x };
}
describe("카메라 축", () => {
  it("yaw=0이면 화면 오른쪽은 -x", () => {
    const r = screenRight(0);
    expect(r.x).toBeCloseTo(-1);
    expect(r.z).toBeCloseTo(0);
  });
  it("오른쪽 = forward × up 방향 (오른손 좌표계)", () => {
    for (const yaw of [0, 0.7, 2, -1.3]) {
      const f = { x: Math.sin(yaw), y: 0, z: Math.cos(yaw) };
      const up = { x: 0, y: 1, z: 0 };
      // cross(f, up) = (f.y*up.z - f.z*up.y, f.z*up.x - f.x*up.z, f.x*up.y - f.y*up.x)
      const c = { x: f.y * up.z - f.z * up.y, z: f.x * up.y - f.y * up.x };
      const r = screenRight(yaw);
      expect(r.x).toBeCloseTo(c.x);
      expect(r.z).toBeCloseTo(c.z);
    }
  });
});
