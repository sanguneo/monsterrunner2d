// ============================================================
// Game — 상태머신 + 고정 타임스텝 게임루프 (§15)
// TITLE → (TUTORIAL) → RUNNING_1 → MIDBOSS → RUNNING_2 →
// FINALBOSS → REWARD → RESULT / GAMEOVER(체크포인트 부활)
// ============================================================

import * as THREE from 'three';
import { CONFIG, laneX } from '../data/config';
import { t } from '../data/i18n';
import { Input } from './Input';
import { CameraController } from './Camera';
import { Tutorial } from './Tutorial';
import { Environment } from './Environment';
import { computeScore, skillUnlocked, newlyUnlockedSkillKey } from './rules';
import { Player } from '../entities/Player';
import { Monster } from '../entities/Monster';
import { Boss } from '../entities/Boss';
import { WORLDS, REWARD_ITEMS } from '../data/worlds';
import type { WorldDef, MonsterDef } from '../data/worlds';
import { Obstacle, applyObstacleTheme } from '../entities/Obstacle';
import type { ObstacleType } from '../entities/Obstacle';
import { Pickup } from '../entities/Pickup';
import type { PickupType } from '../entities/Pickup';
import { Projectile } from '../entities/Projectile';
import { Spawner } from '../systems/Spawner';
import { Combat } from '../systems/Combat';
import type { SkillId } from '../systems/Combat';
import { Progression } from '../systems/Progression';
import { Inventory } from '../systems/Inventory';
import { Cosmetics } from '../systems/Cosmetics';
import { SoundManager } from '../systems/Sound';
import type { SoundId } from '../systems/Sound';
import { HUD } from '../ui/HUD';
import { Screens } from '../ui/Screens';
import { uiIcon } from '../ui/icons';

export type GameStateName =
  'TITLE' | 'TUTORIAL' | 'RUNNING_1' | 'MIDBOSS' | 'RUNNING_2' | 'FINALBOSS' | 'REWARD' | 'RESULT' | 'GAMEOVER';

interface Checkpoint {
  state: 'MIDBOSS' | 'FINALBOSS';
  player: {
    hp: number;
    maxHp: number;
    attack: number;
    critChance: number;
    level: number;
    exp: number;
    expToNext: number;
    z: number;
  };
  inventory: ReturnType<Inventory['snapshot']>;
  stats: { kills: number; bossKills: number };
  distance: number;
  runElapsed: number;
}

// ------------------------------------------------------------

export class Game {
  readonly scene: THREE.Scene;
  readonly renderer: THREE.WebGLRenderer;
  readonly cameraCtl: CameraController;
  readonly input: Input;
  readonly sound: SoundManager;
  readonly hud: HUD;
  readonly screens: Screens;

  readonly player: Player;
  readonly combat: Combat;
  readonly spawner: Spawner;
  readonly progression: Progression;
  readonly inventory: Inventory;
  readonly cosmetics: Cosmetics;

  monsters: Monster[] = [];
  obstacles: Obstacle[] = [];
  pickups: Pickup[] = [];
  projectiles: Projectile[] = [];
  boss: Boss | null = null;

  state: GameStateName = 'TITLE';
  paused = false;
  distance = 0;
  runSpeed = 0;
  autoSkill = CONFIG.accessibility.autoSkill;
  stats = { kills: 0, bossKills: 0 };
  /** 현재 선택/플레이 중인 월드 (0~5) */
  worldIdx = 0;

  private runElapsed = 0;
  private segmentStart = 0;
  private segmentLength = CONFIG.world.segment1Length;
  private tutorial: Tutorial | null = null;
  private checkpoint: Checkpoint | null = null;
  /** 스테이지 인트로(월드 이미지) 표시 중 — 0이면 비활성 */
  private stageIntroTimer = 0;
  private env: Environment;
  private lastTime = 0;
  private accumulator = 0;
  private readonly STEP = 1 / 60;
  private finalScore = 0;
  private isNewRecord = false;
  private currentBgm: SoundId | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.scene = new THREE.Scene();
    this.setMood('normal');

    const hemi = new THREE.HemisphereLight(0xbcaaff, 0x2a1f3d, 1.1);
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(3, 8, -4);
    this.scene.add(hemi, dir);

    this.env = new Environment(this.scene);
    this.cameraCtl = new CameraController(window.innerWidth / window.innerHeight);

