// ============================================================
// 발사체 — 플레이어 자동사격 탄 / 적 투사체
// 적 탄은 보스별 색·모양 커스텀 (ball/rod/shard)
// ============================================================

import * as THREE from 'three';
import type { EnemyProjShape } from '../data/worlds';

const playerGeo = new THREE.SphereGeometry(0.16, 8, 8);
const playerMat = new THREE.MeshBasicMaterial({ color: 0x7fd6ff });
const critMat = new THREE.MeshBasicMaterial({ color: 0xffe066 });

const enemyGeos: Record<EnemyProjShape, THREE.BufferGeometry> = {
  ball: new THREE.SphereGeometry(0.26, 10, 8),
  rod: new THREE.CylinderGeometry(0.1, 0.1, 0.6, 8),
  shard: new THREE.OctahedronGeometry(0.28, 0),
};

const enemyMatCache = new Map<number, THREE.MeshBasicMaterial>();

function enemyMaterial(color: number): THREE.MeshBasicMaterial {
  let m = enemyMatCache.get(color);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color });
    enemyMatCache.set(color, m);
  }
  return m;
}

export interface EnemyProjStyle {
  color?: number;
  shape?: EnemyProjShape;
}

export class Projectile {
  alive = true;
  readonly mesh: THREE.Mesh;
  private readonly spin: boolean;

  constructor(
    public owner: 'player' | 'enemy',
    public damage: number,
    position: THREE.Vector3,
    public velocity: THREE.Vector3,
    public isCrit = false,
    public life = 2.0,
    style: EnemyProjStyle = {},
  ) {
    if (owner === 'player') {
      this.mesh = new THREE.Mesh(playerGeo, isCrit ? critMat : playerMat);
      this.spin = false;
    } else {
      const shape = style.shape ?? 'rod';
      this.mesh = new THREE.Mesh(enemyGeos[shape], enemyMaterial(style.color ?? 0xffffff));
      if (shape === 'rod') this.mesh.rotation.x = Math.PI / 2;
      this.spin = true;
    }
    this.mesh.position.copy(position);
  }

  update(dt: number): void {
    this.life -= dt;
    if (this.life <= 0) this.alive = false;
    this.mesh.position.addScaledVector(this.velocity, dt);
    if (this.spin) {
      this.mesh.rotation.z += dt * 10;
      this.mesh.rotation.y += dt * 6;
    }
  }

  get position(): THREE.Vector3 {
    return this.mesh.position;
  }
}
