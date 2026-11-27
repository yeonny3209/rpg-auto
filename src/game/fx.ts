import * as THREE from "three";

// 파편 파티클 + 화면 흔들림 + 히트스톱
interface Particle { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; max: number }

export class Fx {
  private particles: Particle[] = [];
  private geo = new THREE.TetrahedronGeometry(0.09, 0);
  private mats = new Map<string, THREE.MeshStandardMaterial>();
  shake = 0;
  hitstop = 0;

  constructor(private scene: THREE.Scene) {}

  private mat(color: string) {
    let m = this.mats.get(color);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.5, transparent: true });
      this.mats.set(color, m);
    }
    return m;
  }

  burst(pos: THREE.Vector3, color: string, count: number, speed = 4) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.geo, this.mat(color));
      mesh.position.copy(pos);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.4, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.5 + Math.random()));
      this.scene.add(mesh);
      const max = 0.5 + Math.random() * 0.4;
      this.particles.push({ mesh, vel: v, life: max, max });
    }
  }

  addShake(a: number) { this.shake = Math.max(this.shake, a); }
  addHitstop(t: number) { this.hitstop = Math.max(this.hitstop, t); }

  update(dt: number) {
    this.shake = Math.max(0, this.shake - dt * 2.5);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.vel.y -= 12 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.mesh.position.y < 0.05) { p.mesh.position.y = 0.05; p.vel.multiplyScalar(0.5); p.vel.y = Math.abs(p.vel.y) * 0.3; }
      p.mesh.rotation.x += dt * 8;
      p.mesh.scale.setScalar(Math.max(0.01, p.life / p.max));
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
      }
    }
  }

  applyShake(cam: THREE.Camera) {
    if (this.shake <= 0) return;
    const s = this.shake * this.shake;
    cam.position.x += (Math.random() - 0.5) * s;
    cam.position.y += (Math.random() - 0.5) * s;
  }
}
