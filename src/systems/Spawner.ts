// ============================================================
// 스포너 — 패턴 템플릿 P1~P8 + 거리 기반 난이도 램프 (§6, §15.5)
// 모든 템플릿은 항상 통과 가능한 안전 줄(≥1)을 보장하고, 동시 최대 2줄만 점유한다.
// ============================================================

import { CONFIG } from '../data/config';
import type { PatternId } from '../data/config';
import { pickThreatLanes } from '../core/rules';
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

const LANES = [0, 1, 2];

function buildPattern(id: PatternId, playerLane: number): BuiltPattern {
  const entries: SpawnEntry[] = [];
  let duration = 0;
  const fullRow = false;
  let usedLanes: number[] = [];

  switch (id) {
    case 'P1': {
      // 단일 블록 — 옆 줄로 회피
      const [lane] = pickThreatLanes(playerLane, 1, CONFIG.lanes.count);
      entries.push({ kind: 'obstacle', obstacle: 'BLOCK', lane, dt: 0 });
      usedLanes = [lane];
      break;
    }
    case 'P2': {
      // 이중 블록(안전 1줄) — 안전 줄로 이동
      const lanes = pickThreatLanes(playerLane, 2, CONFIG.lanes.count);
      lanes.forEach((lane) => entries.push({ kind: 'obstacle', obstacle: 'BLOCK', lane, dt: 0 }));
      usedLanes = lanes;
      break;
    }
    case 'P3': {
      // 슬라럼: MOVER가 위→중간→아래(또는 역방향)로 순차 이동 — 안전 줄 따라가기
      const startLane = Math.random() < 0.5 ? 0 : CONFIG.lanes.count - 1;
      entries.push({ kind: 'obstacle', obstacle: 'MOVER', lane: startLane, dt: 0 });
      duration = CONFIG.obstacles.moverInterval * (CONFIG.lanes.count - 1);
      usedLanes = LANES;
      break;
    }
    case 'P4': {
      // 지그재그 게이트: 이중 블록의 안전 줄이 번갈아 열림 — 리듬 줄 이동
      const beat1 = pickThreatLanes(playerLane, 2, CONFIG.lanes.count);
      const safe1 = LANES.find((l) => !beat1.includes(l))!;
      const beat2 = pickThreatLanes(safe1, 2, CONFIG.lanes.count); // safe1을 다시 위협에 포함 → 재이동 유도
      beat1.forEach((lane) => entries.push({ kind: 'obstacle', obstacle: 'BLOCK', lane, dt: 0 }));
      beat2.forEach((lane) => entries.push({ kind: 'obstacle', obstacle: 'BLOCK', lane, dt: 0.9 }));
      duration = 0.9;
      usedLanes = Array.from(new Set([...beat1, ...beat2]));
      break;
    }
    case 'P5': {
      // 보상 라인: 위협 없이 한 줄 동전 라인 — 그 줄을 유지해 수집
      const lane = randLane();
      for (let i = 0; i < 5; i++) {
        entries.push({ kind: 'pickup', pickup: 'coin', lane, dt: i * 0.25 });
      }
      usedLanes = [];
      break;
    }
    case 'P6': {
      // 몬스터 + 블록: 1줄 BLOCK + 인접 줄 몬스터 — 이동 후 사격
      const lanes = pickThreatLanes(playerLane, 2, CONFIG.lanes.count);
      const [blockLane, monsterLane] = lanes;
      entries.push({ kind: 'obstacle', obstacle: 'BLOCK', lane: blockLane, dt: 0 });
      entries.push({ kind: 'monster', monsterIdx: randInt(0, 2), lane: monsterLane, dt: 0.2 });
      usedLanes = lanes;
      break;
    }
    case 'P7': {
      // 타이밍 게이트: 2줄 블록, 안전 줄이 짧게 열렸다 곧 닫힘 — 타이밍 줄 이동
      const beat1 = pickThreatLanes(playerLane, 2, CONFIG.lanes.count);
      const reopen = beat1[randInt(0, beat1.length - 1)];
      const beat2 = LANES.filter((l) => l !== reopen); // 이전 안전 줄까지 다시 막힘
      beat1.forEach((lane) => entries.push({ kind: 'obstacle', obstacle: 'BLOCK', lane, dt: 0 }));
      beat2.forEach((lane) => entries.push({ kind: 'obstacle', obstacle: 'BLOCK', lane, dt: 0.45 }));
      duration = 0.45;
      usedLanes = LANES;
      break;
    }
    case 'P8': {
      // 몬스터 웨이브: 최대 2줄만 순차 사용 — 사격 + 안전 줄 회피
      const lanes = pickThreatLanes(playerLane, 2, CONFIG.lanes.count);
      const seq = [lanes[0], lanes[1], lanes[0]];
      seq.forEach((lane, i) => entries.push({ kind: 'monster', monsterIdx: randInt(0, 2), lane, dt: i * 0.6 }));
      duration = 1.2;
      usedLanes = lanes;
      break;
    }
  }
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
