// ============================================================
// 수집 아이템 — 동전/보석/회복 (§11)
// view: 회전 다면체 프리미티브 (§3.1)
// ============================================================

import * as THREE from 'three';
import { CONFIG, laneX } from '../data/config';

export type PickupType = 'coin' | 'gem' | 'heal';

const coinGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.08, 14);
const coinMat = new THREE.MeshStandardMaterial({ color: 0xffc83d, emissive: 0x7a5500, metalness: 0.6, roughness: 0.3 });
const gemGeo = new THREE.OctahedronGeometry(0.36);
const gemMat = new THREE.MeshStandardMaterial({ color: 0x3de1ff, emissive: 0x0a4d66, metalness: 0.3, roughness: 0.2 });
const healGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
const healMat = new THREE.MeshStandardMaterial({ color: 0x4ade80, emissive: 0x14532d });

export class Pickup {
  alive = true;
  /** 플레이어가 실제로 획득했는지 (despawn과 구분 — 튜토리얼 성공 판정용) */
  collected = false;
  readonly mesh: THREE.Mesh;
  readonly baseY: number;
  private t = Math.random() * Math.PI * 2;

  constructor(
    public type: PickupType,
    public lane: number,
    public z: number,
    y = 0.8,
  ) {
    this.baseY = y;
    if (type === 'coin') this.mesh = new THREE.Mesh(coinGeo, coinMat);
    else if (type === 'gem') this.mesh = new THREE.Mesh(gemGeo, gemMat);
    else this.mesh = new THREE.Mesh(healGeo, healMat);
    if (type === 'coin') this.mesh.rotation.x = Math.PI / 2;
    this.mesh.position.set(laneX(lane), y, z);
  }

  update(dt: number): void {
    this.t += dt;
    this.mesh.rotation.y += dt * 2.4;
    this.mesh.position.y = this.baseY + Math.sin(this.t * 3) * 0.08;
  }

  get x(): number {
    return this.mesh.position.x;
  }
  get y(): number {
    return this.mesh.position.y;
  }

  /** 2D 드로우 — type별 도형(동전/보석/회복), 회전 반영 (§3.1) */
  draw(ctx: CanvasRenderingContext2D, sx: number, baseY: number): void {
    const ppu = CONFIG.render.ppu;
    const cy = baseY - this.y * ppu;
    const spin = this.mesh.rotation.y;

    ctx.save();
    ctx.translate(sx, cy);

    if (this.type === 'coin') {
      const rx = Math.max(3, 12 * Math.abs(Math.cos(spin)));
      ctx.fillStyle = '#ffc83d';
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#7a5500';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (this.type === 'gem') {
      ctx.rotate(spin * 0.3);
      ctx.fillStyle = '#3de1ff';
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.lineTo(9, 0);
      ctx.lineTo(0, 12);
      ctx.lineTo(-9, 0);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = '#4ade80';
      ctx.beginPath();
      ctx.moveTo(0, 5);
      ctx.bezierCurveTo(-12, -8, -4, -14, 0, -4);
      ctx.bezierCurveTo(4, -14, 12, -8, 0, 5);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }
}