    this.player = new Player();
    this.scene.add(this.player.group);

    this.sound = new SoundManager();
    this.player.sfx = (id) => this.sound.play(id); // 점프/슬라이드/레인이동 효과음 배선
    this.inventory = new Inventory();
    this.cosmetics = new Cosmetics();
    this.progression = new Progression(this);
    this.combat = new Combat(this);
    this.spawner = new Spawner(this);

    this.input = new Input(canvas);
    this.input.onAction = (a) => {
      if (a === 'pause') this.togglePause();
    };

    this.hud = new HUD(this);
    this.screens = new Screens(this);

    window.addEventListener('resize', () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.cameraCtl.resize(window.innerWidth / window.innerHeight);
    });

    // 백그라운드 전환 시 자동 일시정지 — rAF 스로틀로 인한 슬로모션 진행 방지
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.isPlayState && !this.paused) this.togglePause();
    });

    this.setState('TITLE');
  }

  start(): void {
    this.lastTime = performance.now();
    const loop = (now: number) => {
      const frameDt = Math.min((now - this.lastTime) / 1000, 0.1);
      this.lastTime = now;
      // 고정 타임스텝 업데이트 (§3.1)
      if (!this.paused) {
        this.accumulator += frameDt;
        while (this.accumulator >= this.STEP) {
          this.update(this.STEP);
          this.accumulator -= this.STEP;
        }
      }
      this.cameraCtl.update(frameDt, this.player.position, this.boss?.position ?? null);
      this.renderer.render(this.scene, this.cameraCtl.camera);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // ----------------------------------------------------------
  // 파생 상태
  // ----------------------------------------------------------

  get world(): WorldDef {
    return WORLDS[this.worldIdx];
  }

  /** 해금된 최대 월드 인덱스 (LocalStorage) */
  unlockedWorldIdx(): number {
    const v = localStorage.getItem(CONFIG.storage.worldUnlockKey);
    const n = v ? parseInt(v, 10) || 0 : 0;
    return Math.min(n, WORLDS.length - 1);
  }

  private unlockWorld(idx: number): void {
    if (idx > this.unlockedWorldIdx() && idx < WORLDS.length) {
      localStorage.setItem(CONFIG.storage.worldUnlockKey, `${idx}`);
    }
  }

  /** 획득 장비 영속 저장 / 복원 — 새 판에서도 외형 유지 */
  private persistItem(itemId: string): void {
    const items = this.loadPersistedItems();
    if (!items.includes(itemId)) {
      items.push(itemId);
      localStorage.setItem(CONFIG.storage.itemsKey, JSON.stringify(items));
    }
  }

  private loadPersistedItems(): string[] {
    try {
      const v = localStorage.getItem(CONFIG.storage.itemsKey);
      return v ? (JSON.parse(v) as string[]) : [];
    } catch {
      return [];
    }
  }

  private restorePersistedItems(): void {
    for (const id of this.loadPersistedItems()) {
      const item = REWARD_ITEMS[id];
      if (item) this.inventory.grantItem(id, item.slot);
    }
  }

  selectWorld(idx: number): void {
    if (idx <= this.unlockedWorldIdx()) {
      this.worldIdx = idx;
      this.applyWorldTheme();
      this.screens.preloadWorld(idx); // 선택 월드 인트로/보상 이미지 지연 로드
      this.screens.showTitle();
    }
  }

  private applyWorldTheme(): void {
    this.env.setTheme(this.world.theme);
    applyObstacleTheme(this.world.theme);
    this.setMood('normal');
  }

  get inTutorial(): boolean {
    return this.state === 'TUTORIAL';
  }

  get isRunningState(): boolean {
    return this.state === 'RUNNING_1' || this.state === 'RUNNING_2';
  }

  get isBossState(): boolean {
    return this.state === 'MIDBOSS' || this.state === 'FINALBOSS';
  }

  private get isPlayState(): boolean {
    return this.inTutorial || this.isRunningState || this.isBossState;
  }

  /** 스킬 사용 가능 여부 — 튜토리얼은 스킬 단계부터 */
  get skillsEnabled(): boolean {
    return this.isRunningState || this.isBossState || this.inTutorial;
  }

  segmentProgress(): number {
    if (this.segmentLength <= 0) return 0;
    return Math.min(1, Math.max(0, (this.distance - this.segmentStart) / this.segmentLength));
  }

  score(): number {
    return computeScore(
      {
        distance: this.distance,
        coins: this.inventory.coins,
        gems: this.inventory.gems,
        kills: this.stats.kills,
        bossKills: this.stats.bossKills,
      },
      CONFIG.score,
    );
  }

  private highScoreKey(idx: number): string {
    return `${CONFIG.storage.highScorePrefix}${WORLDS[idx].id}`;
  }

  /** 구버전 글로벌 최고점수를 1월드(school) 기록으로 1회 이관 후 구 키 제거 */
  private migrateLegacyHighScore(): void {
    const legacy = localStorage.getItem(CONFIG.storage.legacyHighScoreKey);
    if (legacy === null) return;
    if (localStorage.getItem(this.highScoreKey(0)) === null) {
      localStorage.setItem(this.highScoreKey(0), legacy);
    }
    localStorage.removeItem(CONFIG.storage.legacyHighScoreKey);
  }

  loadHighScore(worldIdx: number = this.worldIdx): number {
    this.migrateLegacyHighScore();
    const v = localStorage.getItem(this.highScoreKey(worldIdx));
    return v ? parseInt(v, 10) || 0 : 0;
  }

  private saveHighScore(): void {
    this.finalScore = this.score();
    const high = this.loadHighScore();
    this.isNewRecord = this.finalScore > high;
    if (this.isNewRecord) {
      localStorage.setItem(this.highScoreKey(this.worldIdx), `${this.finalScore}`);
    }
  }

  /** 스킬 해금 여부 — unlocks에 없는 스킬(blast/dash)은 항상 사용 가능 */
  skillUnlocked(id: SkillId): boolean {
    return skillUnlocked(CONFIG.skills.unlocks, id, this.unlockedWorldIdx());
  }

  // ----------------------------------------------------------
  // 메인 업데이트 (상태별 책임 — §15.4)
  // ----------------------------------------------------------

  private update(dt: number): void {
    switch (this.state) {
      case 'TITLE':
        this.env.update(this.player.z);
        this.player.update(dt, this.input, false);
        break;

      case 'TUTORIAL': {
        this.runSpeed = CONFIG.world.tutorialSpeed;
        this.player.z += this.runSpeed * dt; // 거리 미집계 (안전 학습 구간)
        this.player.update(dt, this.input, true);
        this.tutorial?.update(dt);
        this.combat.update(dt);
        this.updateEntities(dt);
        this.env.update(this.player.z);
        if (this.tutorial?.finished) this.finishTutorial();
        break;
      }

      case 'RUNNING_1':
      case 'RUNNING_2': {
        // 스테이지 인트로 동안 출발 대기 (월드 이미지 표시)
        if (this.stageIntroTimer > 0) {
          this.stageIntroTimer -= dt;
          this.player.update(dt, this.input, false);
          this.env.update(this.player.z);
          if (this.stageIntroTimer <= 0) this.dismissStageIntro();
          break;
        }
        this.runElapsed += dt;
        const base = Math.min(CONFIG.run.speedStart + CONFIG.run.accel * this.runElapsed, CONFIG.run.speedMax);
        const dashMult = this.player.dashTimer > 0 ? 1 + CONFIG.skills.slot2.speedBonus : 1;
        this.runSpeed = base * this.player.speedMult * dashMult;
        this.player.z += this.runSpeed * dt;
        this.distance += this.runSpeed * dt;

        this.player.update(dt, this.input, true);
        this.spawner.update(dt);
        this.combat.update(dt);
        this.updateEntities(dt);
        this.env.update(this.player.z);

        // 구간 목표 도달 → 보스 진입 (§15.2)
        if (this.distance - this.segmentStart >= this.segmentLength) {
          this.setState(this.state === 'RUNNING_1' ? 'MIDBOSS' : 'FINALBOSS');
        }
        break;
      }

      case 'MIDBOSS':
      case 'FINALBOSS': {
        this.runSpeed = 0; // 전진 정지 (§9)
        this.player.update(dt, this.input, true);
        this.boss?.update(dt);
        this.combat.update(dt);
        this.updateEntities(dt);
        break;
      }

      case 'REWARD':
      case 'RESULT':
      case 'GAMEOVER':
        this.player.update(dt, this.input, false);
        break;
    }

    if (this.isPlayState) this.hud.update(dt);
  }

  private updateEntities(dt: number): void {
    const pz = this.player.z;
    const behind = pz - CONFIG.world.despawnBehind;

    for (let i = this.monsters.length - 1; i >= 0; i--) {
      const m = this.monsters[i];
      if (m.alive) m.update(dt, pz);
      if (!m.alive || m.z < behind) {
        this.scene.remove(m.mesh);
        this.monsters.splice(i, 1);
      }
    }
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i];
      if (!o.alive || o.z < behind) {
        this.scene.remove(o.mesh);
        this.obstacles.splice(i, 1);
      }
    }
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      if (pk.alive) pk.update(dt);
      if (!pk.alive || pk.z < behind) {
        this.scene.remove(pk.mesh);
        this.pickups.splice(i, 1);
      }
    }
  }

  // ----------------------------------------------------------
  // 상태 전환 (§15.2)
  // ----------------------------------------------------------

  setState(next: GameStateName): void {
    this.state = next;
    this.input.clear(); // 전환 시 입력 버퍼 초기화 (§15.4)

    switch (next) {
      case 'TITLE':
        this.resetRun();
        this.hud.hide();
        this.screens.showTitle();
        this.cameraCtl.mode = 'title';
        this.setBgm(null);
        break;

      case 'TUTORIAL':
        this.screens.hide();
        this.hud.show();
        this.cameraCtl.mode = 'follow';
        this.tutorial = new Tutorial(this);
        this.tutorial.start();
        this.setBgm('bgmRun');
        break;

      case 'RUNNING_1':
        this.clearEntities();
        this.disposeBoss();
        this.screens.hide();
        this.hud.show();
        this.hud.hideBossBar();
        this.cameraCtl.mode = 'follow';
        this.segmentStart = this.distance;
        this.segmentLength = CONFIG.world.segment1Length;
        this.spawner.reset();
        // 스테이지 표시 이미지 먼저 노출 후 출발
        this.stageIntroTimer = CONFIG.world.stageIntroDuration;
        this.screens.showStageIntro(this.worldIdx);
        this.setBgm('bgmRun');
        break;

      case 'RUNNING_2':
        this.clearEntities();
        this.disposeBoss();
        this.hud.hideBossBar();
        this.cameraCtl.mode = 'follow';
        this.segmentStart = this.distance;
        this.segmentLength = CONFIG.world.segment2Length;
        this.spawner.reset();
        this.setBgm('bgmRun');
        this.sound.play('checkpoint');
        break;

      case 'MIDBOSS':
      case 'FINALBOSS': {
        this.saveCheckpoint(next);
        this.clearEntities();
        this.disposeBoss();
        const def = next === 'MIDBOSS' ? this.world.midBoss : this.world.finalBoss;
        this.boss = new Boss(def, this, this.player.z + CONFIG.world.arenaBossDistance);
        this.scene.add(this.boss.group);
        this.hud.showBossBar(
          def.nameKey,
          def.phases.map((p) => p.from),
        );
        this.hud.showBanner(`${t('boss.incoming')} ${t(def.nameKey)}`);
        this.cameraCtl.mode = 'boss';
        this.sound.play('bossIntro');
        this.setBgm('bgmBoss');
        break;
      }

      case 'REWARD': {
        this.disposeBoss();
        this.hud.hide(); // 보상 연출 뒤 HUD(체력·스킬·일시정지) 숨김
        // 월드 클리어 보상 장비 지급 → 외형 변화 (§12, §15.2)
        const item = REWARD_ITEMS[this.world.reward];
        this.inventory.grantItem(this.world.reward, item.slot);
        this.persistItem(this.world.reward);
        this.cosmetics.apply(this.player, this.inventory);
        // 이번 클리어로 새로 해금되는 스킬 검출 (해금 반영 전후 비교)
        const before = this.unlockedWorldIdx();
        this.unlockWorld(this.worldIdx + 1);
        const after = this.unlockedWorldIdx();
        const unlockedSkillKey = newlyUnlockedSkillKey(CONFIG.skills.unlocks, before, after);
        this.screens.showReward({
          itemId: this.world.reward,
          emoji: item.emoji,
          nameKey: item.nameKey,
          unlockedSkillKey,
        });
        this.sound.play('victory');
        this.setBgm(null);
        break;
      }

      case 'RESULT':
        this.saveHighScore();
        this.setBgm(null);
        this.hud.hide();
        this.screens.showResult({
          level: this.player.level,
          kills: this.stats.kills,
          bossKills: this.stats.bossKills,
          coins: this.inventory.coins,
          gems: this.inventory.gems,
          distance: this.distance,
          score: this.finalScore,
          isNewRecord: this.isNewRecord,
          hasNextWorld: this.worldIdx < WORLDS.length - 1,
          isAllClear: this.worldIdx === WORLDS.length - 1,
        });
        break;

      case 'GAMEOVER':
        this.saveHighScore();
        this.setBgm(null);
        this.hud.hide();
        this.hud.setShade(0);
        this.screens.showGameOver({
          distance: this.distance,
          level: this.player.level,
          coins: this.inventory.coins,
          score: this.finalScore,
          canRevive: this.checkpoint !== null,
        });
        this.sound.play('gameover');
        break;
    }
  }

  // ----------------------------------------------------------
  // 흐름 제어 (Screens/Input에서 호출)
  // ----------------------------------------------------------

  /** 타이틀 시작: 첫 진입이면 튜토리얼, 이미 봤으면 본편 (§14.3) */
  startRun(forceTutorial: boolean): void {
    this.resetRun();
    const seen = sessionStorage.getItem(CONFIG.tutorial.seenFlagKey);
    if (forceTutorial || (!seen && CONFIG.tutorial.enabled)) {
      this.setState('TUTORIAL');
    } else {
      this.setState('RUNNING_1');
    }
  }

  restartRun(): void {
    this.resetRun();
    this.startRun(false);
  }

  /** 결과 화면에서 다음 월드로 바로 진행 */
  startNextWorld(): void {
    if (this.worldIdx < WORLDS.length - 1) {
      this.worldIdx += 1;
      this.resetRun();
      this.setState('RUNNING_1');
    }
  }

  toTitle(): void {
    this.setState('TITLE');
  }

  togglePause(): void {
    if (!this.isPlayState) return;
    if (this.stageIntroTimer > 0) {
      this.dismissStageIntro(); // 인트로 중 일시정지 입력 = 인트로 종료
      return;
    }
    this.paused = !this.paused;
    if (this.paused) this.screens.showPause();
    else this.screens.hide();
  }

  /** 스테이지 인트로 종료 → 출발 (탭/타이머) */
  dismissStageIntro(): void {
    // 타이머 만료 경로에서는 이미 0 이하일 수 있으므로 오버레이 표시 여부로 판정
    if (this.stageIntroTimer <= 0 && !this.screens.isStageIntroVisible) return;
    this.stageIntroTimer = 0;
    this.screens.hideStageIntro();
    this.input.clear();
    // 새로 해금된 스킬이 있으면 그 안내를 우선, 없으면 월드 배너
    if (!this.announceUnlockedSkills()) {
      this.hud.showBanner(`${this.world.emoji} ${t(this.world.nameKey)}`, 1.6);
    }
  }

  /** 해금됐지만 아직 인게임 배너로 안내 안 한 스킬을 1개 안내 (§8 발견성). @returns 안내했으면 true */
  private announceUnlockedSkills(): boolean {
    const info: Record<string, { key: string; nameKey: string }> = {
      rapidFire: { key: 'R', nameKey: 'skill.rapidFire' },
      healPulse: { key: 'F', nameKey: 'skill.healPulse' },
    };
    const announced = this.loadAnnouncedSkills();
    for (const id of Object.keys(info)) {
      if (this.skillUnlocked(id as SkillId) && !announced.includes(id)) {
        const s = info[id];
        this.hud.showBanner(`${t('banner.newSkill')} ${t(s.nameKey)} (${s.key})`, 2.6);
        announced.push(id);
        localStorage.setItem(CONFIG.storage.skillAnnouncedKey, JSON.stringify(announced));
        return true;
      }
    }
    return false;
  }

  private loadAnnouncedSkills(): string[] {
    try {
      const v = localStorage.getItem(CONFIG.storage.skillAnnouncedKey);
      return v ? (JSON.parse(v) as string[]) : [];
    } catch {
      return [];
    }
  }

  setAutoSkill(on: boolean): void {
    this.autoSkill = on;
  }

  private finishTutorial(): void {
    sessionStorage.setItem(CONFIG.tutorial.seenFlagKey, '1');
    this.tutorial = null;
    this.hud.showBanner(t('tut.ready'), 1.2);
    // 본편 시작: 튜토리얼 진행 위치에서 이어 달린다 (거리 카운트는 0부터)
    this.distance = 0;
    this.runElapsed = 0;
    this.setState('RUNNING_1');
  }

  // ----------------------------------------------------------
  // 체크포인트 / 부활 (§15.3)
  // ----------------------------------------------------------

  private saveCheckpoint(state: 'MIDBOSS' | 'FINALBOSS'): void {
    const p = this.player;
    this.checkpoint = {
      state,
      player: {
        hp: p.hp,
        maxHp: p.maxHp,
        attack: p.attack,
        critChance: p.critChance,
        level: p.level,
        exp: p.exp,
        expToNext: p.expToNext,
        z: p.z,
      },
      inventory: this.inventory.snapshot(),
      stats: { ...this.stats },
      distance: this.distance,
      runElapsed: this.runElapsed,
    };
    this.sound.play('checkpoint');
  }

  revive(): void {
    const cp = this.checkpoint;
    if (!cp) return;
    const p = this.player;
    p.resetForRun();
    p.hp = cp.player.hp;
    p.maxHp = cp.player.maxHp;
    p.attack = cp.player.attack;
    p.critChance = cp.player.critChance;
    p.level = cp.player.level;
    p.exp = cp.player.exp;
    p.expToNext = cp.player.expToNext;
    p.z = cp.player.z;
    this.inventory.restore(cp.inventory);
    this.cosmetics.apply(p, this.inventory);
    this.stats = { ...cp.stats };
    this.distance = cp.distance;
    this.runElapsed = cp.runElapsed;
    this.combat.reset();
    this.screens.hide();
    this.hud.show();
    this.setState(cp.state);
  }

  // ----------------------------------------------------------
  // 스폰/이벤트 헬퍼 (Spawner/Boss/Combat에서 호출)
  // ----------------------------------------------------------

  spawnMonster(def: MonsterDef, lane: number, z: number): Monster {
    const m = new Monster(def, lane, z);
    this.monsters.push(m);
    this.scene.add(m.mesh);
    return m;
  }

  spawnObstacle(type: ObstacleType, lane: number, z: number): Obstacle {
    const o = new Obstacle(type, lane, z);
    this.obstacles.push(o);
    this.scene.add(o.mesh);
    return o;
  }

  spawnPickup(type: PickupType, lane: number, z: number, y?: number): Pickup {
    const pk = new Pickup(type, lane, z, y);
    this.pickups.push(pk);
    this.scene.add(pk.mesh);
    return pk;
  }

  spawnEnemyProjectile(
    lane: number,
    z: number,
    damage: number,
    speed: number,
    style: { color?: number; shape?: 'ball' | 'rod' | 'shard' } = {},
  ): void {
    const pos = new THREE.Vector3(laneX(lane), 1.0, z);
    const vel = new THREE.Vector3(0, 0, -speed);
    const proj = new Projectile('enemy', damage, pos, vel, false, 4.0, style);
    this.projectiles.push(proj);
    this.scene.add(proj.mesh);
  }

  /** 플레이어 피해 적용 — 튜토리얼 무피해 (§14) / 무적 처리 (§11.1) */
  damagePlayer(amount: number): boolean {
    if (this.inTutorial && CONFIG.tutorial.noDamage) return false;
    if (!this.player.alive) return false;
    const applied = this.player.takeDamage(amount);
    if (applied) {
      this.hud.damageFlash();
      this.sound.play('hitPlayer');
      this.cameraCtl.shake(0.08, 0.12);
      if (!this.player.alive) this.onPlayerDeath();
    }
    return applied;
  }

  /** 몬스터 처치: EXP + 동전/보석 드랍 (§7.1, §11) */
  onMonsterKilled(m: Monster): void {
    if (!this.monsters.includes(m)) return;
    m.alive = false;
    this.scene.remove(m.mesh);
    this.stats.kills += 1;
    this.sound.play('kill');

    this.progression.addExp(m.exp);

    if (!this.inTutorial) {
      const [cMin, cMax] = CONFIG.pickups.coinPerKill;
      const coins = cMin + Math.floor(Math.random() * (cMax - cMin + 1));
      this.inventory.addCoins(coins);
      this.hud.floatTextWorld(m.position.clone(), `${uiIcon('coin')} +${coins}`, 'coin');
      if (Math.random() < CONFIG.pickups.gemDropChance) {
        this.inventory.addGems(1);
        this.progression.addExp(CONFIG.progression.expReward.gem);
        this.hud.floatTextWorld(m.position.clone().add(new THREE.Vector3(0, 0.6, 0)), `${uiIcon('gem')} +1`, 'gem');
      }
    }
  }

  removeMonsterMesh(m: Monster): void {
    this.scene.remove(m.mesh);
  }

  onPickupCollected(pk: Pickup): void {
    pk.collected = true;
    this.scene.remove(pk.mesh);
    switch (pk.type) {
      case 'coin':
        this.inventory.addCoins(1);
        this.sound.play('coin');
        break;
      case 'gem':
        this.inventory.addGems(1);
        this.progression.addExp(CONFIG.progression.expReward.gem);
        this.sound.play('gem');
        this.hud.floatTextWorld(pk.mesh.position.clone(), `${uiIcon('gem')} +1`, 'gem');
        break;
      case 'heal':
        this.player.heal(CONFIG.pickups.healValue);
        this.sound.play('heal');
        this.hud.floatTextWorld(pk.mesh.position.clone(), `${uiIcon('heart')} +${CONFIG.pickups.healValue}`, 'heal');
        break;
    }
  }

  onPlayerDeath(): void {
    this.setState('GAMEOVER');
  }

  onBossDefeated(): void {
    if (!this.boss) return;
    this.stats.bossKills += 1;
    this.progression.addExp(this.boss.def.expReward);
    this.hud.showBanner(t('misc.victory'), 1.4);
    this.setState(this.state === 'MIDBOSS' ? 'RUNNING_2' : 'REWARD');
  }

  onRewardDone(): void {
    this.setState('RESULT');
  }

  // ----------------------------------------------------------
  // 월드 정리 / 분위기
  // ----------------------------------------------------------

  setMood(mode: 'normal' | 'dark'): void {
    const theme = this.world.theme;
    const bg = mode === 'dark' ? theme.bgDark : theme.bg;
    this.scene.background = new THREE.Color(bg);
    this.scene.fog = new THREE.Fog(bg, 24, mode === 'dark' ? 55 : 80);
  }

  /** BGM 전환 — 동시 1개. 같은 트랙이면 무시(중복 재생 방지). null이면 정지. */
  private setBgm(id: SoundId | null): void {
    if (this.currentBgm === id) return;
    if (this.currentBgm) this.sound.stop(this.currentBgm);
    this.currentBgm = id;
    if (id) this.sound.play(id, { loop: true });
  }

  private clearEntities(): void {
    this.monsters.forEach((m) => this.scene.remove(m.mesh));
    this.obstacles.forEach((o) => this.scene.remove(o.mesh));
    this.pickups.forEach((pk) => this.scene.remove(pk.mesh));
    this.projectiles.forEach((p) => this.scene.remove(p.mesh));
    this.monsters = [];
    this.obstacles = [];
    this.pickups = [];
    this.projectiles = [];
  }

  private disposeBoss(): void {
    if (this.boss) {
      this.boss.dispose();
      this.boss = null;
    }
  }

  private resetRun(): void {
    this.clearEntities();
    this.disposeBoss();
    this.player.resetForRun();
    this.inventory.reset();
    this.restorePersistedItems();
    this.cosmetics.apply(this.player, this.inventory);
    this.combat.reset();
    this.stats = { kills: 0, bossKills: 0 };
    this.distance = 0;
    this.runElapsed = 0;
    this.runSpeed = 0;
    this.segmentStart = 0;
    this.segmentLength = CONFIG.world.segment1Length;
    this.checkpoint = null;
    this.tutorial = null;
    this.paused = false;
    this.stageIntroTimer = 0;
    this.isNewRecord = false;
    this.finalScore = 0;
    this.applyWorldTheme();
    this.screens.hideTutorialPrompt();
    this.screens.hideTutorialSkip();
    this.hud.setShade(0);
  }
}
