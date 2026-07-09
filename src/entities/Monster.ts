// ============================================================
// 일반 몬스터 — 월드별 데이터 정의(MonsterDef) 기반 (§7.2)
// view-logic 분리: 종류별로 다른 프리미티브 도형 + 빨간 눈
// (수집 아이템과 한눈에 구분되도록 적대적 외형 통일)
// ============================================================

import { CONFIG } from '../data/config';
import type { MonsterDef, MonsterBehavior, MonsterShape } from '../data/worlds';

function hex(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** weave 몬스터가 홈 줄↔이웃 줄을 오가는 주기(초) — 스폰마다 0.4~0.6s 사이로 살짝 랜덤화 */
const WEAVE_TOGGLE_INTERVAL = [0.4, 0.6] as const;

function randomWeaveInterval(): number {
  return WEAVE_TOGGLE_INTERVAL[0] + Math.random() * (WEAVE_TOGGLE_INTERVAL[1] - WEAVE_TOGGLE_INTERVAL[0]);
}

export class Monster {
  alive = true;
  hp: number;
  readonly contactDamage: number;
  readonly behavior: MonsterBehavior;
  readonly speed: number;
  readonly exp: number;
  readonly id: string;
  readonly shape: MonsterShape;
  readonly color: number;
  /** 바운스 반영 y (§3.1) */
  y = 0.8;
  private t = Math.random() * Math.PI * 2;
  /** 보스 소환 잡몹 여부 */
  isMinion = false;

  /** weave: 스폰 시 배정된 원래 줄(토글 기준) */
  private readonly homeLane: number;
  /** weave: 홈 줄에서 이동할 이웃 줄 방향(+1/-1) — 경계 줄이면 안쪽으로만 고정 */
  private readonly weaveDir: number;
  /** weave: 다음 토글까지 남은 시간 */
  private weaveTimer = randomWeaveInterval();
  /** weave: 현재 홈 줄에 있는지(false면 이웃 줄로 이동한 상태) */
  private weaveAtHome = true;

  constructor(
    def: MonsterDef,
    public lane: number,
    public z: number,
  ) {
    this.id = def.id;
    this.hp = def.hp;
    this.contactDamage = def.contact;
    this.behavior = def.behavior;
    this.speed = def.speed;
    this.exp = def.exp;
    this.shape = def.shape;
    this.color = def.color;
    this.homeLane = lane;
    // 맨 위 줄(0)이면 아래로만, 맨 아래 줄(count-1)이면 위로만, 그 외는 랜덤 방향
    this.weaveDir = lane <= 0 ? 1 : lane >= CONFIG.lanes.count - 1 ? -1 : Math.random() < 0.5 ? -1 : 1;
  }

  update(dt: number, playerZ: number): void {
    this.t += dt;
    if (this.z > playerZ + 1.2) {
      this.z -= this.speed * dt;
    }
    if (this.behavior === 'weave') {
      this.weaveTimer -= dt;
      if (this.weaveTimer <= 0) {
        this.weaveTimer += randomWeaveInterval();
        this.weaveAtHome = !this.weaveAtHome;
        this.lane = this.weaveAtHome ? this.homeLane : this.homeLane + this.weaveDir;
      }
    }
    this.y = 0.8 + Math.sin(this.t * 3) * 0.12;
  }

  /** @returns true면 사망 */
  takeDamage(d: number): boolean {
    this.hp -= d;
    if (this.hp <= 0) {
      this.alive = false;
      return true;
    }
    return false;
  }

  /** 2D 드로우 — shape별 도형 + color + 빨간 눈 2개 (§3.1) */
  draw(ctx: CanvasRenderingContext2D, sx: number, baseY: number): void {
    const ppu = CONFIG.render.ppu;
    const wobble = Math.sin(this.t * 6) * 0.18;
    const cy = baseY - 0.55 * ppu + Math.sin(this.t * 3) * 3;

    ctx.save();
    ctx.translate(sx, cy);
    ctx.rotate(wobble);
    ctx.fillStyle = hex(this.color);

    switch (this.shape) {
      case 'box': {
        const s = 0.85 * ppu;
        ctx.fillRect(-s / 2, -s / 2, s, s);
        break;
      }
      case 'cone': {
        const r = 0.45 * ppu;
        const h = 1.1 * ppu;
        ctx.beginPath();
        ctx.moveTo(0, -h / 2);
        ctx.lineTo(r, h / 2);
        ctx.lineTo(-r, h / 2);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'capsule': {
        const w = 0.64 * ppu;
        const h = 1.2 * ppu;
        roundRect(ctx, -w / 2, -h / 2, w, h, w / 2);
        ctx.fill();
        break;
      }
      case 'tetra': {
        const r = 0.62 * ppu;
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.lineTo(r * 0.87, r * 0.5);
        ctx.lineTo(-r * 0.87, r * 0.5);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'spiky': {
        const r = 0.6 * ppu;
        const spikes = 6;
        ctx.beginPath();
        for (let i = 0; i < spikes * 2; i++) {
          const a = (Math.PI * i) / spikes;
          const rad = i % 2 === 0 ? r : r * 0.5;
          const px = Math.sin(a) * rad;
          const py = -Math.cos(a) * rad;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'sphere':
      default: {
        const r = 0.5 * ppu;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
    }

    // 빨간 눈 2개
    ctx.fillStyle = '#ff1111';
    ctx.beginPath();
    ctx.arc(-5, -3, 2.4, 0, Math.PI * 2);
    ctx.arc(5, -3, 2.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}
