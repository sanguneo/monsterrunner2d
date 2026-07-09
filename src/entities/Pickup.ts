// ============================================================
// 수집 아이템 — 동전/보석/회복 (§11)
// view: 회전 다면체 프리미티브 (§3.1)
// ============================================================

import { CONFIG, laneX } from '../data/config';

export type PickupType = 'coin' | 'gem' | 'heal';

export class Pickup {
  alive = true;
  /** 플레이어가 실제로 획득했는지 (despawn과 구분 — 튜토리얼 성공 판정용) */
  collected = false;
  readonly baseY: number;
  readonly x: number;
  y: number;
  /** 회전 각(호) — coin/gem 스핀 애니메이션에 사용 (§3.1) */
  spin = 0;
  private t = Math.random() * Math.PI * 2;

  constructor(
    public type: PickupType,
    public lane: number,
    public z: number,
    y = 0.8,
  ) {
    this.baseY = y;
    this.y = y;
    this.x = laneX(lane);
  }

  update(dt: number): void {
    this.t += dt;
    this.spin += dt * 2.4;
    this.y = this.baseY + Math.sin(this.t * 3) * 0.08;
  }

  /** 2D 드로우 — type별 도형(동전/보석/회복), 회전 반영 (§3.1) */
  draw(ctx: CanvasRenderingContext2D, sx: number, baseY: number): void {
    const ppu = CONFIG.render.ppu;
    const cy = baseY - this.y * ppu;
    const spin = this.spin;

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
