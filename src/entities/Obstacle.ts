// ============================================================
// 장애물 — 줄 블로커 BLOCK/MOVER (§6.1)
// view-logic 분리: 프리미티브 벽, 추후 모델 교체 가능.
// ============================================================

import { CONFIG } from '../data/config';
import type { Player } from './Player';

export type ObstacleType = 'BLOCK' | 'MOVER';

// 2D draw용 테마 색상 (월드 테마마다 달라짐 — applyObstacleTheme 참고)
let blockColor = 0x57534e;
let moverColor = 0x7c3aed;

function hex(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

/** 월드 테마 색상 적용 — 스테이지마다 장애물 색이 달라진다 */
export function applyObstacleTheme(colors: { obsHigh: number; obsBlock: number }): void {
  blockColor = colors.obsBlock;
  moverColor = colors.obsHigh;
}

export class Obstacle {
  alive = true;
  /** 충돌 데미지 중복 방지 */
  hitDone = false;
  /** worldX(진행축) 판정 두께 */
  readonly zLen = 0.8;

  /** MOVER 슬라럼 — 다음 줄 이동까지 남은 시간 */
  private moveTimer: number;
  private moveDir = 1;

  constructor(
    public type: ObstacleType,
    public lane: number,
    public z: number,
  ) {
    this.moveTimer = CONFIG.obstacles.moverInterval;
  }

  /** MOVER는 일정 시간마다 인접 줄로 이동(슬라럼). BLOCK은 정적. */
  update(dt: number): void {
    if (this.type !== 'MOVER') return;
    this.moveTimer -= dt;
    if (this.moveTimer <= 0) {
      let next = this.lane + this.moveDir;
      if (next < 0 || next > CONFIG.lanes.count - 1) {
        this.moveDir *= -1;
        next = this.lane + this.moveDir;
      }
      this.lane = next;
      this.moveTimer += CONFIG.obstacles.moverInterval;
    }
  }

  /** 플레이어 피격 판정 — 같은 줄 + worldX 근접. 점프 중(airborne)이면 뛰어넘어 회피(§5). */
  collides(player: Player): boolean {
    if (player.airborne) return false;
    if (this.lane !== player.lane) return false;
    const scale = CONFIG.accessibility.hitboxScale;
    return Math.abs(player.z - this.z) < (this.zLen / 2 + 0.4) * scale;
  }

  get damage(): number {
    return CONFIG.obstacles.damage[this.type];
  }

  /** 2D 드로우 — BLOCK/MOVER 벽 + 월드 테마 색 (§3.1) */
  draw(ctx: CanvasRenderingContext2D, sx: number, baseY: number): void {
    const ppu = CONFIG.render.ppu;
    const w = (this.type === 'BLOCK' ? 1.9 : 1.8) * ppu;
    const h = (this.type === 'BLOCK' ? 3.0 : 2.6) * ppu;
    ctx.fillStyle = hex(this.type === 'BLOCK' ? blockColor : moverColor);
    ctx.fillRect(sx - w / 2, baseY - h, w, h);
    if (this.type === 'MOVER') {
      // 이동 방향 화살표 힌트
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.beginPath();
      const ay = baseY - h / 2;
      const dir = this.moveDir;
      ctx.moveTo(sx + dir * 10, ay);
      ctx.lineTo(sx - dir * 6, ay - 8);
      ctx.lineTo(sx - dir * 6, ay + 8);
      ctx.closePath();
      ctx.fill();
    }
  }
}
