// ============================================================
// 밸런스 수치 단일 소스 (최종기획및설계서 §20)
// 모든 밸런스 조정은 이 파일에서만 한다.
// ============================================================

export type PatternId = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7' | 'P8';

export interface BossPhaseConfig {
  from: number;
  queue: string[];
  gap: number;
  mods?: Record<string, number>;
}

export const CONFIG = {
  lanes: { count: 3, spacing: 2.0, moveTime: 0.12, startIndex: 1 },

  // 2D 렌더 파라미터 (§20) — laneSpacingPx는 세로 줄 간격(px)
  render: {
    logicalWidth: 960,
    logicalHeight: 540,
    ppu: 24, // pixels-per-world-unit
    playerAnchorX: 0.24, // 플레이어 고정 화면 X 비율
    trackCenterY: 0.6, // 중간 줄 세로 중심 비율
    laneSpacingPx: 96, // 줄 간격(화면 Y)
    pixelRatioMax: 2,
  },

  run: {
    speedStart: 12,
    speedMax: 24,
    accel: 0.5,
    hitInvuln: 0.5,
  },

  world: {
    spawnAhead: 45,
    despawnBehind: 14,
    segment1Length: 650,
    segment2Length: 850,
    monsterSpawnIntervalStart: 4.0,
    monsterSpawnIntervalEnd: 2.0,
    arenaBossDistance: 12,
    tutorialSpeed: 7,
    stageIntroDuration: 3.0, // 스테이지 인트로(월드 이미지) 표시 시간(초)
  },

  player: {
    baseHp: 100,
    hpPerLevel: 10,
    baseAttack: 10,
    attackPerLevel: 2,
    baseCrit: 0.05,
    critPerLevel: 0.01,
    critMult: 2.0,
    fireInterval: 0.4, // 성장 비대상(고정), '연사 폭주'만 일시 단축
    fireRange: 18,
    moveBonusPerLevel: 0.02,
  },

  projectiles: { playerSpeed: 40, playerLife: 1.2 },
  // 충돌/명중 판정 반경 (검토의견 §5 — 매직넘버 단일화)
  combat: {
    monsterHitRadius: 0.75, // 플레이어 발사체 vs 몬스터
    bossHitRadius: 1.4, // 플레이어 발사체 vs 보스
    monsterContact: 0.9, // 몬스터 접촉 판정(피격 히트박스 스케일 곱)
    pickupRadius: 1.0, // 수집물 관대 판정
    enemyProjHalfX: 0.8, // 적 투사체 vs 플레이어 worldX 반폭(스케일 곱 + 0.15)
    enemyProjHalfY: 0.7, // 적 투사체 vs 플레이어 Y(줄축) 반폭
  },

  progression: {
    expCurve: (level: number) => 50 * level,
    // 몬스터/보스 처치 EXP는 data/worlds.ts의 각 정의에 포함
    expReward: { gem: 10 },
    levelUp: 'auto' as const,
  },

  skills: {
    slot1: { id: 'blast' as const, dmgMult: 4, range: 14, cooldown: 8, equipped: true },
    slot2: { id: 'dash' as const, duration: 1.5, speedBonus: 0.5, cooldown: 12, equipped: true },
    pool: {
      rapidFire: { fireMult: 0.5, duration: 5, cooldown: 14 }, // 3월드 클리어 시 해금
      healPulse: { heal: 40, cooldown: 20 }, // 5월드 클리어 시 해금
    },
    autoDashIdleDelay: 3.0, // 자동 모드: 위협 미감지 시 준비 후 이 시간 지나면 발동
    autoDashLookAhead: 0.45, // 자동 대시 위협 감지 예측 시간(초)
    // 스킬 해금 조건: 클리어한 월드 수(= unlockedWorldIdx)가 이 값 이상이면 사용 가능
    unlocks: { rapidFire: 3, healPulse: 5 },
    autoHealHpFrac: 0.55, // 자동 회복 파동: 체력 비율이 이 값 이하일 때 발동
  },

  obstacles: {
    damage: { BLOCK: 15, MOVER: 15 },
    minRecovery: 0.8,
    moverInterval: 0.7, // MOVER 슬라럼 — 한 줄 이동에 걸리는 시간(초)
    ramp: [
      { until: 0.3, pool: ['P1', 'P2', 'P5'] as PatternId[], interval: 2.5 },
      { until: 0.7, pool: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'] as PatternId[], interval: 1.8 },
      { until: 1.0, pool: ['P2', 'P3', 'P4', 'P6', 'P7', 'P8'] as PatternId[], interval: 1.2 },
    ],
    maxBlockedLanes: 2, // 항상 안전 줄 ≥1 (동시 최대 2줄 점유)
    maxConcurrentThreats: 4,
  },

  pickups: {
    coinPerKill: [1, 3] as [number, number],
    gemDropChance: 0.2,
    healValue: 30,
    healPerSegment: [1, 2] as [number, number],
    gemPatternChance: 0.15,
    coinLineChance: 0.3,
  },

  // 보스 정의는 data/worlds.ts (월드별 중간/최종보스 — 패턴·페이즈·외형)
  phaseTransition: { invuln: 0.5 },

  score: { perMeter: 1, perCoin: 5, perGem: 20, perKill: 30, perBoss: 500 },

  accessibility: {
    autoSkill: true,
    inputBuffer: 0.15,
    hitboxScale: 0.8, // 플레이어 피격 판정에만 적용(자동 사격 명중 판정은 정상 크기)
    actionInputQueue: 1,
  },

  tutorial: {
    enabled: true,
    steps: ['run', 'lane', 'autofire', 'skill'] as const,
    noDamage: true,
    waitForSuccess: true,
    skippable: true,
    seenFlagKey: 'mhr_tutorial_seen',
  },

  storage: {
    highScorePrefix: 'mhr_highscore_', // 월드별 최고점수: mhr_highscore_<worldId>
    legacyHighScoreKey: 'mhr_highscore', // 구버전 글로벌 키 (1월드로 1회 이관 후 제거)
    worldUnlockKey: 'mhr_world_unlocked', // 해금된 최대 월드 인덱스
    itemsKey: 'mhr_items', // 획득한 보상 장비 목록
    skillAnnouncedKey: 'mhr_skill_announced', // 인게임 배너로 안내 완료한 해금 스킬
  },
  i18n: { defaultLocale: 'ko' as const, locales: ['ko', 'en'] as const },
};

// 카메라가 플레이어 뒤(-Z)에서 +Z를 바라보므로 월드 +X가 화면 왼쪽에 보인다.
// 레인 0(좌)이 화면 왼쪽에 오도록 +X에 매핑한다.
export function laneX(lane: number): number {
  return (1 - lane) * CONFIG.lanes.spacing;
}

// 줄(row) → 화면 기준선 Y. lane 0=위, 1=중간, 2=아래.
export function laneY(lane: number): number {
  return (
    CONFIG.render.trackCenterY * CONFIG.render.logicalHeight +
    (lane - 1) * CONFIG.render.laneSpacingPx
  );
}

// 월드 X → 화면 X. 기준점 SoT = camera.scrollWorldX (follow에서 = player.worldX).
export function worldToScreenX(worldX: number, scrollWorldX: number): number {
  return (
    CONFIG.render.playerAnchorX * CONFIG.render.logicalWidth +
    (worldX - scrollWorldX) * CONFIG.render.ppu
  );
}
