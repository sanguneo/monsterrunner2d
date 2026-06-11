// ============================================================
// 플레이어 — 레인 이동 / 점프 / 슬라이드 / 성장 스탯 (§5, §10, §13.2)
// view: 캡슐 프리미티브 + 망토 어태치먼트 (§3.1, §12)
// ============================================================

import * as THREE from 'three';
import { CONFIG, laneX } from '../data/config';
import type { Action, Input } from '../core/Input';

export class Player {
  // --- 위치/동작 상태 ---
  lane = CONFIG.lanes.startIndex;
  x = laneX(CONFIG.lanes.startIndex);
  y = 0;
  z = 0;
  private vy = 0;
  jumping = false;
  sliding = false;
  private slideTimer = 0;
  private laneFrom = laneX(CONFIG.lanes.startIndex);
  private laneT = 1; // 레인 보간 진행도 (1=완료)
  private lastGroundedAt = 0; // 코요테 타임용
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

  // --- view ---
  readonly group: THREE.Group;
  private body: THREE.Mesh;
  private capeMesh: THREE.Mesh | null = null;
  private hatMesh: THREE.Mesh | null = null;
  private time = 0;

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

  get airborne(): boolean {
    return this.y > 0.01;
  }

  get invulnerable(): boolean {
    return this.invulnTimer > 0 || this.dashTimer > 0;
  }

  /** 레벨 반영 점프 초기 속도: 체공 0.7s 기준 v0 = |g|*T/2 */
  private jumpVelocity(): number {
    const base = (-CONFIG.run.gravity * CONFIG.run.jumpAirTime) / 2;
    return base * (1 + CONFIG.player.jumpBonusPerLevel * (this.level - 1));
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

    // 점프 물리
    if (this.jumping) {
      this.vy += CONFIG.run.gravity * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.jumping = false;
      }
    }
    if (!this.airborne) this.lastGroundedAt = performance.now() / 1000;

    // 슬라이드 타이머
    if (this.sliding) {
      this.slideTimer -= dt;
      if (this.slideTimer <= 0) this.sliding = false;
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
    while ((action = input.consumeAny(['left', 'right', 'jump', 'slide'])) !== null) {
      if (!this.tryAction(action)) {
        this.queuedAction = action; // 실행 불가 → 1개 큐잉
      }
    }
  }

  /** @returns 실행 성공 여부 */
  tryAction(action: Action): boolean {
    switch (action) {
      case 'left':
        if (this.lane <= 0) return true; // 벽: 무시하되 큐에 남기지 않음
        this.startLaneMove(this.lane - 1);
        return true;
      case 'right':
        if (this.lane >= CONFIG.lanes.count - 1) return true;
        this.startLaneMove(this.lane + 1);
        return true;
      case 'jump': {
        const coyote = performance.now() / 1000 - this.lastGroundedAt <= CONFIG.accessibility.coyoteTime;
        if (!this.jumping && (!this.airborne || coyote)) {
          this.jumping = true;
          this.sliding = false;
          this.vy = this.jumpVelocity();
          this.y = Math.max(this.y, 0.001);
          return true;
        }
        return false;
      }
      case 'slide':
        if (!this.airborne) {
          this.sliding = true;
          this.slideTimer = CONFIG.run.slideDuration;
          return true;
        }
        // 공중 슬라이드 입력 → 빠른 낙하 + 착지 시 큐 실행
        this.vy = Math.min(this.vy, -14);
        return false;
      default:
        return true;
    }
  }

  private startLaneMove(target: number): void {
    this.laneFrom = this.x;
    this.lane = target;
    this.laneT = 0;
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
    this.laneT = 1;
    this.y = 0;
    this.z = 0;
    this.vy = 0;
    this.jumping = false;
    this.sliding = false;
    this.invulnTimer = 0;
    this.dashTimer = 0;
    this.queuedAction = null;
    this.alive = true;
  }

  private updateView(): void {
    this.group.position.set(this.x, this.y, this.z);
    // 슬라이드: 몸 낮추기
    const targetScaleY = this.sliding ? 0.45 : 1;
    this.body.scale.y += (targetScaleY - this.body.scale.y) * 0.4;
    this.body.position.y = 0.8 * this.body.scale.y;
    // 달리기 바운스
    if (!this.airborne && !this.sliding) {
      this.body.position.y += Math.abs(Math.sin(this.time * 10)) * 0.06;
    }
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
}
