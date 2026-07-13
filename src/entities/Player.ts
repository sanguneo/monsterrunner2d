// ============================================================
// 플레이어 — 3줄 닷지 레인 이동 / 성장 스탯 (§5, §10, §13.2)
// v3.1: 점프/슬라이드 제거 — 위/아래 줄 이동만으로 회피한다.
// view: 캡슐 프리미티브 + 망토 어태치먼트 (§3.1, §12)
// ============================================================

import { CONFIG } from '../data/config';
import type { Action, Input } from '../core/Input';
import type { SoundId } from '../systems/Sound';
import { sprite, drawSprite, drawTinted, drawAnim, animFrameAt, isAnimReady, socketScreenPos } from '../systems/Sprites';

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

function attachmentSpriteName(kind: 'cape' | 'hat', equippedName: string): string {
  const id = equippedName.startsWith(`${kind}_`) ? equippedName.slice(kind.length + 1) : equippedName;
  return `attach_${kind}_${id}`;
}

export class Player {
  // --- 위치/동작 상태 ---
  lane = CONFIG.lanes.startIndex;
  z = 0;
  private laneT = 1; // 레인 보간 진행도 (1=완료)
  private laneFromIdx = CONFIG.lanes.startIndex; // 2D 세로 보간용 출발 줄 인덱스
  private queuedAction: Action | null = null; // 액션 중 입력 큐 1개 (§13.2)
  private hopTime = -1; // 점프 경과(초). -1=지면. (§5 점프)
  private hopY = 0; // 현재 hop 높이(월드 단위) — draw/airborne 판정에 사용

  // --- 전투/성장 스탯 ---
  hp = CONFIG.player.baseHp;
  maxHp = CONFIG.player.baseHp;
  attack = CONFIG.player.baseAttack;
  critChance = CONFIG.player.baseCrit;
  level = 1;
  exp = 0;
  expToNext = CONFIG.progression.expCurve(1);

  invulnTimer = 0;
  dashTimer = 0; // 무적 대시 잔여 시간
  alive = true;

  // --- 애니메이션 상태 (아틀라스 재생용) ---
  // 비루프 상태(jump/hit)는 상태 진입 시점부터의 경과시간이 필요하다 —
  // 전역 누적 시간(this.time)을 쓰면 frameIndexAt이 항상 마지막 프레임으로 클램프된다.
  private animName: 'run' | 'jump' | 'hit' = 'run';
  private animT = 0;

  // --- view (2D draw용 스칼라 상태) ---
  /** 달리기 바운스 반영 몸통 y (§3.1) */
  private bodyY = 0.8;
  private bodyVisible = true;
  /** 망토 색상(hex) — 미장착이면 null (§12) */
  private capeColorHex: number | null = null;
  private capeWave = 0.25;
  /** 모자 색상(hex) — 미장착이면 null (§12) */
  private hatColorHex: number | null = null;
  /** 망토/모자 스프라이트 파일명 — 미장착이면 null (§인수인계 2·5) */
  private capeSpriteName: string | null = null;
  private hatSpriteName: string | null = null;
  private time = 0;
  /** 동작 성공 시 효과음 재생 훅 (Game이 SoundManager로 연결) */
  sfx: ((id: SoundId) => void) | null = null;

  /** 망토 장착 외형 (§12) — Cosmetics 호출. color=폴백 도형색, spriteName=오버레이 파일명. */
  equipCape(color: number, spriteName: string | null = null): void {
    this.capeColorHex = color;
    this.capeSpriteName = spriteName;
  }

  unequipCape(): void {
    this.capeColorHex = null;
    this.capeSpriteName = null;
  }

  /** 모자 장착 외형 (§12 모자 슬롯) */
  equipHat(color: number, spriteName: string | null = null): void {
    this.hatColorHex = color;
    this.hatSpriteName = spriteName;
  }

  unequipHat(): void {
    this.hatColorHex = null;
    this.hatSpriteName = null;
  }

  get hasCape(): boolean {
    return this.capeColorHex !== null;
  }

  get hasHat(): boolean {
    return this.hatColorHex !== null;
  }

