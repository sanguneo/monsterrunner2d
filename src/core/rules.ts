// ============================================================
// 순수 규칙 함수 — DOM/THREE 비의존, 단위 테스트 대상 (검토의견 §5)
// Game/Boss 등에서 재사용. 밸런스 수치는 호출측에서 config로 주입.
// ============================================================

import type { SkillId } from '../systems/Combat';

export type SkillUnlocks = Partial<Record<SkillId, number>>;

/** 스킬 해금 여부 — unlocks에 없는 스킬(blast/dash)은 항상 사용 가능 */
export function skillUnlocked(unlocks: SkillUnlocks, id: SkillId, unlockedWorldIdx: number): boolean {
  const need = unlocks[id];
  return need === undefined || unlockedWorldIdx >= need;
}

/** before→after 클리어로 새로 임계값을 넘긴 스킬의 i18n 키 (없으면 undefined) */
export function newlyUnlockedSkillKey(unlocks: SkillUnlocks, before: number, after: number): string | undefined {
  for (const [id, need] of Object.entries(unlocks)) {
    if (need !== undefined && before < need && after >= need) return `skill.${id}`;
  }
  return undefined;
}

export interface ScoreParts {
  distance: number;
  coins: number;
  gems: number;
  kills: number;
  bossKills: number;
}

export interface ScoreWeights {
  perMeter: number;
  perCoin: number;
  perGem: number;
  perKill: number;
  perBoss: number;
}

/** 점수 공식 (§11) — 거리×m + 동전×c + 보석×g + 처치×k + 보스×b */
export function computeScore(p: ScoreParts, w: ScoreWeights): number {
  return Math.floor(
    p.distance * w.perMeter + p.coins * w.perCoin + p.gems * w.perGem + p.kills * w.perKill + p.bossKills * w.perBoss,
  );
}

/**
 * 보스 패턴 위협 레인 선택 (§9) — 플레이어 레인을 반드시 포함하고,
 * 최대 laneCount-1개만 점유해 **안전 레인이 항상 1개 이상** 남는 것을 보장한다.
 */
export function pickThreatLanes(
  playerLane: number,
  n: number,
  laneCount: number,
  rand: () => number = Math.random,
): number[] {
  const count = Math.min(n, laneCount - 1);
  const lanes = [playerLane];
  const others: number[] = [];
  for (let l = 0; l < laneCount; l++) if (l !== playerLane) others.push(l);
  while (lanes.length < count && others.length > 0) {
    const i = Math.floor(rand() * others.length);
    lanes.push(others.splice(i, 1)[0]);
  }
  return lanes;
}
