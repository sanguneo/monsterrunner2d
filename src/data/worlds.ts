// ============================================================
// 월드 정의 — 6월드 × (테마 / 몬스터 3종 / 중간·최종보스 / 보상)
// 설계서 §1 로드맵. 월드 추가 = 이 파일의 데이터 확장만으로 가능.
//
// 보스 패턴 타입 (Boss.ts 범용 엔진):
//   projectile — 레인 투사체 (색/모양 커스텀)
//   barrage    — 연속 탄막: 레인 순차 난사, 리듬 회피
//   wave       — 전 레인 지면 파동, 점프 회피 → 경직★
//   walls      — 레인 차단 벽 (지속), 안전 레인 이동
//   chase      — 플레이어 레인 추적 → 락 → 강타, 막판 이동 회피
//   rush       — 보스 본체 돌진, 레인 회피 → 긴 경직★
//   summon     — 잡몹 소환
//   teleport   — 순간이동(연계용)
//   scream     — 자동사격 봉인(active) → 경직★, 슬라이드 회피 (§9.2)
// ============================================================

import type { BossPhaseConfig } from './config';

export type MonsterBehavior = 'slow' | 'straight' | 'weave';
export type MonsterShape = 'box' | 'cone' | 'capsule' | 'tetra' | 'spiky' | 'sphere';

export interface MonsterDef {
  id: string;
  shape: MonsterShape;
  color: number;
  hp: number;
  contact: number;
  behavior: MonsterBehavior;
  speed: number;
  exp: number;
}

export type BossPatternType =
  'projectile' | 'barrage' | 'wave' | 'walls' | 'chase' | 'rush' | 'summon' | 'teleport' | 'scream';

export type EnemyProjShape = 'ball' | 'rod' | 'shard';

export interface PatternDef {
  type: BossPatternType;
  telegraph?: number;
  damage?: number;
  /** 위험 표식/투사체/벽/파동 색 (보스별 개성) */
  color?: number;
  lanes?: number; // projectile/walls 대상 레인 수 (안전 레인 항상 보장)
  projSpeed?: number;
  projShape?: EnemyProjShape;
  waveSpeed?: number;
  stagger?: number;
  recovery?: number;
  blockDuration?: number;
  count?: [number, number];
  monsterIdx?: number; // summon: world.monsters 인덱스
  vanish?: number;
  reappear?: number;
  fireLock?: number;
  // barrage
  shots?: number;
  interval?: number;
  // chase
  lockTime?: number;
  // rush
  rushSpeed?: number;
}

export interface BossPartDef {
  geo: 'box' | 'sphere' | 'capsule' | 'cone' | 'cylinder' | 'ico';
  size: number[];
  color: number;
  emissive?: number;
  pos: [number, number, number];
  scale?: [number, number, number];
  opacity?: number;
}

export interface BossDef {
  id: string;
  nameKey: string;
  hp: number;
  expReward: number;
  staggerDamageMult: number;
  patterns: Record<string, PatternDef>;
  phases: BossPhaseConfig[]; // queue 항목은 'a+b' 연계 표기 지원
  visual: BossPartDef[];
}

export interface RewardItemDef {
  slot: 'cape' | 'hat';
  color: number;
  emoji: string;
  nameKey: string;
  /** 착용 스프라이트 파일명(public/assets/sprites) — 없으면 색 도형 폴백 */
  sprite?: string;
}

export interface WorldTheme {
  bg: number;
  bgDark: number;
  floor: number;
  wallA: number;
  wallB: number;
  obsLow: number;
  obsHigh: number;
  obsBlock: number;
}

export interface WorldDef {
  id: string;
  nameKey: string;
  emoji: string;
  theme: WorldTheme;
  /** [0]=느린 탱커, [1]=직진형, [2]=위빙(최약체, 튜토리얼용) */
  monsters: MonsterDef[];
  midBoss: BossDef;
  finalBoss: BossDef;
  reward: string; // REWARD_ITEMS 키
}

// ---------- 패턴 헬퍼 ----------

type Extra = Partial<PatternDef>;

