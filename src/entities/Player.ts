// ============================================================
// 플레이어 — 3줄 닷지 레인 이동 / 성장 스탯 (§5, §10, §13.2)
// v3.1: 점프/슬라이드 제거 — 위/아래 줄 이동만으로 회피한다.
// view: 캡슐 프리미티브 + 망토 어태치먼트 (§3.1, §12)
// ============================================================

import * as THREE from 'three';
import { CONFIG, laneX } from '../data/config';
import type { Action, Input } from '../core/Input';
import type { SoundId } from '../systems/Sound';

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

export class Player {
  // --- 위치/동작 상태 ---
  lane = CONFIG.lanes.startIndex;
  x = laneX(CONFIG.lanes.startIndex);
  /**
   * 항상 0/false 유지되는 레거시 상시값 — 점프/슬라이드가 제거되어 플레이어는 항상 지면(y=0)·비슬라이드 상태다.
   * Boss.ts의 wave/scream 패턴(구 점프/슬라이드 회피)이 참조하는 shim이며, 해당 패턴의 줄-회피 축 전환은 S5에서 처리한다.
   */
  readonly y = 0;
  readonly sliding = false;
  z = 0;
  private laneFrom = laneX(CONFIG.lanes.startIndex);
  private laneT = 1; // 레인 보간 진행도 (1=완료)
  private laneFromIdx = CONFIG.lanes.startIndex; // 2D 세로 보간용 출발 줄 인덱스
  private queuedAction: Action | null = null; // 액션 중 입력 큐 1개 (§13.2)

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

  // --- view (3D shim — S6까지 유지, 2D 렌더에는 미사용) ---
  readonly group: THREE.Group;
  private body: THREE.Mesh;
  private capeMesh: THREE.Mesh | null = null;
  private hatMesh: THREE.Mesh | null = null;
  private time = 0;
  /** 동작 성공 시 효과음 재생 훅 (Game이 SoundManager로 연결) */
  sfx: ((id: SoundId) => void) | null = null;

  constructor() {
    this.group = new THREE.Group();
    const geo = new THREE.CapsuleGeometry(0.4, 0.8, 6, 12);
    const mat = new THREE.MeshStandardMaterial({ color: 0xff7849, emissive: 0x33150a });
    this.body = new THREE.Mesh(geo, mat);
    this.body.position.y = 0.8;
    this.group.add(this.body);
  }

  /** 망토 장착 외형 (§12) — Cosmetics에서 호출. 색상은 보상 아이템별. */
  equipCape(color: number): void {
    if (this.capeMesh) {
      (this.capeMesh.material as THREE.MeshStandardMaterial).color.setHex(color);
      return;
    }
    const geo = new THREE.ConeGeometry(0.55, 1.1, 10, 1, true);
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: 0x222233,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
    });
    this.capeMesh = new THREE.Mesh(geo, mat);
    this.capeMesh.position.set(0, 0.75, -0.28);
    this.capeMesh.rotation.x = 0.25;
    this.group.add(this.capeMesh);
  }

  unequipCape(): void {
    if (!this.capeMesh) return;
    this.group.remove(this.capeMesh);
    this.capeMesh = null;
  }

  /** 모자 장착 외형 (§12 모자 슬롯) */
  equipHat(color: number): void {
    if (this.hatMesh) {
      (this.hatMesh.material as THREE.MeshStandardMaterial).color.setHex(color);
      return;
    }
    const geo = new THREE.ConeGeometry(0.36, 0.5, 10);
    const mat = new THREE.MeshStandardMaterial({ color, emissive: 0x222222 });
    this.hatMesh = new THREE.Mesh(geo, mat);
    this.hatMesh.position.set(0, 1.85, 0);
    this.group.add(this.hatMesh);
  }

  unequipHat(): void {
    if (!this.hatMesh) return;
    this.group.remove(this.hatMesh);
    this.hatMesh = null;
  }

  get hasCape(): boolean {
    return this.capeMesh !== null;
  }

  get hasHat(): boolean {
    return this.hatMesh !== null;
  }

  /** 망토 색상(hex) — 2D draw용. 미장착이면 null. */
  get capeColor(): number | null {
    return this.capeMesh ? (this.capeMesh.material as THREE.MeshStandardMaterial).color.getHex() : null;
  }

  /** 모자 색상(hex) — 2D draw용. 미장착이면 null. */
  get hatColor(): number | null {
    return this.hatMesh ? (this.hatMesh.material as THREE.MeshStandardMaterial).color.getHex() : null;
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

    // 레인 보간 (0.12s)
    if (this.laneT < 1) {
      this.laneT = Math.min(1, this.laneT + dt / CONFIG.lanes.moveTime);
      const target = laneX(this.lane);
      // smoothstep 보간
      const s = this.laneT * this.laneT * (3 - 2 * this.laneT);
      this.x = this.laneFrom + (target - this.laneFrom) * s;
    } else {
      this.x = laneX(this.lane);
    }

    // 액션 종료 시 큐 입력 실행 (§13.2 액션 중 입력 큐 1개)
    if (this.queuedAction && allowControl) {
      const a = this.queuedAction;
      if (this.tryAction(a)) this.queuedAction = null;
    }

    this.updateView();
  }

  private handleInput(input: Input): void {
    let action: Action | null;
    while ((action = input.consumeAny(['up', 'down'])) !== null) {
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
      default:
        return true;
    }
  }

  private startLaneMove(target: number): void {
    this.laneFrom = this.x;
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
    this.x = laneX(this.lane);
    this.laneFrom = this.x;
    this.laneFromIdx = this.lane;
    this.laneT = 1;
    this.z = 0;
    this.invulnTimer = 0;
    this.dashTimer = 0;
    this.queuedAction = null;
    this.alive = true;
  }

  private updateView(): void {
    this.group.position.set(this.x, this.y, this.z);
    this.body.position.y = 0.8;
    // 달리기 바운스
    this.body.position.y += Math.abs(Math.sin(this.time * 10)) * 0.06;
    // 무적/대시 깜빡임
    if (this.dashTimer > 0) {
      this.body.visible = true;
      (this.body.material as THREE.MeshStandardMaterial).emissive.setHex(0x2255aa);
    } else if (this.invulnTimer > 0) {
      this.body.visible = Math.floor(this.time * 14) % 2 === 0;
      (this.body.material as THREE.MeshStandardMaterial).emissive.setHex(0x33150a);
    } else {
      this.body.visible = true;
      (this.body.material as THREE.MeshStandardMaterial).emissive.setHex(0x33150a);
    }
    if (this.capeMesh) {
      this.capeMesh.rotation.x = 0.25 + Math.sin(this.time * 6) * 0.08;
    }
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  /** 2D 렌더용 진행거리(worldX) — 현행 3D 전진값(z)을 그대로 사용 (§3.1) */
  get worldX(): number {
    return this.z;
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

    const w = 32;
    const h = 50;
    const footY = baseY;
    const bodyTop = footY - h;

    // 그림자
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(sx, baseY + 3, w * 0.5, 5, 0, 0, Math.PI * 2);
    ctx.fill();

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
