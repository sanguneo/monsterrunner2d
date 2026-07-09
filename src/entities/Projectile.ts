// ============================================================
// 발사체 — 플레이어 자동사격 탄 / 적 투사체
// 적 탄은 보스별 색·모양 커스텀 (ball/rod/shard)
// ============================================================

import * as THREE from 'three';
import { CONFIG } from '../data/config';
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

function hex(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

export interface EnemyProjStyle {
  color?: number;
  shape?: EnemyProjShape;
}

export class Projectile {
  alive = true;
  readonly mesh: THREE.Mesh;
  private readonly spin: boolean;
  private readonly enemyShape: EnemyProjShape;
  private readonly enemyColor: number;

  constructor(
    public owner: 'player' | 'enemy',
    public damage: number,
    position: THREE.Vector3,
    public velocity: THREE.Vector3,
    public isCrit = false,
    public life = 2.0,
    style: EnemyProjStyle = {},
  ) {
    this.enemyShape = style.shape ?? 'rod';
    this.enemyColor = style.color ?? 0xffffff;
    if (owner === 'player') {
      this.mesh = new THREE.Mesh(playerGeo, isCrit ? critMat : playerMat);
      this.spin = false;
    } else {
      this.mesh = new THREE.Mesh(enemyGeos[this.enemyShape], enemyMaterial(this.enemyColor));
      if (this.enemyShape === 'rod') this.mesh.rotation.x = Math.PI / 2;
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

  /** 2D 렌더용 레인 근사값 — 실제 위치(연속 x)를 가장 가까운 레인으로 매핑 (§3.1) */
  get lane(): number {
    const l = Math.round(1 - this.mesh.position.x / CONFIG.lanes.spacing);
    return Math.min(CONFIG.lanes.count - 1, Math.max(0, l));
  }

  /** 2D 드로우 — owner(player=밝은 원 / enemy=ball·rod·shard) + 색 (§3.1) */
  draw(ctx: CanvasRenderingContext2D, sx: number, baseY: number): void {
    const ppu = CONFIG.render.ppu;
    const cy = baseY - this.mesh.position.y * ppu;

    ctx.save();
    ctx.translate(sx, cy);

    if (this.owner === 'player') {
      ctx.fillStyle = this.isCrit ? '#ffe066' : '#7fd6ff';
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.rotate(this.mesh.rotation.z);
      ctx.fillStyle = hex(this.enemyColor);
      switch (this.enemyShape) {
        case 'ball':
          ctx.beginPath();
          ctx.arc(0, 0, 8, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'rod':
          ctx.fillRect(-3, -12, 6, 24);
          break;
        case 'shard':
          ctx.beginPath();
          ctx.moveTo(0, -9);
          ctx.lineTo(7, 0);
          ctx.lineTo(0, 9);
          ctx.lineTo(-7, 0);
          ctx.closePath();
          ctx.fill();
          break;
      }
    }

    ctx.restore();
  }
}
