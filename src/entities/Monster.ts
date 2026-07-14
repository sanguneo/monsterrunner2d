// ============================================================
// 일반 몬스터 — 월드별 데이터 정의(MonsterDef) 기반 (§7.2)
// view-logic 분리: 종류별로 다른 프리미티브 도형 + 빨간 눈
// (수집 아이템과 한눈에 구분되도록 적대적 외형 통일)
// ============================================================

import { CONFIG } from '../data/config';
import type { MonsterDef, MonsterBehavior, MonsterShape } from '../data/worlds';
import { drawSprite, drawAnim, currentWorld } from '../systems/Sprites';

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

/**
 * 스프라이트 표시 높이(월드 단위) — 행동 티어별 고정. ×ppu(24)로 화면 px 산출.
 * 소스 PNG 해상도가 달라도 화면 크기를 일관되게 유지(크기 제각각 방지). 탱커 ≈ 플레이어, 위빙 최소.
 */
const MOB_HEIGHT_WU: Record<MonsterBehavior, number> = { slow: 3.7, straight: 3.0, weave: 2.4 };

/** weave 몬스터가 홈 줄↔이웃 줄을 오가는 주기(초) — 스폰마다 0.4~0.6s 사이로 살짝 랜덤화 */
const WEAVE_TOGGLE_INTERVAL = [0.4, 0.6] as const;

/** weave 레인 이동 보간 시간(초) — 정수 줄 스냅 대신 smoothstep으로 부드럽게 활강 */
const WEAVE_MOVE_TIME = 0.22;

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
  /** 레인 세로 보간용 출발 줄 인덱스 + 진행도(1=완료). 정수 줄 스냅 대신 부드럽게 이동. */
  private laneFromIdx: number;
  private laneT = 1;

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
    this.laneFromIdx = lane;
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
        const target = this.weaveAtHome ? this.homeLane : this.homeLane + this.weaveDir;
        if (target !== this.lane) {
          this.laneFromIdx = this.lane; // 이징 출발점 = 현재 줄
          this.lane = target; // 판정용 논리 줄은 즉시 목표로(플레이어와 동일 모델)
          this.laneT = 0;
        }
      }
    }
    // 레인 세로 보간 진행 (스냅 방지)
    if (this.laneT < 1) this.laneT = Math.min(1, this.laneT + dt / WEAVE_MOVE_TIME);
    this.y = 0.8 + Math.sin(this.t * 3) * 0.12;
  }

  /** 세로 보간 반영 연속 줄 값 — Game.render가 laneY(laneVisual)로 그린다(smoothstep 이징). */
  get laneVisual(): number {
    if (this.laneT >= 1) return this.lane;
    const s = this.laneT * this.laneT * (3 - 2 * this.laneT);
    return this.laneFromIdx + (this.lane - this.laneFromIdx) * s;
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
    const bob = Math.sin(this.t * 3) * 3;
    const cy = baseY - 0.55 * ppu + bob;

    // 접지 그림자 — 바닥(baseY)에 고정, 바운스로 살짝 축소돼 부유 높이를 표현
    const shScale = 0.9 + Math.sin(this.t * 3) * 0.08;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(sx, baseY + 3, 0.42 * ppu * shScale, 5 * shScale, 0, 0, Math.PI * 2);
    ctx.fill();

    // 스프라이트 몸체 — 좌향(우향 원본 반전), 발밑 baseY 접지(groundContact로 프레임 하단 여백 보정), 티어별 고정 높이.
    //   애니 아틀라스('walk') 우선 → 정적 단일 PNG → 도형 폴백.
    const name = `mob_${currentWorld()}_${this.id}`;
    const drawOpts = { flip: true, height: MOB_HEIGHT_WU[this.behavior] * ppu, groundContact: true };
    if (drawAnim(ctx, name, 'walk', this.t, sx, baseY, drawOpts)) return;
    if (drawSprite(ctx, name, sx, baseY, drawOpts)) return;

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
