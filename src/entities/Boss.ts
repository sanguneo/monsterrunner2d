// ============================================================
// 보스 — 패턴 큐 기반 범용 AI 엔진 (§9)
// 예고(telegraph) → 발동(active) → 후딜(recovery)/경직(stagger) 사이클.
// 모든 보스는 data/worlds.ts의 BossDef(패턴/페이즈/외형)로 구동된다.
// 패턴 타입: projectile / wave / walls / summon / teleport / scream
// 큐 항목 'a+b'는 연계(첫 패턴 종료 즉시 다음 발동).
// v3.1: 모든 회피=줄(lane) 이동 — 위협은 동시 최대 2줄, 안전 줄 항상 ≥1 (§9.1).
// ============================================================

import { CONFIG, laneY, worldToScreenX } from '../data/config';
import type { BossPhaseConfig } from '../data/config';
import type { BossDef, PatternDef } from '../data/worlds';
import type { Game } from '../core/Game';
import { pickThreatLanes } from '../core/rules';
import { drawSprite, drawTinted, drawAnim } from '../systems/Sprites';

type BossState =
  'intro' | 'gap' | 'telegraph' | 'active' | 'recovery' | 'stagger' | 'vanish' | 'reappear' | 'phasechange' | 'dead';

interface BlockWall {
  lane: number;
  timer: number;
  duration: number;
  damage: number;
  hitDone: boolean; // 벽당 1회 피해 (BLOCK 장애물과 동일 — 무한 드레인 방지)
}

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

export class Boss {
  readonly def: BossDef;
  hp: number;
  readonly maxHp: number;
  phaseIdx = 0;
  state: BossState = 'intro';
  dead = false;

  private timer = 1.8;
  private qPos = 0;
  private currentPattern = '';
  private chain: string[] = []; // 'a+b' 연계 큐
  private targetLanes: number[] = [];
  private lane = 1;
  private bobT = 0;
  private invulnTimer = 0;
  private defeatNotified = false;

  // 패턴 런타임 (모두 스칼라 — THREE 비의존)
  private waveZ: number | null = null; // 파동의 현재 worldX(z) — null이면 비활성
  private waveCrossed = false;
  private blockWalls: BlockWall[] = [];
  private screamHit = false; // active 동안 대상 줄에 있었으면 true → 종료 시 피해
  // barrage(연속 탄막)
  private barrageLeft = 0;
  private barrageTimer = 0;
  private barrageLanes: number[] = [];
  // chase(추적 강타)
  private chaseLane = 1;
  // rush(돌진)
  private rushHit = false;

  // 위치 — worldX(z 스칼라)/lane. 2D 렌더는 Game.render가 worldToScreenX(worldX,scroll)/laneY(currentLane)로 sx/baseY를 계산해 draw에 전달한다.
  private posZ: number; // 현재 worldX (rush 이동/복귀에 따라 변동)
  private posY = 3.5; // 시각 바운스/인트로 하강/사망 낙하용 스칼라 높이
  private bodyVisible = true; // vanish 점멸 반영

  readonly z: number; // 아레나 고정 worldX(스폰 지점)

  constructor(
    def: BossDef,
    private game: Game,
    z: number,
  ) {
    this.def = def;
    this.z = z;
    this.posZ = z;
    this.hp = def.hp;
    this.maxHp = def.hp;
  }

  private get phases(): BossPhaseConfig[] {
    return this.def.phases;
  }

  private get phase(): BossPhaseConfig {
    return this.phases[this.phaseIdx];
  }

  get hpFrac(): number {
    return Math.max(0, this.hp / this.maxHp);
  }

  get nameKey(): string {
    return this.def.nameKey;
  }

  get staggered(): boolean {
    return this.state === 'stagger';
  }

  /** scream active 동안 자동사격 봉인 (§9.2 — 봉인과 경직은 절대 비겹침) */
  get fireLockActive(): boolean {
    return this.patternDef(this.currentPattern)?.type === 'scream' && this.state === 'active';
  }

  get targetable(): boolean {
    return !this.dead && this.state !== 'vanish' && this.state !== 'intro';
  }

  /** 2D 렌더용 현재 worldX(z) — Game.render가 worldToScreenX(worldX, scroll)로 사용 (§3.1) */
  get worldX(): number {
    return this.posZ;
  }