function proj(telegraph: number, damage: number, projSpeed: number, lanes = 1, extra: Extra = {}): PatternDef {
  return { type: 'projectile', telegraph, damage, projSpeed, lanes, recovery: 0.4, ...extra };
}
function barrage(
  telegraph: number,
  damage: number,
  projSpeed: number,
  shots: number,
  interval: number,
  extra: Extra = {},
): PatternDef {
  return { type: 'barrage', telegraph, damage, projSpeed, shots, interval, recovery: 0.5, ...extra };
}
function wave(telegraph: number, damage: number, stagger: number, waveSpeed = 14, extra: Extra = {}): PatternDef {
  return { type: 'wave', telegraph, damage, stagger, waveSpeed, ...extra };
}
function walls(telegraph: number, damage: number, lanes = 1, blockDuration = 2.0, extra: Extra = {}): PatternDef {
  return { type: 'walls', telegraph, damage, lanes, blockDuration, recovery: 0.5, ...extra };
}
function chase(telegraph: number, lockTime: number, damage: number, extra: Extra = {}): PatternDef {
  return { type: 'chase', telegraph, lockTime, damage, recovery: 0.5, ...extra };
}
function rush(telegraph: number, damage: number, rushSpeed: number, stagger: number, extra: Extra = {}): PatternDef {
  return { type: 'rush', telegraph, damage, rushSpeed, stagger, ...extra };
}
function summon(telegraph: number, count: [number, number] = [1, 2], recovery = 0.6, monsterIdx = 2): PatternDef {
  return { type: 'summon', telegraph, count, recovery, monsterIdx };
}
function teleport(vanish = 0.5, reappear = 0.4): PatternDef {
  return { type: 'teleport', vanish, reappear };
}
// 비명류 규칙(§9.2): 예고 → active(fireLock, 이 동안만 자동사격 봉인) → 경직. 순차·비겹침.
function scream(telegraph: number, damage: number, fireLock = 1.0, stagger = 1.5): PatternDef {
  return { type: 'scream', telegraph, damage, fireLock, stagger };
}

// ---------- 이미지 에셋 경로 (public/assets/images) ----------
// GitHub Pages 서브경로 대응: import.meta.env.BASE_URL 접두
const ASSET_BASE = import.meta.env.BASE_URL;

export function worldImage(idx: number): string {
  return `${ASSET_BASE}assets/images/world_${idx + 1}_${WORLDS[idx].id}.webp`;
}

export function rewardImage(itemId: string): string {
  return `${ASSET_BASE}assets/images/reward_${itemId}.webp`;
}

export const TITLE_BG_IMAGE = `${ASSET_BASE}assets/images/title_bg.webp`;

// ---------- 보상 아이템 ----------

export const REWARD_ITEMS: Record<string, RewardItemDef> = {
  ghost_cape: { slot: 'cape', color: 0xcfe8ff, emoji: '🧥', nameKey: 'reward.ghost_cape', sprite: 'cape_ghost' },
  zombie_hat: { slot: 'hat', color: 0x3f6212, emoji: '🎩', nameKey: 'reward.zombie_hat', sprite: 'hat_zombie' },
  lightning_helmet: {
    slot: 'hat',
    color: 0xfde047,
    emoji: '⛑️',
    nameKey: 'reward.lightning_helmet',
    sprite: 'hat_lightning',
  },
  seawitch_crown: { slot: 'hat', color: 0x22d3ee, emoji: '👑', nameKey: 'reward.seawitch_crown', sprite: 'hat_seawitch' },
  dracula_cape: { slot: 'cape', color: 0x7f1d1d, emoji: '🦇', nameKey: 'reward.dracula_cape', sprite: 'cape_dracula' },
  skull_crown: { slot: 'hat', color: 0xe7e5e4, emoji: '👑', nameKey: 'reward.skull_crown', sprite: 'hat_skull' },
};

// ---------- 월드 데이터 ----------

