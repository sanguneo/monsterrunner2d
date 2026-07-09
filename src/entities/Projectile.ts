// ============================================================
// 발사체 — 플레이어 자동사격 탄 / 적 투사체
// 적 탄은 보스별 색·모양 커스텀 (ball/rod/shard)
// ============================================================

import { CONFIG } from '../data/config';
import type { EnemyProjShape } from '../data/worlds';

function hex(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

export interface EnemyProjStyle {
  color?: number;
  shape?: EnemyProjShape;
}

export class Projectile {
  alive = true;
  private readonly spin: boolean;
  private readonly enemyShape: EnemyProjShape;
  private readonly enemyColor: number;
  /** 회전 각(호) — spin=true(적 탄)일 때만 draw에서 사용 (§3.1) */
  private rot = 0;

  constructor(
    public owner: 'player' | 'enemy',
    public damage: number,
    /** 판정/렌더에 쓰는 정수 줄(lane) — SoT (§3.1) */
    public lane: number,
    public y: number,
    /** 진행거리(worldX) — 3D shim 시절의 z축 그대로 사용 (§3.1) */
    public worldX: number,
    public vx: number,
    public isCrit = false,
    public life = 2.0,
    style: EnemyProjStyle = {},
  ) {
    this.enemyShape = style.shape ?? 'rod';
    this.enemyColor = style.color ?? 0xffffff;
    this.spin = owner === 'enemy';
  }

  /**
   * 플레이어 자동사격 탄 생성 — 대상 줄(lane)로 곧장 스폰해 worldX 축으로만 전진한다 (§7.1, §3.1).
   */
  static forPlayer(damage: number, fromWorldX: number, lane: number, isCrit: boolean): Projectile {
    return new Projectile(
      'player',
      damage,
      lane,
      1.0,
      fromWorldX,
      CONFIG.projectiles.playerSpeed,
      isCrit,
      CONFIG.projectiles.playerLife,
    );
  }

  /** 적 투사체 생성 — Boss/Game이 THREE 없이 호출하는 팩토리 (§9, §3.1) */
  static forEnemy(lane: number, fromWorldX: number, damage: number, speed: number, style: EnemyProjStyle = {}): Projectile {
    return new Projectile('enemy', damage, lane, 1.0, fromWorldX, -speed, false, 4.0, style);
  }

  update(dt: number): void {
    this.life -= dt;
    if (this.life <= 0) this.alive = false;
    this.worldX += this.vx * dt;
    if (this.spin) {
      this.rot += dt * 10;
    }
  }

  /** 2D 드로우 — owner(player=밝은 원 / enemy=ball·rod·shard) + 색 (§3.1) */
  draw(ctx: CanvasRenderingContext2D, sx: number, baseY: number): void {
    const cy = baseY - this.y * CONFIG.render.ppu;

    ctx.save();
    ctx.translate(sx, cy);

    if (this.owner === 'player') {
      ctx.fillStyle = this.isCrit ? '#ffe066' : '#7fd6ff';
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.rotate(this.rot);
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