  /** 2D 렌더용 현재 레인(정수) — baseY = laneY(currentLane) 계산에 사용 (§3.1) */
  get currentLane(): number {
    return this.lane;
  }

  private getMod(name: string, fallback: number): number {
    return this.phase.mods?.[name] ?? fallback;
  }

  private patternDef(id: string): PatternDef | null {
    return this.def.patterns[id] ?? null;
  }

  // ----------------------------------------------------------
  // 데미지 / 페이즈
  // ----------------------------------------------------------

  takeDamage(amount: number): number {
    if (this.dead || !this.targetable || this.invulnTimer > 0) return 0;
    const mult = this.staggered ? this.def.staggerDamageMult : 1;
    const dealt = Math.round(amount * mult);
    this.hp -= dealt;
    this.game.sound.play('bossHit');

    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
      return dealt;
    }
    this.checkPhaseTransition();
    return dealt;
  }

  private checkPhaseTransition(): void {
    let idx = 0;
    for (let i = 0; i < this.phases.length; i++) {
      if (this.hpFrac <= this.phases[i].from + 1e-9) idx = i;
    }
    if (idx > this.phaseIdx) {
      this.phaseIdx = idx;
      this.invulnTimer = CONFIG.phaseTransition.invuln;
      this.qPos = 0;
      this.chain = [];
      // 진행 중이던 위험요소 정리 — 파동/차단벽이 남는 것 방지
      // (패턴 큐 리셋과 함께 위험도 리셋, 돌진 중이었다면 제자리 복귀 포함)
      this.clearHazards();
      this.bodyVisible = true; // vanish 중 전환 대비
      this.game.hud.setShade(0); // scream 중 전환 대비
      this.state = 'phasechange';
      this.timer = 0.8;
      this.game.sound.play('bossPhase');
      this.game.cameraCtl.shake(0.25, 0.4);
      this.game.hud.flashScreen('#ffffff', 0.25);
      // 최종 페이즈 광폭화: 배경 톤 어둡게 (§9.4)
      if (this.phaseIdx === this.phases.length - 1 && this.phases.length >= 3) {
        this.game.setMood('dark');
      }
    }
  }

  private die(): void {
    this.dead = true;
    this.state = 'dead';
    this.timer = 1.4;
    this.clearHazards();
    this.game.hud.setShade(0);
    this.game.sound.play('bossDefeat');
  }

  // ----------------------------------------------------------
  // 업데이트 루프
  // ----------------------------------------------------------

  update(dt: number): void {
    this.bobT += dt;
    if (this.invulnTimer > 0) this.invulnTimer -= dt;

    if (this.state !== 'intro' && this.state !== 'dead') {
      this.posY += (Math.sin(this.bobT * 2) * 0.15 + 0.2 - this.posY) * dt * 3;
    }

    this.updateHazards(dt);

    switch (this.state) {
      case 'intro':
        this.posY = Math.max(0.2, this.posY - dt * 2.2);
        this.timer -= dt;
        if (this.timer <= 0) this.enterGap(0.6);
        break;

      case 'gap':
      case 'phasechange':
        this.timer -= dt;
        if (this.timer <= 0) this.startPattern(this.nextPatternId());
        break;

      case 'telegraph': {
        this.timer -= dt;
        const tDef = this.patternDef(this.currentPattern);
        if (tDef?.type === 'scream') {
          this.game.hud.setShade(0.25);
          if (Math.random() < dt * 8) this.game.cameraCtl.shake(0.06, 0.1);
        }
        if (this.timer <= 0) this.beginActive();
        break;
      }

      case 'active':
        this.updateActive(dt);
        break;

      case 'recovery':
        this.timer -= dt;
        if (this.timer <= 0) this.afterPattern();
        break;

      case 'stagger':
        this.timer -= dt;
        if (this.timer <= 0) {
          this.game.hud.setShade(0);
          this.afterPattern();
        }
        break;

      case 'vanish':
        this.bodyVisible = Math.floor(this.bobT * 20) % 2 === 0;
        this.timer -= dt;
        if (this.timer <= 0) {
          // 좌/중/우 새 위치 이동 (§9.2 T)
          const lanes = [0, 1, 2].filter((l) => l !== this.lane);
          this.lane = lanes[Math.floor(Math.random() * lanes.length)];
          this.state = 'reappear';
          this.timer = this.patternDef(this.currentPattern)?.reappear ?? 0.4;
        }
        break;

      case 'reappear':
        this.bodyVisible = true;
        this.timer -= dt;
        if (this.timer <= 0) this.afterPattern(); // 연계가 있으면 즉시 다음 패턴

        break;

      case 'dead':
        this.timer -= dt;
        this.posY -= dt * 0.8;
        if (this.timer <= 0 && !this.defeatNotified) {
          this.defeatNotified = true;
          this.game.onBossDefeated();
        }
        break;
    }
  }

  // ----------------------------------------------------------
  // 패턴 시작/발동/종료
  // ----------------------------------------------------------

  private nextPatternId(): string {
    const queue = this.phase.queue;
    const id = queue[this.qPos % queue.length];
    this.qPos++;
    return id;
  }

  private enterGap(duration: number): void {
    this.state = 'gap';
    this.timer = duration;
  }

  /** 패턴 종료 처리 — 연계('a+b')가 남아 있으면 즉시 다음 패턴 */
  private afterPattern(): void {
    if (this.chain.length > 0) {
      this.startPattern(this.chain.shift()!);
    } else {
      this.enterGap(this.phase.gap);
    }
  }

  private startPattern(id: string): void {
    // 'a+b' 연계 표기 처리
    if (id.includes('+')) {
      const parts = id.split('+');
      this.chain.push(...parts.slice(1));
      id = parts[0];
    }

    const def = this.patternDef(id);
    if (!def) {
      this.enterGap(this.phase.gap);
      return;
    }
    this.currentPattern = id;
    const teleMult = this.getMod('telegraphMult', 1);
    const player = this.game.player;

    if (def.type === 'teleport') {
      this.state = 'vanish';
      this.timer = def.vanish ?? 0.5;
      return;
    }

    this.game.sound.play('telegraph');

    switch (def.type) {
      case 'projectile':
        this.targetLanes = this.pickLanes(player.lane, def.lanes ?? 1);
        this.state = 'telegraph';
        this.timer = (def.telegraph ?? 0.6) * teleMult;
        break;

      case 'barrage':
        // 연속 탄막: 전 레인 순차 위협 — 예고는 전 레인
        this.targetLanes = [0, 1, 2];
        this.state = 'telegraph';
        this.timer = (def.telegraph ?? 0.7) * teleMult;
        break;

      case 'wave':
        // 줄 순차 파동: 2줄 덮고 1줄은 항상 안전 (§9.1 B — 점프 판정 폐지)
        this.targetLanes = this.pickLanes(player.lane, 2);
        this.state = 'telegraph';
        this.timer = (def.telegraph ?? 0.8) * teleMult;
        break;

      case 'walls':
        this.targetLanes = this.pickLanes(player.lane, def.lanes ?? 1);
        this.state = 'telegraph';
        this.timer = (def.telegraph ?? 0.7) * teleMult;
        break;

      case 'chase':
        // 추적 강타: 락 직전까지 플레이어 줄을 계속 추적
        this.chaseLane = player.lane;
        this.state = 'telegraph';
        this.timer = (def.telegraph ?? 1.2) * teleMult;
        break;

      case 'rush':
        // 돌진: 보스가 플레이어 레인으로 이동 후 예고
        this.lane = player.lane;
        this.state = 'telegraph';
        this.timer = (def.telegraph ?? 0.85) * teleMult;
        break;

      case 'summon':
        this.state = 'telegraph';
        this.timer = (def.telegraph ?? 1.0) * teleMult;
        break;

      case 'scream':
        // 자동사격 봉인(active) + 대상 줄(1~2) 음파 — 안전 줄로 회피 (§9.2 S — 슬라이드 판정 폐지)
        this.targetLanes = this.pickLanes(player.lane, def.lanes ?? 2);
        this.screamHit = false;
        this.state = 'telegraph';
        this.timer = (def.telegraph ?? 1.0) * teleMult;
        this.game.sound.play('scream');
        break;
    }
  }

  /** 플레이어 레인 포함 n개 레인 선택 — 항상 안전 레인 1개 이상 보장 */
  private pickLanes(playerLane: number, n: number): number[] {
    return pickThreatLanes(playerLane, n, CONFIG.lanes.count);
  }

  private beginActive(): void {
    const def = this.patternDef(this.currentPattern);
    if (!def) return;
    const player = this.game.player;

    switch (def.type) {
      case 'projectile':
        for (const lane of this.targetLanes) {
          this.game.spawnEnemyProjectile(lane, this.z - 1, def.damage ?? 12, def.projSpeed ?? 20, {
            color: def.color,
            shape: def.projShape,
          });
        }
        this.state = 'recovery';
        this.timer = def.recovery ?? 0.4;
        break;

      case 'barrage': {
        // 레인 순차 난사 — 셔플된 순서로 모든 레인을 훑는다 (리듬 회피)
        this.barrageLeft = def.shots ?? 3;
        this.barrageTimer = 0;
        const order = [0, 1, 2].sort(() => Math.random() - 0.5);
        this.barrageLanes = [];
        for (let i = 0; i < this.barrageLeft; i++) this.barrageLanes.push(order[i % 3]);
        this.state = 'active';
        this.timer = 6.0; // 안전 상한
        break;
      }

      case 'wave':
        this.waveZ = this.z - 1;
        this.waveCrossed = false;
        this.state = 'active';
        this.timer = 3.0;
        this.game.cameraCtl.shake(0.12, 0.25);
        break;

      case 'chase':
        // 락: 목표 줄 고정, 잠깐의 마지막 회피 기회
        this.chaseLane = player.lane;
        this.state = 'active';
        this.timer = def.lockTime ?? 0.35;
        break;

      case 'rush':
        this.rushHit = false;
        this.state = 'active';
        this.timer = 4.0; // 안전 상한
        this.game.sound.play('telegraph');
        break;

      case 'summon': {
        const [min, max] = def.count ?? [1, 2];
        const n = min + Math.floor(Math.random() * (max - min + 1));
        const mDef = this.game.world.monsters[def.monsterIdx ?? 2];
        for (let i = 0; i < n; i++) {
          const lane = Math.floor(Math.random() * 3);
          const m = this.game.spawnMonster(mDef, lane, this.z - 3 - i * 1.5);
          m.isMinion = true;
        }
        this.state = 'recovery';
        this.timer = def.recovery ?? 0.6;
        break;
      }

      case 'walls':
        for (const lane of this.targetLanes) {
          this.blockWalls.push({
            lane,
            timer: def.blockDuration ?? 2.0,
            duration: def.blockDuration ?? 2.0,
            damage: def.damage ?? 20,
            hitDone: false,
          });
        }
        this.state = 'recovery';
        this.timer = def.recovery ?? 0.5;
        break;

      case 'scream':
        this.state = 'active';
        this.timer = def.fireLock ?? 1.0; // active — 이 동안만 자동사격 봉인
        this.game.hud.setShade(0.45);
        this.game.cameraCtl.shake(0.18, def.fireLock ?? 1.0);
        break;

      case 'teleport':
        break;
    }
  }

  private updateActive(dt: number): void {
    const def = this.patternDef(this.currentPattern);
    if (!def) return;
    const player = this.game.player;

    if (def.type === 'wave') {
      if (this.waveZ !== null) {
        this.waveZ -= (def.waveSpeed ?? 14) * dt;
        // 통과 시점 판정: 대상 줄에 있으면 피해 (§9.1 B — 안전 줄로 이동해 회피)
        if (!this.waveCrossed && this.waveZ <= player.z + 0.4) {
          this.waveCrossed = true;
          if (this.targetLanes.includes(player.lane) && !player.airborne) {
            this.game.damagePlayer(def.damage ?? 18);
          }
        }
        if (this.waveZ < player.z - 6) {
          this.waveZ = null;
          // 파동 후 경직 ★ — 주 딜 타이밍
          this.enterStagger((def.stagger ?? 1.2) * this.getMod('staggerMult', 1));
          return;
        }
      }
      this.timer -= dt;
      if (this.timer <= 0) {
        this.waveZ = null;
        this.enterStagger((def.stagger ?? 1.2) * this.getMod('staggerMult', 1));
      }
    } else if (def.type === 'scream') {
      if (this.targetLanes.includes(player.lane)) this.screamHit = true; // 대상 줄 체류 (§9.2 S)
      this.timer -= dt;
      if (this.timer <= 0) {
        if (this.screamHit) {
          this.game.damagePlayer(def.damage ?? 15);
        }
        this.game.hud.setShade(0);
        // active 종료 후 경직 — 봉인과 경직은 순차·비겹침 (§9.2)
        this.enterStagger((def.stagger ?? 1.5) * this.getMod('staggerMult', 1));
      }
    } else if (def.type === 'barrage') {
      // 순차 난사
      this.timer -= dt; // 안전 상한 카운트다운
      this.barrageTimer -= dt;
      if (this.barrageTimer <= 0 && this.barrageLeft > 0) {
        const lane = this.barrageLanes[this.barrageLanes.length - this.barrageLeft];
        this.game.spawnEnemyProjectile(lane, this.z - 1, def.damage ?? 14, def.projSpeed ?? 16, {
          color: def.color,
          shape: def.projShape,
        });
        this.barrageLeft -= 1;
        this.barrageTimer = def.interval ?? 0.3;
      }
      // 종료 판정은 단일 경로 — 모든 탄 발사 완료 또는 안전 상한 도달
      if ((this.barrageLeft <= 0 && this.barrageTimer <= 0) || this.timer <= 0) {
        this.state = 'recovery';
        this.timer = def.recovery ?? 0.5;
      }
    } else if (def.type === 'chase') {
      // 락 종료 → 강타
      this.timer -= dt;
      if (this.timer <= 0) {
        this.game.cameraCtl.shake(0.15, 0.2);
        if (player.lane === this.chaseLane && !player.invulnerable) {
          this.game.damagePlayer(def.damage ?? 20);
        }
        this.state = 'recovery';
        this.timer = def.recovery ?? 0.5;
      }
    } else if (def.type === 'rush') {
      // 보스 본체 돌진 — 예고된 줄로 돌진, 레인 회피, 통과 후 복귀 + 긴 경직★
      const speed = def.rushSpeed ?? 26;
      this.posZ -= speed * dt;
      if (!this.rushHit && this.posZ <= player.z + 0.6) {
        this.rushHit = true;
        if (player.lane === this.lane) {
          this.game.damagePlayer(def.damage ?? 24);
        }
        this.game.cameraCtl.shake(0.14, 0.2);
      }
      this.timer -= dt;
      if (this.posZ < player.z - 6 || this.timer <= 0) {
        this.posZ = this.z; // 제자리 복귀
        this.lane = 1;
        this.enterStagger((def.stagger ?? 1.3) * this.getMod('staggerMult', 1));
      }
    } else {
      this.timer -= dt;
      if (this.timer <= 0) this.afterPattern();
    }
  }

  private enterStagger(duration: number): void {
    this.state = 'stagger';
    this.timer = duration;
    this.game.sound.play('bossStagger');
  }

  // ----------------------------------------------------------
  // 지속 위협 (차단 벽)
  // ----------------------------------------------------------

  private updateHazards(dt: number): void {
    const player = this.game.player;
    for (let i = this.blockWalls.length - 1; i >= 0; i--) {
      const w = this.blockWalls[i];
      w.timer -= dt;
      // 벽이 충분히 솟은 뒤, 같은 레인을 점유 중이면 1회 피해 (§9.1 A — P0: x/근접 대신 줄 점유 판정)
      const grown = w.duration - w.timer >= 0.15;
      if (!w.hitDone && grown && w.timer > 0.1 && player.lane === w.lane) {
        if (this.game.damagePlayer(w.damage)) w.hitDone = true;
      }
      if (w.timer <= 0) {
        this.blockWalls.splice(i, 1);
      }
    }
  }

  private clearHazards(): void {
    this.waveZ = null;
    this.blockWalls = [];
    this.posZ = this.z;
  }

  dispose(): void {
    this.clearHazards();
    this.game.hud.setShade(0);
  }

  /**
   * 2D 드로우 — def.visual 파츠를 단순 도형으로 근사 + 경직 시 빨간 외곽 링 (§3.1, §9.4).
   * sx/baseY는 Game.render가 worldToScreenX(this.worldX, ...)/laneY(this.currentLane)로 계산해 전달한다.
   */
  draw(ctx: CanvasRenderingContext2D, sx: number, baseY: number): void {
    if (!this.bodyVisible) return; // vanish 점멸 반영

    const ppu = CONFIG.render.ppu;
    const groundY = baseY - this.posY * ppu;
    const fade = this.dead ? Math.max(0, this.timer / 1.4) : 1;
    if (fade <= 0) return;

    ctx.save();
    if (!this.drawSpriteBody(ctx, sx, groundY, ppu, fade)) {
      this.drawShapeBody(ctx, sx, groundY, ppu, fade);
    }
    ctx.globalAlpha = fade;

    // 경직(약점) 빨간 외곽 링 (§9.4)
    if (this.staggered) {
      const pulse = 0.35 + Math.abs(Math.sin(this.bobT * 8)) * 0.35;
      ctx.strokeStyle = `rgba(255,34,34,${pulse})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx, groundY - 1.4 * ppu, 1.25 * ppu, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  /** boss_<id> 스프라이트를 visual 파츠 바운딩박스에 맞춰 그린다(좌향, 발밑 정렬). 로드 전이면 false. */
  private drawSpriteBody(
    ctx: CanvasRenderingContext2D,
    sx: number,
    groundY: number,
    ppu: number,
    fade: number,
  ): boolean {
    const name = `boss_${this.def.id}`;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of this.def.visual) {
      const cx = sx + p.pos[0] * ppu;
      const cy = groundY - p.pos[1] * ppu;
      let hw = 0;
      let hy = 0;
      switch (p.geo) {
        case 'box':
          hw = (p.size[0] * ppu) / 2;
          hy = (p.size[1] * ppu) / 2;
          break;
        case 'sphere':
        case 'ico':
          hw = p.size[0] * ppu;
          hy = p.size[0] * ppu;
          break;
        case 'capsule':
          hw = p.size[0] * ppu;
          hy = (p.size[1] * ppu) / 2 + p.size[0] * ppu;
          break;
        case 'cone':
          hw = p.size[0] * ppu;
          hy = (p.size[1] * ppu) / 2;
          break;
        case 'cylinder':
          hw = Math.max(p.size[0], p.size[1]) * ppu;
          hy = (p.size[2] * ppu) / 2;
          break;
      }
      minX = Math.min(minX, cx - hw);
      maxX = Math.max(maxX, cx + hw);
      minY = Math.min(minY, cy - hy);
      maxY = Math.max(maxY, cy + hy);
    }
    if (!Number.isFinite(minX)) return false;
    const cx = (minX + maxX) / 2;
    const isStageOneBoss = this.def.id === 'ghostTeacher' || this.def.id === 'ghostGirl';
    const h = (maxY - minY) * (isStageOneBoss ? 1.28 : 1.18);
    // 애니 아틀라스('idle') 우선 → 정적 단일 PNG. 둘 다 없으면 false(호출부가 도형 조립 폴백).
    if (drawAnim(ctx, name, 'idle', this.bobT, cx, maxY, { height: h, flip: true, alpha: fade, groundContact: true }))
      return true;
    return drawSprite(ctx, name, cx, maxY, { height: h, flip: true, alpha: fade, groundContact: true });
  }

  /** 폴백: def.visual 파츠를 단순 도형으로 근사해 그린다(스프라이트 로드 전). */
  private drawShapeBody(
    ctx: CanvasRenderingContext2D,
    sx: number,
    groundY: number,
    ppu: number,
    fade: number,
  ): void {
    for (const p of this.def.visual) {
      const cx = sx + p.pos[0] * ppu;
      const cy = groundY - p.pos[1] * ppu;
      ctx.globalAlpha = fade * (p.opacity ?? 1);
      ctx.fillStyle = hex(p.color);
      switch (p.geo) {
        case 'box': {
          const w = p.size[0] * ppu;
          const h = p.size[1] * ppu;
          ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
          break;
        }
        case 'sphere':
        case 'ico': {
          const r = p.size[0] * ppu;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'capsule': {
          const r = p.size[0] * ppu;
          const len = p.size[1] * ppu;
          roundRect(ctx, cx - r, cy - len / 2 - r, r * 2, len + r * 2, r);
          ctx.fill();
          break;
        }
        case 'cone': {
          const r = p.size[0] * ppu;
          const h = p.size[1] * ppu;
          ctx.beginPath();
          ctx.moveTo(cx, cy - h / 2);
          ctx.lineTo(cx + r, cy + h / 2);
          ctx.lineTo(cx - r, cy + h / 2);
          ctx.closePath();
          ctx.fill();
          break;
        }
        case 'cylinder': {
          const rTop = p.size[0] * ppu;
          const rBot = p.size[1] * ppu;
          const h = p.size[2] * ppu;
          const w = Math.max(rTop, rBot) * 2;
          ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
          break;
        }
      }
    }
  }

  // ----------------------------------------------------------
  // 위협 2D 시각화 — 예고(telegraph)와 지속 위협(active)을 안전 줄 판단이
  // 가능하도록 표시한다 (§9.4 예고 신호 표준(2D)). 판정 로직은 건드리지 않는다.
  // ----------------------------------------------------------

  /** 대상 레인의 트랙 밴드(가로 전체)를 반투명 색으로 채운다 — 위협 줄 표시 공통 헬퍼. */
  private drawLaneBand(ctx: CanvasRenderingContext2D, lane: number, alpha: number, color: string): void {
    const baseY = laneY(lane);
    const half = CONFIG.render.laneSpacingPx * 0.42;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(0, baseY - half, CONFIG.render.logicalWidth, half * 2);
    ctx.restore();
  }

  /** 대상 레인 하단에 얇은 경고 스트립을 그린다 — 투사체/난사 예고(바닥 마커). */
  private drawFloorMarker(ctx: CanvasRenderingContext2D, lane: number, alpha: number): void {
    const baseY = laneY(lane);
    const half = CONFIG.render.laneSpacingPx * 0.42;
    const stripH = 8;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ff3333';
    ctx.fillRect(0, baseY + half - stripH, CONFIG.render.logicalWidth, stripH);
    ctx.restore();
  }

  /** 대상 레인에 솟아오르는 벽의 그림자(예고) — 실제 위치와 무관하게 레인 전체를 어둡게 표시. */
  private drawWallShadow(ctx: CanvasRenderingContext2D, lane: number, alpha: number): void {
    const baseY = laneY(lane);
    const half = CONFIG.render.laneSpacingPx * 0.42;
    ctx.save();
    ctx.globalAlpha = alpha * 0.55;
    ctx.fillStyle = '#3a0d33';
    ctx.fillRect(0, baseY - half, CONFIG.render.logicalWidth, half * 2);
    ctx.strokeStyle = `rgba(190,60,220,${alpha})`;
    ctx.lineWidth = 3;
    ctx.strokeRect(0, baseY - half, CONFIG.render.logicalWidth, half * 2);
    ctx.restore();
  }

  /** 플레이어 화면 위치(앵커) 주변에 음파 링을 그린다 — scream 예고/지속. */
  private drawScreamRing(ctx: CanvasRenderingContext2D, lane: number, alpha: number, color: string, radius: number): void {
    const baseY = laneY(lane);
    const px = CONFIG.render.playerAnchorX * CONFIG.render.logicalWidth;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(px, baseY, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /** 추적(chase) 대상 레인에 십자선 락온 마커를 그린다. */
  private drawChaseMarker(ctx: CanvasRenderingContext2D, lane: number, alpha: number): void {
    const baseY = laneY(lane);
    const px = CONFIG.render.playerAnchorX * CONFIG.render.logicalWidth;
    const r = 16;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#ff2222';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(px, baseY, r, 0, Math.PI * 2);
    ctx.moveTo(px - r - 6, baseY);
    ctx.lineTo(px - r + 4, baseY);
    ctx.moveTo(px + r - 4, baseY);
    ctx.lineTo(px + r + 6, baseY);
    ctx.moveTo(px, baseY - r - 6);
    ctx.lineTo(px, baseY - r + 4);
    ctx.moveTo(px, baseY + r - 4);
    ctx.lineTo(px, baseY + r + 6);
    ctx.stroke();
    ctx.restore();
  }

  /** 현재 예고/발동 중인 패턴 위협을 2D로 그린다 — walls/wave/scream/투사체 예고(§9.4). */
  drawHazards(ctx: CanvasRenderingContext2D, scrollWorldX: number): void {
    if (this.dead) return;
    const def = this.patternDef(this.currentPattern);

    // 임박도: telegraph 잔여 시간이 줄어들수록 점멸이 빨라진다 (예고 신호 표준 — 임박도 표현).
    const urgencyPulse = 0.35 + Math.abs(Math.sin(this.bobT * (6 + 10 / Math.max(this.timer, 0.05)))) * 0.55;

    if (this.state === 'telegraph' && def) {
      switch (def.type) {
        case 'projectile':
        case 'barrage':
          for (const lane of this.targetLanes) this.drawFloorMarker(ctx, lane, urgencyPulse);
          break;
        case 'wave':
          for (const lane of this.targetLanes) this.drawLaneBand(ctx, lane, urgencyPulse * 0.4, hex(def.color ?? 0xff5555));
          break;
        case 'walls':
          for (const lane of this.targetLanes) this.drawWallShadow(ctx, lane, urgencyPulse);
          break;
        case 'scream':
          for (const lane of this.targetLanes) {
            this.drawScreamRing(ctx, lane, urgencyPulse, hex(def.color ?? 0xff66aa), 18 + urgencyPulse * 14);
          }
          break;
        case 'chase':
          this.drawChaseMarker(ctx, this.chaseLane, urgencyPulse);
          break;
        case 'rush':
          this.drawLaneBand(ctx, this.lane, urgencyPulse * 0.4, hex(def.color ?? 0xffaa33));
          break;
        default:
          break;
      }
    }

    if (this.state === 'active' && def) {
      if (def.type === 'wave' && this.waveZ !== null) {
        const sx = worldToScreenX(this.waveZ, scrollWorldX);
        const colorN = def.color ?? 0xff5555;
        const half = CONFIG.render.laneSpacingPx * 0.42;
        for (const lane of this.targetLanes) {
          const baseY = laneY(lane);
          // fx_wave 파동 이미지(색 틴트) — 로드 전이면 색 밴드 폴백.
          if (drawTinted(ctx, 'fx_wave', colorN, sx, baseY, { height: half * 2.4, pivot: 'center', alpha: 0.9 })) {
            continue;
          }
          ctx.save();
          ctx.globalAlpha = 0.75;
          ctx.fillStyle = hex(colorN);
          ctx.fillRect(sx - 17, baseY - half, 34, half * 2);
          ctx.restore();
        }
      } else if (def.type === 'scream') {
        const colorN = def.color ?? 0xff66aa;
        const px = CONFIG.render.playerAnchorX * CONFIG.render.logicalWidth;
        for (const lane of this.targetLanes) {
          const baseY = laneY(lane);
          const radius = 30 + Math.abs(Math.sin(this.bobT * 6)) * 22;
          // fx_scream 음파 링(색 틴트) — 로드 전이면 링 도형 폴백.
          if (drawTinted(ctx, 'fx_scream', colorN, px, baseY, { height: radius * 2, pivot: 'center', alpha: 0.8 })) {
            continue;
          }
          this.drawScreamRing(ctx, lane, 0.6, hex(colorN), radius);
        }
      } else if (def.type === 'chase') {
        this.drawChaseMarker(ctx, this.chaseLane, 0.85 + Math.abs(Math.sin(this.bobT * 12)) * 0.15);
      } else if (def.type === 'rush') {
        this.drawLaneBand(ctx, this.lane, 0.22, hex(def.color ?? 0xffaa33));
      }
    }

    // 지속 위협(차단 벽)은 패턴 상태(recovery 등)와 무관하게 살아있는 동안 항상 표시한다.
    for (const w of this.blockWalls) {
      const elapsed = w.duration - w.timer;
      const grownFrac = Math.max(0, Math.min(1, elapsed / 0.15));
      const baseY = laneY(w.lane);
      const half = CONFIG.render.laneSpacingPx * 0.42;
      const maxH = half * 1.8 * grownFrac;
      const anchorX = CONFIG.render.playerAnchorX * CONFIG.render.logicalWidth + CONFIG.render.laneSpacingPx * 2.4;
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.35 * grownFrac;
      ctx.fillStyle = '#9955ff';
      ctx.fillRect(anchorX - 14, baseY + half - maxH, 28, maxH);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(anchorX - 14, baseY + half - maxH, 28, maxH);
      ctx.restore();
    }
  }
}