  /** 망토 색상(hex) — 2D draw용. 미장착이면 null. */
  get capeColor(): number | null {
    return this.capeColorHex;
  }

  /** 모자 색상(hex) — 2D draw용. 미장착이면 null. */
  get hatColor(): number | null {
    return this.hatColorHex;
  }

  get invulnerable(): boolean {
    return this.invulnTimer > 0 || this.dashTimer > 0;
  }

  /** 레벨 이동속도 보너스 배율 (§10.1) */
  get speedMult(): number {
    return 1 + CONFIG.player.moveBonusPerLevel * (this.level - 1);
  }

  update(dt: number, input: Input, allowControl: boolean): void {
    this.time += dt;
    if (this.invulnTimer > 0) this.invulnTimer -= dt;
    if (this.dashTimer > 0) this.dashTimer -= dt;

    if (allowControl) this.handleInput(input);

    // 레인 보간 (0.12s, 2D 세로 렌더용 진행도만 갱신)
    if (this.laneT < 1) {
      this.laneT = Math.min(1, this.laneT + dt / CONFIG.lanes.moveTime);
    }

    // 점프 hop 물리 (§5) — 포물선 아크, 체공 종료 시 착지
    if (this.hopTime >= 0) {
      this.hopTime += dt;
      const air = CONFIG.run.jumpAirTime;
      if (this.hopTime >= air) {
        this.hopTime = -1;
        this.hopY = 0;
      } else {
        const u = this.hopTime / air;
        this.hopY = CONFIG.run.jumpPeak * 4 * u * (1 - u);
      }
    }

    // 액션 종료 시 큐 입력 실행 (§13.2 액션 중 입력 큐 1개)
    if (this.queuedAction && allowControl) {
      const a = this.queuedAction;
      if (this.tryAction(a)) this.queuedAction = null;
    }

    // 애니 상태 결정 + per-state 타이머 (jump/hit 비루프 시퀀스 재생용)
    const anim: 'run' | 'jump' | 'hit' =
      this.hopTime >= 0 ? 'jump' : this.invulnTimer > 0 && this.dashTimer <= 0 ? 'hit' : 'run';
    if (anim !== this.animName) {
      this.animName = anim;
      this.animT = 0;
    } else {
      this.animT += dt;
    }

    this.updateView();
  }

  private handleInput(input: Input): void {
    let action: Action | null;
    while ((action = input.consumeAny(['up', 'down', 'jump'])) !== null) {
      if (!this.tryAction(action)) {
        this.queuedAction = action; // 실행 불가 → 1개 큐잉
      }
    }
  }

  /** @returns 실행 성공 여부 */
  tryAction(action: Action): boolean {
    switch (action) {
      case 'up':
        if (this.lane <= 0) return true; // 맨 위 줄: 무시하되 큐에 남기지 않음
        this.startLaneMove(this.lane - 1);
        return true;
      case 'down':
        if (this.lane >= CONFIG.lanes.count - 1) return true; // 맨 아래 줄
        this.startLaneMove(this.lane + 1);
        return true;
      case 'jump':
        if (this.hopTime < 0) {
          this.hopTime = 0; // 지면에서만 점프 시작(더블점프 없음)
          this.sfx?.('jump');
        }
        return true; // 공중이면 무시하되 큐에 남기지 않음
      default:
        return true;
    }
  }

  private startLaneMove(target: number): void {
    this.laneFromIdx = this.lane;
    this.lane = target;
    this.laneT = 0;
    this.sfx?.('laneMove');
  }

  takeDamage(amount: number): boolean {
    if (!this.alive || this.invulnerable) return false;
    this.hp -= amount;
    this.invulnTimer = CONFIG.run.hitInvuln;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
    return true;
  }

