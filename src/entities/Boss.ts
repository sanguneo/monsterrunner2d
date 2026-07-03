// ============================================================
// 보스 — 패턴 큐 기반 범용 AI 엔진 (§9)
// 예고(telegraph) → 발동(active) → 후딜(recovery)/경직(stagger) 사이클.
// 모든 보스는 data/worlds.ts의 BossDef(패턴/페이즈/외형)로 구동된다.
// 패턴 타입: projectile / wave / walls / summon / teleport / scream
// 큐 항목 'a+b'는 연계(첫 패턴 종료 즉시 다음 발동).
// ============================================================

import * as THREE from 'three';
import { CONFIG, laneX } from '../data/config';
import type { BossPhaseConfig } from '../data/config';
import type { BossDef, BossPartDef, PatternDef } from '../data/worlds';
import type { Game } from '../core/Game';
import { pickThreatLanes } from '../core/rules';

type BossState =
  'intro' | 'gap' | 'telegraph' | 'active' | 'recovery' | 'stagger' | 'vanish' | 'reappear' | 'phasechange' | 'dead';

interface BlockWall {
  mesh: THREE.Mesh;
  lane: number;
  timer: number;
  duration: number;
  damage: number;
  hitDone: boolean; // 벽당 1회 피해 (BLOCK 장애물과 동일 — 무한 드레인 방지)
}

const markerGeo = new THREE.PlaneGeometry(1.8, 10);
const wallGeo = new THREE.BoxGeometry(1.8, 3.2, 1.0);
const waveGeo = new THREE.BoxGeometry(CONFIG.lanes.spacing * 3 + 1.5, 0.5, 0.8);
const burstGeo = new THREE.RingGeometry(0.3, 0.55, 22);

const wallMatCache = new Map<number, THREE.MeshStandardMaterial>();
function wallMaterial(color: number): THREE.MeshStandardMaterial {
  let m = wallMatCache.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, emissive: 0x1a1a22 });
    wallMatCache.set(color, m);
  }
  return m;
}