export const WORLDS: WorldDef[] = [
  // 🏫 1월드: 학교 유령 — 기본기 학습: 투사체/파동/벽/비명
  {
    id: 'school',
    nameKey: 'world.school',
    emoji: '🏫',
    theme: {
      bg: 0x241a38,
      bgDark: 0x120a1c,
      floor: 0x4a3f63,
      wallA: 0x37304f,
      wallB: 0x2a2440,
      obsLow: 0xb45309,
      obsHigh: 0x7c3aed,
      obsBlock: 0x57534e,
    },
    monsters: [
      { id: 'bookGhost', shape: 'box', color: 0x8b5a2b, hp: 20, contact: 10, behavior: 'slow', speed: 2.0, exp: 8 },
      {
        id: 'pencilGhost',
        shape: 'cone',
        color: 0xffd54a,
        hp: 15,
        contact: 10,
        behavior: 'straight',
        speed: 5.0,
        exp: 6,
      },
      { id: 'paperGhost', shape: 'tetra', color: 0xffffff, hp: 12, contact: 8, behavior: 'weave', speed: 4.0, exp: 5 },
    ],
    midBoss: {
      id: 'ghostTeacher',
      nameKey: 'boss.ghostTeacher',
      hp: 400,
      expReward: 120,
      staggerDamageMult: 1.5,
      patterns: {
        // 분필 던지기 — 흰 분필(막대)
        chalk: proj(0.6, 12, 20, 1, { color: 0xffffff, projShape: 'rod' }),
        chalk2: proj(0.6, 12, 20, 2, { color: 0xffffff, projShape: 'rod' }),
        // 칠판 충격파
        shockwave: wave(0.8, 18, 1.2, 14, { color: 0xffe28a }),
        summon: summon(1.0),
      },
      phases: [
        { from: 1.0, queue: ['chalk', 'summon', 'shockwave'], gap: 1.0 },
        {
          from: 0.5,
          queue: ['chalk2', 'shockwave', 'chalk2', 'summon'],
          gap: 0.7,
          mods: { telegraphMult: 0.75, staggerMult: 0.75 },
        },
      ],
      visual: [
        { geo: 'box', size: [1.4, 1.8, 0.8], color: 0x6b7280, emissive: 0x1f2430, pos: [0, 1.1, 0], opacity: 0.95 },
        { geo: 'sphere', size: [0.55], color: 0xe5e7eb, emissive: 0x333344, pos: [0, 2.4, 0] },
        { geo: 'box', size: [2.6, 1.6, 0.12], color: 0x14532d, pos: [0, 1.6, 0.9] },
      ],
    },
    finalBoss: {
      id: 'ghostGirl',
      nameKey: 'boss.ghostGirl',
      hp: 700,
      expReward: 250,
      staggerDamageMult: 1.5,
      patterns: {
        teleport: teleport(),
        // 머리카락 벽 — 검보라
        hair: walls(0.7, 20, 1, 2.0, { color: 0x1c1022 }),
        hair2: walls(0.7, 20, 2, 2.0, { color: 0x1c1022 }),
        scream: scream(1.0, 15),
      },
      phases: [
        { from: 1.0, queue: ['hair', 'teleport', 'hair'], gap: 1.2 },
        { from: 0.66, queue: ['teleport', 'hair2', 'scream', 'hair2'], gap: 1.0 },
        {
          from: 0.33,
          queue: ['teleport+hair2', 'scream', 'teleport+hair2'],
          gap: 0.6,
          mods: { telegraphMult: 0.7, staggerMult: 0.67 },
        },
      ],
      visual: [
        { geo: 'capsule', size: [0.5, 1.3], color: 0xf5f5f4, emissive: 0x44403c, pos: [0, 1.3, 0], opacity: 0.96 },
        { geo: 'sphere', size: [0.62], color: 0x0c0a09, emissive: 0x1c1017, pos: [0, 2.3, 0], scale: [1, 1.25, 1] },
        { geo: 'sphere', size: [0.07], color: 0xff0000, pos: [-0.18, 2.25, -0.5] },
        { geo: 'sphere', size: [0.07], color: 0xff0000, pos: [0.18, 2.25, -0.5] },
      ],
    },
    reward: 'ghost_cape',
  },

  // 🧟 2월드: 좀비 마을 — 신기술: 토사물 탄막(barrage) / 좀비킹 돌진(rush)
  {
    id: 'zombie',
    nameKey: 'world.zombie',
    emoji: '🧟',
    theme: {
      bg: 0x1c2a1c,
      bgDark: 0x0c140c,
      floor: 0x3a4a35,
      wallA: 0x2c3b28,
      wallB: 0x223020,
      obsLow: 0x854d0e,
      obsHigh: 0x3f6212,
      obsBlock: 0x44403c,
    },
    monsters: [
      { id: 'zombie', shape: 'capsule', color: 0x4d7c0f, hp: 27, contact: 12, behavior: 'slow', speed: 2.2, exp: 11 },
      { id: 'zombieDog', shape: 'box', color: 0x365314, hp: 20, contact: 12, behavior: 'straight', speed: 5.5, exp: 8 },
      { id: 'crow', shape: 'tetra', color: 0x1c1917, hp: 16, contact: 10, behavior: 'weave', speed: 4.5, exp: 7 },
    ],
    midBoss: {
      id: 'giantZombie',
      nameKey: 'boss.giantZombie',
      hp: 500,
      expReward: 150,
      staggerDamageMult: 1.5,
      patterns: {
        // 토사물 난사 — 초록 점액 구체 3연발
        vomit: barrage(0.8, 14, 14, 3, 0.35, { color: 0x84cc16, projShape: 'ball' }),
        // 대지 강타
        slam: wave(0.9, 20, 1.3, 12, { color: 0x65a30d }),
        summon: summon(1.0, [1, 2], 0.6, 0),
      },
      phases: [
        { from: 1.0, queue: ['vomit', 'summon', 'slam'], gap: 1.1 },
        {
          from: 0.5,
          queue: ['vomit', 'slam', 'vomit', 'summon'],
          gap: 0.8,
          mods: { telegraphMult: 0.8, staggerMult: 0.8 },
        },
      ],
      visual: [
        { geo: 'box', size: [1.8, 2.2, 1.0], color: 0x4d7c0f, emissive: 0x1a2e05, pos: [0, 1.3, 0] },
        { geo: 'sphere', size: [0.6], color: 0x65a30d, emissive: 0x1a2e05, pos: [0.3, 2.8, 0] },
        { geo: 'sphere', size: [0.09], color: 0xff0000, pos: [0.18, 2.85, -0.55] },
        { geo: 'sphere', size: [0.09], color: 0xff0000, pos: [0.5, 2.85, -0.55] },
      ],
    },
    finalBoss: {
      id: 'zombieKing',
      nameKey: 'boss.zombieKing',
      hp: 870,
      expReward: 310,
      staggerDamageMult: 1.5,
      patterns: {
        // 묘비 벽
        grave: walls(0.8, 22, 1, 2.0, { color: 0x6b7280 }),
        grave2: walls(0.8, 22, 2, 2.0, { color: 0x6b7280 }),
        // 왕의 포효 — 자동사격 봉인
        roar: scream(1.0, 17),
        // 왕의 돌진 ★시그니처 — 레인 회피 → 긴 경직
        charge: rush(0.9, 24, 26, 1.4, { color: 0x4d7c0f }),
        summon: summon(0.9, [1, 2], 0.6, 1),
      },
      phases: [
        { from: 1.0, queue: ['grave', 'charge', 'summon'], gap: 1.1 },
        { from: 0.6, queue: ['grave2', 'roar', 'charge'], gap: 0.9 },
        {
          from: 0.3,
          queue: ['grave2', 'roar', 'charge', 'summon'],
          gap: 0.6,
          mods: { telegraphMult: 0.75, staggerMult: 0.7 },
        },
      ],
      visual: [
        { geo: 'capsule', size: [0.7, 1.6], color: 0x3f6212, emissive: 0x14250a, pos: [0, 1.5, 0] },
        { geo: 'sphere', size: [0.55], color: 0x84cc16, emissive: 0x1a2e05, pos: [0, 2.8, 0] },
        { geo: 'cylinder', size: [0.45, 0.55, 0.4], color: 0xca8a04, emissive: 0x422006, pos: [0, 3.3, 0] },
        { geo: 'sphere', size: [0.08], color: 0xff0000, pos: [-0.18, 2.85, -0.5] },
        { geo: 'sphere', size: [0.08], color: 0xff0000, pos: [0.18, 2.85, -0.5] },
      ],
    },
    reward: 'zombie_hat',
  },

  // ⚡ 3월드: 연구소 — 신기술: 낙뢰 추적(chase) / 스파크 탄막
  {
    id: 'lab',
    nameKey: 'world.lab',
    emoji: '⚡',
    theme: {
      bg: 0x16222e,
      bgDark: 0x0a1118,
      floor: 0x37474f,
      wallA: 0x263238,
      wallB: 0x1c272c,
      obsLow: 0x0e7490,
      obsHigh: 0x6d28d9,
      obsBlock: 0x475569,
    },
    monsters: [
      { id: 'wireGolem', shape: 'box', color: 0x607d8b, hp: 34, contact: 14, behavior: 'slow', speed: 2.4, exp: 14 },
      {
        id: 'sparkBot',
        shape: 'spiky',
        color: 0x22d3ee,
        hp: 26,
        contact: 14,
        behavior: 'straight',
        speed: 6.0,
        exp: 11,
      },
      { id: 'drone', shape: 'tetra', color: 0xa78bfa, hp: 20, contact: 12, behavior: 'weave', speed: 5.0, exp: 9 },
    ],
    midBoss: {
      id: 'lightningGolem',
      nameKey: 'boss.lightningGolem',
      hp: 620,
      expReward: 190,
      staggerDamageMult: 1.5,
      patterns: {
        // 전기탄 — 시안 파편, 빠름
        bolt: proj(0.6, 16, 26, 1, { color: 0x22d3ee, projShape: 'shard' }),
        bolt2: proj(0.6, 16, 26, 2, { color: 0x22d3ee, projShape: 'shard' }),
        // 낙뢰 추적 ★시그니처 — 노란 마커가 따라온다 → 막판 레인 이동
        strike: chase(1.2, 0.35, 20, { color: 0xfde047 }),
        // 과전류 파동
        surge: wave(0.8, 22, 1.2, 15, { color: 0x67e8f9 }),
      },
      phases: [
        { from: 1.0, queue: ['bolt', 'strike', 'surge'], gap: 1.0 },
        {
          from: 0.5,
          queue: ['bolt2', 'strike', 'surge', 'bolt2'],
          gap: 0.7,
          mods: { telegraphMult: 0.75, staggerMult: 0.8 },
        },
      ],
      visual: [
        { geo: 'box', size: [1.7, 2.0, 1.1], color: 0x475569, emissive: 0x0e7490, pos: [0, 1.2, 0] },
        { geo: 'ico', size: [0.55], color: 0xfde047, emissive: 0x713f12, pos: [0, 2.7, 0] },
        { geo: 'sphere', size: [0.09], color: 0xff2222, pos: [-0.2, 2.7, -0.5] },
        { geo: 'sphere', size: [0.09], color: 0xff2222, pos: [0.2, 2.7, -0.5] },
      ],
    },
    finalBoss: {
      id: 'frankenstein',
      nameKey: 'boss.frankenstein',
      hp: 1070,
      expReward: 380,
      staggerDamageMult: 1.5,
      patterns: {
        // 전기 점멸 (빠른 순간이동)
        blink: teleport(0.4, 0.35),
        // 스파크 탄막 ★시그니처 — 노란 파편 4연발 난사
        sparkBarrage: barrage(0.7, 18, 20, 4, 0.28, { color: 0xfde047, projShape: 'shard' }),
        // 과부하 — 자동사격 봉인
        overload: scream(1.0, 19),
        surge: wave(0.8, 23, 1.4, 15, { color: 0x67e8f9 }),
        summon: summon(0.9, [1, 2], 0.6, 2),
      },
      phases: [
        { from: 1.0, queue: ['surge', 'blink', 'sparkBarrage'], gap: 1.1 },
        { from: 0.66, queue: ['blink', 'sparkBarrage', 'overload', 'surge'], gap: 0.9 },
        {
          from: 0.33,
          queue: ['blink+sparkBarrage', 'overload', 'blink+surge', 'summon'],
          gap: 0.6,
          mods: { telegraphMult: 0.7, staggerMult: 0.67 },
        },
      ],
      visual: [
        { geo: 'box', size: [1.5, 2.0, 0.9], color: 0x4d7c0f, emissive: 0x1a2e05, pos: [0, 1.2, 0] },
        { geo: 'box', size: [0.9, 0.8, 0.8], color: 0x65a30d, emissive: 0x1a2e05, pos: [0, 2.6, 0] },
        { geo: 'cylinder', size: [0.06, 0.06, 0.5], color: 0x94a3b8, pos: [-0.55, 2.6, 0] },
        { geo: 'cylinder', size: [0.06, 0.06, 0.5], color: 0x94a3b8, pos: [0.55, 2.6, 0] },
        { geo: 'sphere', size: [0.09], color: 0xff2222, pos: [-0.2, 2.65, -0.45] },
        { geo: 'sphere', size: [0.09], color: 0xff2222, pos: [0.2, 2.65, -0.45] },
      ],
    },
    reward: 'lightning_helmet',
  },

  // 🌊 4월드: 바다마녀의 심해 — 촉수 벽 + 먹물 탄막 / 소용돌이 추적
  {
    id: 'sea',
    nameKey: 'world.sea',
    emoji: '🌊',
    theme: {
      bg: 0x0e2235,
      bgDark: 0x071521,
      floor: 0x1d3a52,
      wallA: 0x16324a,
      wallB: 0x102840,
      obsLow: 0x0369a1,
      obsHigh: 0x0d9488,
      obsBlock: 0x334155,
    },
    monsters: [
      { id: 'pufferfish', shape: 'spiky', color: 0xfb923c, hp: 41, contact: 16, behavior: 'slow', speed: 2.6, exp: 17 },
      {
        id: 'sharkFin',
        shape: 'tetra',
        color: 0x64748b,
        hp: 31,
        contact: 16,
        behavior: 'straight',
        speed: 6.5,
        exp: 13,
      },
      { id: 'jellyfish', shape: 'cone', color: 0xf9a8d4, hp: 25, contact: 14, behavior: 'weave', speed: 5.5, exp: 11 },
    ],
    midBoss: {
      id: 'kraken',
      nameKey: 'boss.kraken',
      hp: 760,
      expReward: 230,
      staggerDamageMult: 1.5,
      patterns: {
        // 촉수 벽 — 보라
        tentacle: walls(0.8, 24, 1, 2.0, { color: 0x7e22ce }),
        tentacle2: walls(0.8, 24, 2, 2.0, { color: 0x7e22ce }),
        // 먹물 난사 ★시그니처 — 검은 구체, 느리지만 3연발
        ink: barrage(0.8, 18, 16, 3, 0.4, { color: 0x1e1b4b, projShape: 'ball' }),
        // 해일
        tide: wave(0.9, 24, 1.3, 13, { color: 0x38bdf8 }),
      },
      phases: [
        { from: 1.0, queue: ['tentacle', 'ink', 'tide'], gap: 1.0 },
        {
          from: 0.5,
          queue: ['tentacle2', 'tide', 'ink', 'tentacle'],
          gap: 0.75,
          mods: { telegraphMult: 0.78, staggerMult: 0.8 },
        },
      ],
      visual: [
        { geo: 'sphere', size: [1.1], color: 0x7e22ce, emissive: 0x2e1065, pos: [0, 1.6, 0] },
        { geo: 'cone', size: [0.3, 1.4], color: 0x9333ea, emissive: 0x2e1065, pos: [-0.9, 0.7, 0] },
        { geo: 'cone', size: [0.3, 1.4], color: 0x9333ea, emissive: 0x2e1065, pos: [0.9, 0.7, 0] },
        { geo: 'sphere', size: [0.14], color: 0xffe066, pos: [-0.4, 1.8, -0.95] },
        { geo: 'sphere', size: [0.14], color: 0xffe066, pos: [0.4, 1.8, -0.95] },
      ],
    },
    finalBoss: {
      id: 'seaWitch',
      nameKey: 'boss.seaWitch',
      hp: 1300,
      expReward: 460,
      staggerDamageMult: 1.5,
      patterns: {
        teleport: teleport(0.45, 0.4),
        // 저주 물방울 — 청록 구체
        bubble: proj(0.65, 20, 20, 1, { color: 0x67e8f9, projShape: 'ball' }),
        bubble2: proj(0.65, 20, 20, 2, { color: 0x67e8f9, projShape: 'ball' }),
        // 세이렌의 노래 — 자동사격 봉인
        song: scream(1.0, 21),
        // 소용돌이 추적 ★시그니처
        whirl: chase(1.3, 0.4, 22, { color: 0x22d3ee }),
      },
      phases: [
        { from: 1.0, queue: ['bubble', 'teleport', 'whirl'], gap: 1.1 },
        { from: 0.66, queue: ['teleport', 'bubble2', 'song', 'whirl'], gap: 0.9 },
        {
          from: 0.33,
          queue: ['teleport+bubble2', 'song', 'teleport+whirl'],
          gap: 0.6,
          mods: { telegraphMult: 0.7, staggerMult: 0.67 },
        },
      ],
      visual: [
        { geo: 'capsule', size: [0.6, 1.4], color: 0x0e7490, emissive: 0x083344, pos: [0, 1.4, 0] },
        { geo: 'sphere', size: [0.5], color: 0x67e8f9, emissive: 0x155e75, pos: [0, 2.6, 0] },
        { geo: 'cone', size: [0.35, 0.6], color: 0xfde047, emissive: 0x713f12, pos: [0, 3.2, 0] },
        { geo: 'sphere', size: [0.08], color: 0xff2222, pos: [-0.16, 2.65, -0.42] },
        { geo: 'sphere', size: [0.08], color: 0xff2222, pos: [0.16, 2.65, -0.42] },
      ],
    },
    reward: 'seawitch_crown',
  },

  // 🦇 5월드: 드라큘라 성 — 늑대 돌진 / 핏빛 탄막 + 박쥐 벽
  {
    id: 'dracula',
    nameKey: 'world.dracula',
    emoji: '🦇',
    theme: {
      bg: 0x29141f,
      bgDark: 0x140810,
      floor: 0x4a2735,
      wallA: 0x3b1f2c,
      wallB: 0x2c1620,
      obsLow: 0x9f1239,
      obsHigh: 0x7f1d1d,
      obsBlock: 0x3f3f46,
    },
    monsters: [
      { id: 'ghoul', shape: 'capsule', color: 0x78716c, hp: 48, contact: 18, behavior: 'slow', speed: 2.8, exp: 20 },
      { id: 'wolf', shape: 'box', color: 0x57534e, hp: 36, contact: 18, behavior: 'straight', speed: 7.0, exp: 15 },
      { id: 'bat', shape: 'tetra', color: 0x292524, hp: 29, contact: 16, behavior: 'weave', speed: 6.0, exp: 13 },
    ],
    midBoss: {
      id: 'werewolfChief',
      nameKey: 'boss.werewolfChief',
      hp: 920,
      expReward: 280,
      staggerDamageMult: 1.5,
      patterns: {
        // 발톱 투척 — 회색 파편, 매우 빠름
        claw: proj(0.6, 20, 28, 1, { color: 0xd6d3d1, projShape: 'shard' }),
        claw2: proj(0.6, 20, 28, 2, { color: 0xd6d3d1, projShape: 'shard' }),
        // 사냥 돌진 ★시그니처 — 가장 빠른 돌진
        pounce: rush(0.85, 26, 30, 1.3, { color: 0x78716c }),
        howl: summon(0.9, [1, 2], 0.6, 1),
      },
      phases: [
        { from: 1.0, queue: ['claw', 'pounce', 'howl'], gap: 0.95 },
        {
          from: 0.5,
          queue: ['claw2', 'pounce', 'claw2', 'howl'],
          gap: 0.7,
          mods: { telegraphMult: 0.75, staggerMult: 0.8 },
        },
      ],
      visual: [
        { geo: 'capsule', size: [0.65, 1.5], color: 0x57534e, emissive: 0x1c1917, pos: [0, 1.4, 0] },
        { geo: 'sphere', size: [0.5], color: 0x78716c, emissive: 0x1c1917, pos: [0, 2.6, 0] },
        { geo: 'cone', size: [0.14, 0.4], color: 0x57534e, pos: [-0.3, 3.05, 0] },
        { geo: 'cone', size: [0.14, 0.4], color: 0x57534e, pos: [0.3, 3.05, 0] },
        { geo: 'sphere', size: [0.09], color: 0xfbbf24, pos: [-0.18, 2.65, -0.42] },
        { geo: 'sphere', size: [0.09], color: 0xfbbf24, pos: [0.18, 2.65, -0.42] },
      ],
    },
    finalBoss: {
      id: 'dracula',
      nameKey: 'boss.dracula',
      hp: 1560,
      expReward: 550,
      staggerDamageMult: 1.5,
      patterns: {
        // 박쥐화 점멸
        batform: teleport(0.45, 0.35),
        // 핏빛 탄막 ★시그니처 — 붉은 구체 4연발
        bloodBarrage: barrage(0.65, 22, 22, 4, 0.25, { color: 0xdc2626, projShape: 'ball' }),
        // 박쥐 떼 벽 — 칠흑
        batswarm: walls(0.75, 26, 1, 1.8, { color: 0x1c1917 }),
        batswarm2: walls(0.75, 26, 2, 1.8, { color: 0x1c1917 }),
        // 최면 — 자동사격 봉인
        hypnosis: scream(1.0, 23, 1.0, 1.4),
      },
      phases: [
        { from: 1.0, queue: ['bloodBarrage', 'batform', 'batswarm'], gap: 1.0 },
        { from: 0.66, queue: ['batform', 'batswarm2', 'hypnosis', 'bloodBarrage'], gap: 0.85 },
        {
          from: 0.33,
          queue: ['batform+batswarm2', 'hypnosis', 'batform+bloodBarrage'],
          gap: 0.55,
          mods: { telegraphMult: 0.7, staggerMult: 0.67 },
        },
      ],
      visual: [
        { geo: 'capsule', size: [0.55, 1.5], color: 0x18181b, emissive: 0x450a0a, pos: [0, 1.4, 0] },
        { geo: 'box', size: [2.0, 1.2, 0.1], color: 0x450a0a, emissive: 0x1c0505, pos: [0, 1.6, 0.4] },
        { geo: 'sphere', size: [0.48], color: 0xe7e5e4, emissive: 0x44403c, pos: [0, 2.6, 0] },
        { geo: 'sphere', size: [0.08], color: 0xff0000, pos: [-0.16, 2.65, -0.4] },
        { geo: 'sphere', size: [0.08], color: 0xff0000, pos: [0.16, 2.65, -0.4] },
      ],
    },
    reward: 'dracula_cape',
  },

  // 💀 6월드: 해골왕의 성 — 총집편: 뼈 탄막 + 죽음의 손 추적 + 돌진
  {
    id: 'skull',
    nameKey: 'world.skull',
    emoji: '💀',
    theme: {
      bg: 0x1f1d24,
      bgDark: 0x0e0d12,
      floor: 0x44404e,
      wallA: 0x35323e,
      wallB: 0x282530,
      obsLow: 0xa16207,
      obsHigh: 0x6b21a8,
      obsBlock: 0x52525b,
    },
    monsters: [
      { id: 'boneGolem', shape: 'box', color: 0xd6d3d1, hp: 55, contact: 20, behavior: 'slow', speed: 3.0, exp: 23 },
      {
        id: 'skeletonSoldier',
        shape: 'capsule',
        color: 0xe7e5e4,
        hp: 41,
        contact: 20,
        behavior: 'straight',
        speed: 7.5,
        exp: 18,
      },
      { id: 'skullBird', shape: 'tetra', color: 0xa8a29e, hp: 33, contact: 18, behavior: 'weave', speed: 6.5, exp: 15 },
    ],
    midBoss: {
      id: 'skeletonKnight',
      nameKey: 'boss.skeletonKnight',
      hp: 1100,
      expReward: 340,
      staggerDamageMult: 1.5,
      patterns: {
        // 뼈 창 — 뼈색 막대, 최속
        spear: proj(0.55, 22, 30, 1, { color: 0xe7e5e4, projShape: 'rod' }),
        spear2: proj(0.55, 22, 30, 2, { color: 0xe7e5e4, projShape: 'rod' }),
        // 방패 돌격 ★시그니처
        shieldCharge: rush(0.8, 28, 32, 1.2, { color: 0x71717a }),
        // 뼈 감옥 벽
        boneWall: walls(0.7, 26, 1, 1.8, { color: 0xd6d3d1 }),
      },
      phases: [
        { from: 1.0, queue: ['spear', 'boneWall', 'shieldCharge'], gap: 0.9 },
        {
          from: 0.5,
          queue: ['spear2', 'shieldCharge', 'boneWall', 'spear2'],
          gap: 0.65,
          mods: { telegraphMult: 0.75, staggerMult: 0.8 },
        },
      ],
      visual: [
        { geo: 'capsule', size: [0.6, 1.5], color: 0xe7e5e4, emissive: 0x44403c, pos: [0, 1.4, 0] },
        { geo: 'box', size: [1.7, 0.35, 0.5], color: 0x71717a, emissive: 0x27272a, pos: [0, 2.1, 0] },
        { geo: 'sphere', size: [0.48], color: 0xf5f5f4, emissive: 0x57534e, pos: [0, 2.7, 0] },
        { geo: 'sphere', size: [0.09], color: 0xff2222, pos: [-0.16, 2.75, -0.4] },
        { geo: 'sphere', size: [0.09], color: 0xff2222, pos: [0.16, 2.75, -0.4] },
      ],
    },
    finalBoss: {
      id: 'skullKing',
      nameKey: 'boss.skullKing',
      hp: 1850,
      expReward: 660,
      staggerDamageMult: 1.5,
      patterns: {
        warp: teleport(0.4, 0.3),
        // 뼈 폭풍 ★시그니처 — 뼈 파편 5연발 최다 탄막
        boneStorm: barrage(0.6, 24, 24, 5, 0.22, { color: 0xe7e5e4, projShape: 'shard' }),
        // 죽음의 절규 — 자동사격 봉인
        deathCry: scream(0.95, 25, 1.0, 1.4),
        // 죽음의 손 추적 — 보라 그림자
        deathHand: chase(1.1, 0.3, 26, { color: 0x9d4edd }),
        // 대낫 휩쓸기
        sweep: wave(0.8, 30, 1.2, 16, { color: 0xc084fc }),
        summon: summon(0.85, [1, 2], 0.5, 1),
      },
      phases: [
        { from: 1.0, queue: ['boneStorm', 'warp', 'sweep'], gap: 0.95 },
        { from: 0.66, queue: ['warp', 'deathHand', 'deathCry', 'boneStorm'], gap: 0.8 },
        {
          from: 0.33,
          queue: ['warp+boneStorm', 'deathCry', 'warp+deathHand', 'summon'],
          gap: 0.5,
          mods: { telegraphMult: 0.65, staggerMult: 0.65 },
        },
      ],
      visual: [
        { geo: 'capsule', size: [0.65, 1.6], color: 0x1c1917, emissive: 0x0c0a09, pos: [0, 1.5, 0] },
        { geo: 'sphere', size: [0.55], color: 0xf5f5f4, emissive: 0x57534e, pos: [0, 2.85, 0] },
        { geo: 'cylinder', size: [0.42, 0.52, 0.45], color: 0xca8a04, emissive: 0x422006, pos: [0, 3.4, 0] },
        { geo: 'sphere', size: [0.1], color: 0xff2222, pos: [-0.18, 2.9, -0.45] },
        { geo: 'sphere', size: [0.1], color: 0xff2222, pos: [0.18, 2.9, -0.45] },
      ],
    },
    reward: 'skull_crown',
  },
];