  heal(amount: number): void {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  resetForRun(): void {
    this.hp = CONFIG.player.baseHp;
    this.maxHp = CONFIG.player.baseHp;
    this.attack = CONFIG.player.baseAttack;
    this.critChance = CONFIG.player.baseCrit;
    this.level = 1;
    this.exp = 0;
    this.expToNext = CONFIG.progression.expCurve(1);
    this.lane = CONFIG.lanes.startIndex;
    this.laneFromIdx = this.lane;
    this.laneT = 1;
    this.z = 0;
    this.invulnTimer = 0;
    this.dashTimer = 0;
    this.queuedAction = null;
    this.hopTime = -1;
    this.hopY = 0;
    this.animName = 'run';
    this.animT = 0;
    this.alive = true;
  }

  /** 현재 애니 상태명 (draw/테스트용) — run | jump | hit */
  get animState(): string {
    return this.animName;
  }

  /** 현재 애니 상태 진입 후 경과시간(초) — 비루프 시퀀스 재생 기준 */
  get animTime(): number {
    return this.animT;
  }

  private updateView(): void {
    // 달리기 바운스
    this.bodyY = 0.8 + Math.abs(Math.sin(this.time * 10)) * 0.06;
    // 무적/대시 깜빡임
    if (this.dashTimer > 0) {
      this.bodyVisible = true;
    } else if (this.invulnTimer > 0) {
      this.bodyVisible = Math.floor(this.time * 14) % 2 === 0;
    } else {
      this.bodyVisible = true;
    }
    if (this.capeColorHex !== null) {
      this.capeWave = 0.25 + Math.sin(this.time * 6) * 0.08;
    }
  }

  /** 2D 렌더용 진행거리(worldX) — 현행 3D 전진값(z)을 그대로 사용 (§3.1) */
  get worldX(): number {
    return this.z;
  }

  /** 점프 회피 판정 — hop 높이가 충분히 올라간 구간(§5). BLOCK/MOVER·보스 wave를 뛰어넘는다. */
  get airborne(): boolean {
    return this.hopY > CONFIG.run.jumpPeak * 0.35;
  }

  /** 2D 렌더용 연속 줄 값(세로 보간, §3.1/§4 0.12s smoothstep). laneY(laneVisual)로 사용. */
  get laneVisual(): number {
    if (this.laneT >= 1) return this.lane;
    const s = this.laneT * this.laneT * (3 - 2 * this.laneT);
    return this.laneFromIdx + (this.lane - this.laneFromIdx) * s;
  }

  /**
   * 2D 드로우 — 캡슐형 몸 + 머리 + 얼굴 점 + 그림자. 망토/모자는 있으면 색 도형 부착.
   * sx/baseY는 Game.render가 worldToScreenX/laneY로 계산해 전달한다 (§3.1).
   */
  draw(ctx: CanvasRenderingContext2D, sx: number, baseY: number): void {
    // 무적(비대시) 시 점멸 — 대시 중엔 항상 표시
    if (this.dashTimer <= 0 && this.invulnTimer > 0 && Math.floor(this.time * 14) % 2 !== 0) return;
    if (!this.bodyVisible) return;

    const w = 32;
    const h = 50;
    const lift = this.hopY * CONFIG.render.ppu; // 점프 hop 화면 높이(px)
    const footY = baseY - lift;
    const bodyTop = footY - h;

    // 그림자
    // 그림자 (지면에 고정 — 점프 시 축소되어 높이를 시각적으로 알린다)
    const shScale = 1 - Math.min(0.55, (this.hopY / CONFIG.run.jumpPeak) * 0.55);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(sx, baseY + 3, w * 0.5 * shScale, 5 * shScale, 0, 0, Math.PI * 2);
    ctx.fill();

    // 스프라이트 경로: 망토(뒤) → 몸 → 모자(앞), 96 프레임 공유.
    //   몸 = 애니 아틀라스('player' 그룹) 우선 → 없으면 정적 player_idle(대시 시 청색 틴트).
    //   애니 상태: 점프 중 'jump' / 피격 무적 중 'hit' / 그 외 'run'. (매니페스트에 없으면 idle 폴백)
    const H = 88;
    const animReady = isAnimReady('player');
    if (animReady || sprite('player_idle')) {
      const animFrame = animReady ? animFrameAt('player', this.animName, this.animT) : null;

      let capeDrawn = false;
      if (this.capeSpriteName && animFrame) {
        const socket = socketScreenPos('player', animFrame.state, animFrame.frame, 'back', {
          cx: sx,
          anchorY: footY,
          height: H,
        });
        if (socket) {
          capeDrawn = drawSprite(ctx, attachmentSpriteName('cape', this.capeSpriteName), socket.x, socket.y + H * 0.42, {
            height: H * 0.82,
          });
        }
      }
      if (!capeDrawn && this.capeSpriteName) drawSprite(ctx, this.capeSpriteName, sx, footY, { height: H });

      if (!this.capeSpriteName && this.capeColorHex !== null) {
        ctx.fillStyle = hex(this.capeColorHex);
        ctx.beginPath();
        ctx.moveTo(sx - w * 0.4, bodyTop + h * 0.1);
        ctx.lineTo(sx + w * 0.4, bodyTop + h * 0.1);
        ctx.lineTo(sx, footY + 4);
        ctx.closePath();
        ctx.fill();
      }

      const animResult = animFrame
        ? drawAnim(ctx, 'player', this.animName, this.animT, sx, footY, { height: H, groundContact: true })
        : null;

      if (!animResult && this.dashTimer > 0) {
        drawTinted(ctx, 'player_idle', 0x8fd0ff, sx, footY, { height: H, groundContact: true });
      } else if (!animResult) {
        drawSprite(ctx, 'player_idle', sx, footY, { height: H, groundContact: true });
      }

      let hatDrawn = false;
      if (this.hatSpriteName && animResult) {
        const socket = socketScreenPos('player', animResult.state, animResult.frame, 'head', {
          cx: sx,
          anchorY: footY,
          height: H,
        });
        if (socket) {
          hatDrawn = drawSprite(
            ctx,
            attachmentSpriteName('hat', this.hatSpriteName),
            socket.x,
            socket.y + H * (54 / 96),
            { height: H },
          );
        }
      }
      if (!hatDrawn && this.hatSpriteName) drawSprite(ctx, this.hatSpriteName, sx, footY, { height: H });

      if (!this.hatSpriteName && this.hatColorHex !== null) {
        const headR = w * 0.36;
        const headCy = bodyTop - headR * 0.6;
        ctx.fillStyle = hex(this.hatColorHex);
        ctx.beginPath();
        ctx.moveTo(sx - headR * 0.9, headCy - headR * 0.4);
        ctx.lineTo(sx + headR * 0.9, headCy - headR * 0.4);
        ctx.lineTo(sx, headCy - headR * 2.1);
        ctx.closePath();
        ctx.fill();
      }
      return;
    }

    // 망토
    const capeColor = this.capeColor;
    if (capeColor !== null) {
      ctx.fillStyle = hex(capeColor);
      ctx.beginPath();
      ctx.moveTo(sx - w * 0.4, bodyTop + h * 0.1);
      ctx.lineTo(sx + w * 0.4, bodyTop + h * 0.1);
      ctx.lineTo(sx, footY + 4);
      ctx.closePath();
      ctx.fill();
    }

    // 몸
    ctx.fillStyle = this.dashTimer > 0 ? '#5fb6ff' : '#ff7849';
    roundRect(ctx, sx - w / 2, bodyTop, w, h, w * 0.4);
    ctx.fill();

    // 머리
    const headR = w * 0.36;
    const headCy = bodyTop - headR * 0.6;
    ctx.beginPath();
    ctx.arc(sx, headCy, headR, 0, Math.PI * 2);
    ctx.fill();

    // 모자
    const hatColor = this.hatColor;
    if (hatColor !== null) {
      ctx.fillStyle = hex(hatColor);
      ctx.beginPath();
      ctx.moveTo(sx - headR * 0.9, headCy - headR * 0.4);
      ctx.lineTo(sx + headR * 0.9, headCy - headR * 0.4);
      ctx.lineTo(sx, headCy - headR * 2.1);
      ctx.closePath();
      ctx.fill();
    }

    // 얼굴 점
    ctx.fillStyle = '#221109';
    ctx.beginPath();
    ctx.arc(sx + headR * 0.35, headCy, headR * 0.18, 0, Math.PI * 2);
    ctx.fill();
  }
}