/** 메시의 GPU 리소스 해제. sharedGeo=true면 지오메트리는 공유본이므로 건드리지 않는다. */
function disposeMesh(mesh: THREE.Mesh, sharedGeo = false): void {
  if (!sharedGeo) mesh.geometry.dispose();
  const mat = mesh.material;
  if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
  else mat.dispose();
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

  // 패턴 런타임
  private wave: THREE.Mesh | null = null;
  private waveCrossed = false;
  private blockWalls: BlockWall[] = [];
  private screamSlid = false;
  private summonRing: THREE.Mesh | null = null;
  // barrage(연속 탄막)
  private barrageLeft = 0;
  private barrageTimer = 0;
  private barrageLanes: number[] = [];
  // chase(추적 강타)
  private chaseLane = 1;
  // rush(돌진)
  private rushHit = false;
  private fx: { mesh: THREE.Mesh; life: number }[] = [];

  // view
  readonly group: THREE.Group;
  private bodyGroup: THREE.Group;
  private outline: THREE.Mesh;
  private markers: THREE.Mesh[] = [];
  private markerMat: THREE.MeshBasicMaterial;

  readonly z: number;

  constructor(
    def: BossDef,
    private game: Game,
    z: number,
  ) {
    this.def = def;
    this.z = z;
    this.hp = def.hp;
    this.maxHp = def.hp;

    this.group = new THREE.Group();
    this.bodyGroup = this.buildBody(def.visual);
    this.group.add(this.bodyGroup);

    // 경직(약점) 빨강 윤곽 발광 (§9.4)
    const outGeo = new THREE.CapsuleGeometry(1.0, 1.4, 6, 12);
    const outMat = new THREE.MeshBasicMaterial({
      color: 0xff2222,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.5,
    });
    this.outline = new THREE.Mesh(outGeo, outMat);
    this.outline.scale.setScalar(1.25);
    this.outline.position.y = 1.4;
    this.outline.visible = false;
    this.group.add(this.outline);

    this.group.position.set(0, 3.5, z);

    this.markerMat = new THREE.MeshBasicMaterial({
      color: 0xff3333,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(markerGeo, this.markerMat);
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      this.markers.push(m);
      game.scene.add(m);
    }
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

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  private getMod(name: string, fallback: number): number {
    return this.phase.mods?.[name] ?? fallback;
  }

  private patternDef(id: string): PatternDef | null {
    return this.def.patterns[id] ?? null;
  }

  private buildBody(parts: BossPartDef[]): THREE.Group {
    const g = new THREE.Group();
    for (const p of parts) {
      let geo: THREE.BufferGeometry;
      switch (p.geo) {
        case 'box':
          geo = new THREE.BoxGeometry(p.size[0], p.size[1], p.size[2]);
          break;
        case 'sphere':
          geo = new THREE.SphereGeometry(p.size[0], 14, 12);
          break;
        case 'capsule':
          geo = new THREE.CapsuleGeometry(p.size[0], p.size[1], 6, 12);
          break;
        case 'cone':
          geo = new THREE.ConeGeometry(p.size[0], p.size[1], 10);
          break;
        case 'cylinder':
          geo = new THREE.CylinderGeometry(p.size[0], p.size[1], p.size[2], 12);
          break;
        case 'ico':
          geo = new THREE.IcosahedronGeometry(p.size[0], 0);
          break;
      }
      const mat = new THREE.MeshStandardMaterial({
        color: p.color,
        emissive: p.emissive ?? 0x111111,
        transparent: p.opacity !== undefined,
        opacity: p.opacity ?? 1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...p.pos);
      if (p.scale) mesh.scale.set(...p.scale);
      g.add(mesh);
    }
    return g;
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
      this.clearMarkers();
      this.clearSummonRing();
      // 진행 중이던 위험요소 정리 — 파동/차단벽이 화면에 고아로 남는 것 방지
      // (패턴 큐 리셋과 함께 위험도 리셋, 돌진 중이었다면 제자리 복귀 포함)
      this.clearHazards();
      this.bodyGroup.visible = true; // vanish 중 전환 대비
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
    this.clearMarkers();
    this.clearSummonRing();
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

    const targetX = laneX(this.lane);
    this.group.position.x += (targetX - this.group.position.x) * Math.min(1, dt * 8);
    if (this.state !== 'intro' && this.state !== 'dead') {
      this.group.position.y += (Math.sin(this.bobT * 2) * 0.15 + 0.2 - this.group.position.y) * dt * 3;
    }

    this.updateHazards(dt);
    this.updateOutline();

    switch (this.state) {
      case 'intro':
        this.group.position.y = Math.max(0.2, this.group.position.y - dt * 2.2);
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
        this.pulseMarkers();
        const tDef = this.patternDef(this.currentPattern);
        if (tDef?.type === 'scream') {
          this.game.hud.setShade(0.25);
          if (Math.random() < dt * 8) this.game.cameraCtl.shake(0.06, 0.1);
        }
        // chase: 예고 동안 마커가 플레이어 레인을 따라온다
        if (tDef?.type === 'chase' && this.markers[0].visible) {
          const targetX = laneX(this.game.player.lane);
          this.markers[0].position.x += (targetX - this.markers[0].position.x) * Math.min(1, dt * 6);
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
        this.bodyGroup.visible = Math.floor(this.bobT * 20) % 2 === 0;
        this.timer -= dt;
        if (this.timer <= 0) {
          // 좌/중/우 새 위치 이동 (§9.2 T)
          const lanes = [0, 1, 2].filter((l) => l !== this.lane);
          this.lane = lanes[Math.floor(Math.random() * lanes.length)];
          this.group.position.x = laneX(this.lane);
          this.state = 'reappear';
          this.timer = this.patternDef(this.currentPattern)?.reappear ?? 0.4;
        }
        break;

      case 'reappear':
        this.bodyGroup.visible = true;
        this.timer -= dt;
        if (this.timer <= 0) this.afterPattern(); // 연계가 있으면 즉시 다음 패턴

        break;

      case 'dead':
        this.timer -= dt;
        this.group.position.y -= dt * 0.8;
        this.bodyGroup.traverse((o) => {
          const mesh = o as THREE.Mesh;
          const mat = mesh.material as THREE.MeshStandardMaterial | undefined;
          if (mat && 'opacity' in mat) {
            mat.transparent = true;
            mat.opacity = Math.max(0, mat.opacity - dt * 0.8);
          }
        });
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
        this.showMarkers(this.targetLanes, def.color ?? 0xff3333);
        this.state = 'telegraph';
        this.timer = (def.telegraph ?? 0.6) * teleMult;
        break;

      case 'barrage':
        // 연속 탄막: 전 레인 순차 위협 — 예고는 전 레인 약하게
        this.targetLanes = [0, 1, 2];
        this.showMarkers(this.targetLanes, def.color ?? 0xff3333);
        this.state = 'telegraph';
        this.timer = (def.telegraph ?? 0.7) * teleMult;
        break;

      case 'wave':
        this.targetLanes = [0, 1, 2];
        this.showMarkers(this.targetLanes, def.color ?? 0xffb020);
        this.state = 'telegraph';
        this.timer = (def.telegraph ?? 0.8) * teleMult;
        break;

      case 'walls':
        this.targetLanes = this.pickLanes(player.lane, def.lanes ?? 1);
        this.showMarkers(this.targetLanes, def.color ?? 0x3b1052); // 그림자 짙어짐
        this.state = 'telegraph';
        this.timer = (def.telegraph ?? 0.7) * teleMult;
        break;

      case 'chase':
        // 추적 강타: 마커가 플레이어를 따라옴 (telegraph 동안)
        this.chaseLane = player.lane;
        this.showMarkers([player.lane], def.color ?? 0xfde047);
        this.state = 'telegraph';
        this.timer = (def.telegraph ?? 1.2) * teleMult;
        break;

      case 'rush':
        // 돌진: 보스가 플레이어 레인으로 이동 후 예고
        this.lane = player.lane;
        this.showMarkers([player.lane], def.color ?? 0xff5533);
        this.state = 'telegraph';
        this.timer = (def.telegraph ?? 0.85) * teleMult;
        break;

      case 'summon': {
        this.state = 'telegraph';
        this.timer = (def.telegraph ?? 1.0) * teleMult;
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.3, 0.5, 24),
          new THREE.MeshBasicMaterial({ color: 0x9d4edd, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(this.group.position.x, 0.05, this.z - 3);
        this.game.scene.add(ring);
        this.summonRing = ring;
        break;
      }

      case 'scream':
        this.state = 'telegraph';
        this.timer = (def.telegraph ?? 1.0) * teleMult;
        this.screamSlid = false;
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
    this.clearMarkers();

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

      case 'wave': {
        const mat = new THREE.MeshBasicMaterial({
          color: def.color ?? 0xffe28a,
          transparent: true,
          opacity: 0.85,
        });
        this.wave = new THREE.Mesh(waveGeo, mat);
        this.wave.position.set(0, 0.25, this.z - 1);
        this.game.scene.add(this.wave);
        this.waveCrossed = false;
        this.state = 'active';
        this.timer = 3.0;
        this.game.cameraCtl.shake(0.12, 0.25);
        break;
      }

      case 'chase':
        // 락: 마커 위치 고정, 잠깐의 마지막 회피 기회
        this.chaseLane = player.lane;
        this.markers[0].position.x = laneX(this.chaseLane);
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
        this.clearSummonRing();
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
          const mesh = new THREE.Mesh(wallGeo, wallMaterial(def.color ?? 0x1c1022));
          mesh.position.set(laneX(lane), 1.6, player.z + 0.5);
          this.game.scene.add(mesh);
          this.blockWalls.push({
            mesh,
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
      if (this.wave) {
        this.wave.position.z -= (def.waveSpeed ?? 14) * dt;
        // 통과 시점 판정: 점프 중이면 회피 (§9.1 B)
        if (!this.waveCrossed && this.wave.position.z <= player.z + 0.4) {
          this.waveCrossed = true;
          if (player.y < 0.35) {
            this.game.damagePlayer(def.damage ?? 18);
          }
        }
        if (this.wave.position.z < player.z - 6) {
          this.game.scene.remove(this.wave);
          disposeMesh(this.wave, true);
          this.wave = null;
          // 파동 후 경직 ★ — 주 딜 타이밍
          this.enterStagger((def.stagger ?? 1.2) * this.getMod('staggerMult', 1));
          return;
        }
      }
      this.timer -= dt;
      if (this.timer <= 0) {
        if (this.wave) {
          this.game.scene.remove(this.wave);
          disposeMesh(this.wave, true);
          this.wave = null;
        }
        this.enterStagger((def.stagger ?? 1.2) * this.getMod('staggerMult', 1));
      }
    } else if (def.type === 'scream') {
      if (player.sliding) this.screamSlid = true; // 슬라이드 회피 (§9.2 S)
      this.timer -= dt;
      if (this.timer <= 0) {
        if (!this.screamSlid) {
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
        this.showMarkers([lane], def.color ?? 0xff3333); // 다음 위협 레인 강조
        this.barrageLeft -= 1;
        this.barrageTimer = def.interval ?? 0.3;
      }
      // 종료 판정은 단일 경로 — 모든 탄 발사 완료 또는 안전 상한 도달
      if ((this.barrageLeft <= 0 && this.barrageTimer <= 0) || this.timer <= 0) {
        this.clearMarkers();
        this.state = 'recovery';
        this.timer = def.recovery ?? 0.5;
      }
    } else if (def.type === 'chase') {
      // 락 종료 → 강타
      this.pulseMarkers();
      this.timer -= dt;
      if (this.timer <= 0) {
        this.clearMarkers();
        this.spawnBurst(laneX(this.chaseLane), player.z + 0.5, def.color ?? 0xfde047);
        this.game.cameraCtl.shake(0.15, 0.2);
        if (player.lane === this.chaseLane && !player.invulnerable) {
          this.game.damagePlayer(def.damage ?? 20);
        }
        this.state = 'recovery';
        this.timer = def.recovery ?? 0.5;
      }
    } else if (def.type === 'rush') {
      // 보스 본체 돌진 — 레인 회피, 통과 후 복귀 + 긴 경직★
      const speed = def.rushSpeed ?? 26;
      this.group.position.z -= speed * dt;
      if (!this.rushHit && this.group.position.z <= player.z + 0.6) {
        this.rushHit = true;
        if (Math.abs(player.x - laneX(this.lane)) < 0.95) {
          this.game.damagePlayer(def.damage ?? 24);
        }
        this.game.cameraCtl.shake(0.14, 0.2);
      }
      this.timer -= dt;
      if (this.group.position.z < player.z - 6 || this.timer <= 0) {
        this.group.position.z = this.z; // 제자리 복귀
        this.lane = 1;
        this.clearMarkers();
        this.enterStagger((def.stagger ?? 1.3) * this.getMod('staggerMult', 1));
      }
    } else {
      this.timer -= dt;
      if (this.timer <= 0) this.afterPattern();
    }
  }

  /** 강타 지점 폭발 링 이펙트 */
  private spawnBurst(x: number, z: number, color: number): void {
    const mesh = new THREE.Mesh(
      burstGeo,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.06, z);
    this.game.scene.add(mesh);
    this.fx.push({ mesh, life: 0.4 });
  }

  private enterStagger(duration: number): void {
    this.state = 'stagger';
    this.timer = duration;
    this.game.sound.play('bossStagger');
  }

  // ----------------------------------------------------------
  // 지속 위협 (차단 벽) / 시각 효과
  // ----------------------------------------------------------

  private updateHazards(dt: number): void {
    const player = this.game.player;
    for (let i = this.blockWalls.length - 1; i >= 0; i--) {
      const w = this.blockWalls[i];
      w.timer -= dt;
      const grow = Math.min(1, (w.duration - w.timer) * 6);
      const shrink = Math.min(1, w.timer * 4);
      w.mesh.scale.y = Math.max(0.05, Math.min(grow, shrink));
      // 벽이 충분히 솟은 뒤, 같은 레인에 있으면 1회 피해 (z 고정 보스전 — 레인 점유 기반)
      const grown = w.duration - w.timer >= 0.15;
      if (!w.hitDone && grown && w.timer > 0.1 && Math.abs(player.x - laneX(w.lane)) < 0.85) {
        if (this.game.damagePlayer(w.damage)) w.hitDone = true;
      }
      if (w.timer <= 0) {
        this.game.scene.remove(w.mesh);
        this.blockWalls.splice(i, 1);
      }
    }

    if (this.summonRing) {
      this.summonRing.scale.addScalar(dt * 3);
      (this.summonRing.material as THREE.MeshBasicMaterial).opacity = Math.max(
        0.2,
        0.8 - this.summonRing.scale.x * 0.15,
      );
    }

    // 강타 폭발 링
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.life -= dt;
      f.mesh.scale.addScalar(dt * 14);
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, f.life / 0.4);
      if (f.life <= 0) {
        this.game.scene.remove(f.mesh);
        disposeMesh(f.mesh, true); // burstGeo 공유, 머티리얼만 해제
        this.fx.splice(i, 1);
      }
    }
  }

  private updateOutline(): void {
    if (this.staggered) {
      this.outline.visible = true;
      const pulse = 0.35 + Math.abs(Math.sin(this.bobT * 8)) * 0.35;
      (this.outline.material as THREE.MeshBasicMaterial).opacity = pulse;
      this.outline.scale.setScalar(1.25 + Math.sin(this.bobT * 8) * 0.05);
    } else {
      this.outline.visible = false;
    }
  }

  private showMarkers(lanes: number[], color: number): void {
    const player = this.game.player;
    this.markerMat.color.setHex(color);
    this.markers.forEach((m, i) => {
      if (i < lanes.length) {
        m.visible = true;
        m.position.set(laneX(lanes[i]), 0.03, player.z + 3.5);
      } else {
        m.visible = false;
      }
    });
  }

  private pulseMarkers(): void {
    this.markerMat.opacity = 0.25 + Math.abs(Math.sin(this.bobT * 10)) * 0.35;
  }

  private clearMarkers(): void {
    this.markers.forEach((m) => (m.visible = false));
  }

  private clearSummonRing(): void {
    if (this.summonRing) {
      this.game.scene.remove(this.summonRing);
      disposeMesh(this.summonRing); // 소환진: 매번 새 지오/머티리얼 → 해제
      this.summonRing = null;
    }
  }

  private clearHazards(): void {
    if (this.wave) {
      this.game.scene.remove(this.wave);
      disposeMesh(this.wave, true); // waveGeo는 공유, 머티리얼만 해제
      this.wave = null;
    }
    // blockWalls: 공유 wallGeo + 캐시 머티리얼 → scene 제거만
    this.blockWalls.forEach((w) => this.game.scene.remove(w.mesh));
    this.blockWalls = [];
    this.fx.forEach((f) => {
      this.game.scene.remove(f.mesh);
      disposeMesh(f.mesh, true); // burstGeo 공유, 머티리얼만 해제
    });
    this.fx = [];
    this.group.position.z = this.z;
  }

  dispose(): void {
    this.clearMarkers();
    this.clearSummonRing();
    this.clearHazards();
    this.markers.forEach((m) => this.game.scene.remove(m)); // markerGeo/Mat 공유 → 제거만
    this.markerMat.dispose(); // 인스턴스 전용 머티리얼
    // 본체·아웃라인은 인스턴스마다 새로 생성 → 지오/머티리얼 해제
    this.bodyGroup.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) disposeMesh(o as THREE.Mesh);
    });
    disposeMesh(this.outline);
    this.game.scene.remove(this.group);
    this.game.hud.setShade(0);
  }
}
