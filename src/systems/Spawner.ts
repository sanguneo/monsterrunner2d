// ============================================================
// 스포너 — 패턴 템플릿 P1~P10 + 거리 기반 난이도 램프 (§6, §15.5)
// 모든 템플릿은 항상 통과 가능한 안전 경로를 보장한다.
// ============================================================

import { CONFIG } from '../data/config';
import type { PatternId } from '../data/config';
import type { ObstacleType } from '../entities/Obstacle';
import type { PickupType } from '../entities/Pickup';
import type { Game } from '../core/Game';

interface SpawnEntry {
  kind: 'obstacle' | 'pickup' | 'monster';
  obstacle?: ObstacleType;
  pickup?: PickupType;
  /** 현재 월드 monsters 배열 인덱스 */
  monsterIdx?: number;
  lane: number;
  /** 비트 오프셋(초) — 현재 속도로 거리 환산 */
  dt: number;
  /** 절대 거리 오프셋(유닛) */
  dz?: number;
  y?: number;
}

interface BuiltPattern {
  entries: SpawnEntry[];
  /** 패턴이 차지하는 시간 길이(초) */
  duration: number;
  fullRow: boolean;
  usedLanes: number[];
}

function randLane(): number {
  return Math.floor(Math.random() * CONFIG.lanes.count);
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function buildPattern(id: PatternId, playerLane: number): BuiltPattern {
  const entries: SpawnEntry[] = [];
  let duration = 0;
  let fullRow = false;
  let usedLanes: number[] = [];

  switch (id) {
    case 'P1': {
      const lane = randLane();
      entries.push({ kind: 'obstacle', obstacle: 'LOW', lane, dt: 0 });
      usedLanes = [lane];
      break;
    }
    case 'P2': {
      const lane = randLane();
      entries.push({ kind: 'obstacle', obstacle: 'HIGH', lane, dt: 0 });
      usedLanes = [lane];
      break;
    }
    case 'P3': {
      const lane = randLane();
      entries.push({ kind: 'obstacle', obstacle: 'PIT', lane, dt: 0 });
      usedLanes = [lane];
      break;
    }
    case 'P4': {
      // 2레인 차단(안전 1레인)
      const safe = randLane();
      for (let l = 0; l < 3; l++) {
        if (l !== safe) entries.push({ kind: 'obstacle', obstacle: 'BLOCK', lane: l, dt: 0 });
      }
      usedLanes = [0, 1, 2].filter((l) => l !== safe);
      break;
    }
    case 'P5': {
      for (let l = 0; l < 3; l++) entries.push({ kind: 'obstacle', obstacle: 'LOW', lane: l, dt: 0 });
      fullRow = true;
      usedLanes = [0, 1, 2];
      break;
    }
    case 'P6': {
      for (let l = 0; l < 3; l++) entries.push({ kind: 'obstacle', obstacle: 'HIGH', lane: l, dt: 0 });
      fullRow = true;
      usedLanes = [0, 1, 2];
      break;
    }
    case 'P7': {
      // 슬라럼: BLOCK 좌→중→우 순차 3비트 (방향 랜덤)
      const order = Math.random() < 0.5 ? [0, 1, 2] : [2, 1, 0];
      order.forEach((lane, i) => {
        entries.push({ kind: 'obstacle', obstacle: 'BLOCK', lane, dt: i * 0.7 });
      });
      duration = 1.4;
      fullRow = true;
      usedLanes = [0, 1, 2];
      break;
    }
    case 'P8': {
      // 점프-슬라이드 콤보: LOW 후 즉시 HIGH (같은 레인)
      const lane = randLane();
      entries.push({ kind: 'obstacle', obstacle: 'LOW', lane, dt: 0 });
      entries.push({ kind: 'obstacle', obstacle: 'HIGH', lane, dt: 0.85 });
      duration = 0.85;
      usedLanes = [lane];
      break;
    }
    case 'P9': {
      // 보상 아치: LOW 위에 동전 5개 호 — 회피+수집 동시
      const lane = randLane();
      entries.push({ kind: 'obstacle', obstacle: 'LOW', lane, dt: 0 });
      const heights = [0.7, 1.4, 1.8, 1.4, 0.7];
      const offsets = [-2.6, -1.3, 0, 1.3, 2.6];
      for (let i = 0; i < 5; i++) {
        entries.push({ kind: 'pickup', pickup: 'coin', lane, dt: 0, dz: offsets[i], y: heights[i] });
      }
      usedLanes = [lane];
      break;
    }
    case 'P10': {
      // 몬스터+장애물: BLOCK 1레인 + 인접 레인 몬스터
      const lane = randLane();
      const adj = lane === 0 ? 1 : lane === 2 ? 1 : Math.random() < 0.5 ? 0 : 2;
      entries.push({ kind: 'obstacle', obstacle: 'BLOCK', lane, dt: 0 });
      entries.push({ kind: 'monster', monsterIdx: randInt(0, 2), lane: adj, dt: 0.25 });
      usedLanes = [lane, adj];
      break;
    }
  }
  void playerLane;
  return { entries, duration, fullRow, usedLanes };
}

export class Spawner {
  private patternTimer = 1.2;
  private monsterTimer = 2.5;
  private lastPattern: PatternId | null = null;
  private lastPatternRepeat = 0;
  private healThresholds: number[] = [];
  private healSpawned: boolean[] = [];

  constructor(private game: Game) {}

  reset(): void {
    this.patternTimer = 1.2;
    this.monsterTimer = 2.5;
    this.lastPattern = null;
    this.lastPatternRepeat = 0;
    // 회복 아이템 구간당 1~2개 레인 배치 (§11)
    const [min, max] = CONFIG.pickups.healPerSegment;
    const count = randInt(min, max);
    this.healThresholds = count === 1 ? [0.5] : [0.35, 0.75];
    this.healSpawned = this.healThresholds.map(() => false);
  }

  /** 동시 위협 상한 관리: 장애물+몬스터 합산 (§6.4) */
  private threatCount(): number {
    const pz = this.game.player.z;
    const obs = this.game.obstacles.filter((o) => o.alive && o.z > pz).length;
    const mons = this.game.monsters.filter((m) => m.alive && m.z > pz).length;
    return obs + mons;
  }

  private currentRamp() {
    const progress = this.game.segmentProgress();
    for (const r of CONFIG.obstacles.ramp) {
      if (progress <= r.until) return r;
    }
    return CONFIG.obstacles.ramp[CONFIG.obstacles.ramp.length - 1];
  }

  update(dt: number): void {
    const game = this.game;
    const speed = Math.max(game.runSpeed, 1);
    const spawnZ = game.player.z + CONFIG.world.spawnAhead;
    const progress = game.segmentProgress();

    // --- 패턴 스폰 ---
    this.patternTimer -= dt;
    if (this.patternTimer <= 0) {
      if (this.threatCount() < CONFIG.obstacles.maxConcurrentThreats) {
        const ramp = this.currentRamp();
        const id = this.pickPattern(ramp.pool);
        const built = buildPattern(id, game.player.lane);

        for (const e of built.entries) {
          const z = spawnZ + e.dt * speed + (e.dz ?? 0);
          if (e.kind === 'obstacle' && e.obstacle) game.spawnObstacle(e.obstacle, e.lane, z);
          else if (e.kind === 'pickup' && e.pickup) game.spawnPickup(e.pickup, e.lane, z, e.y);
          else if (e.kind === 'monster' && e.monsterIdx !== undefined)
            game.spawnMonster(game.world.monsters[e.monsterIdx], e.lane, z);
        }

        // 보석 구간 배치 (§11)
        if (Math.random() < CONFIG.pickups.gemPatternChance) {
          const lane = randLane();
          game.spawnPickup('gem', lane, spawnZ + (built.duration + 0.6) * speed, 0.9);
        }
        // 동전 라인 (전열 패턴 제외 — 안전 레인 유도)
        if (!built.fullRow && Math.random() < CONFIG.pickups.coinLineChance) {
          const free = [0, 1, 2].filter((l) => !built.usedLanes.includes(l));
          if (free.length > 0) {
            const lane = free[randInt(0, free.length - 1)];
            for (let i = 0; i < 4; i++) {
              game.spawnPickup('coin', lane, spawnZ + i * 1.4, 0.8);
            }
          }
        }

        // 다음 패턴까지 간격: 램프 간격 + 패턴 길이 (최소 회복 간격 보장 §6.4)
        this.patternTimer = Math.max(ramp.interval, CONFIG.obstacles.minRecovery) + built.duration;
      } else {
        this.patternTimer = 0.4; // 상한 도달 — 잠시 후 재시도
      }
    }

    // --- 몬스터 스폰: 초반 4s당 1기 → 후반 2s당 1~2기 (§15.5) ---
    this.monsterTimer -= dt;
    if (this.monsterTimer <= 0) {
      const interval =
        CONFIG.world.monsterSpawnIntervalStart +
        (CONFIG.world.monsterSpawnIntervalEnd - CONFIG.world.monsterSpawnIntervalStart) * progress;
      if (this.threatCount() < CONFIG.obstacles.maxConcurrentThreats) {
        const count = progress > 0.7 && Math.random() < 0.4 ? 2 : 1;
        for (let i = 0; i < count; i++) {
          game.spawnMonster(game.world.monsters[randInt(0, 2)], randLane(), spawnZ + 4 + i * 3);
        }
      }
      this.monsterTimer = interval;
    }

    // --- 회복 아이템 구간 배치 ---
    this.healThresholds.forEach((th, i) => {
      if (!this.healSpawned[i] && progress >= th) {
        this.healSpawned[i] = true;
        game.spawnPickup('heal', randLane(), spawnZ + 2, 0.8);
      }
    });
  }

  /** 연속 동일 템플릿 2회 초과 금지 (§6.4) */
  private pickPattern(pool: PatternId[]): PatternId {
    let id: PatternId;
    let guard = 0;
    do {
      id = pool[randInt(0, pool.length - 1)];
      guard++;
    } while (id === this.lastPattern && this.lastPatternRepeat >= 2 && pool.length > 1 && guard < 10);

    if (id === this.lastPattern) this.lastPatternRepeat++;
    else {
      this.lastPattern = id;
      this.lastPatternRepeat = 1;
    }
    return id;
  }
}
