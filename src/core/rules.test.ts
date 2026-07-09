import { describe, it, expect } from 'vitest';
import { skillUnlocked, newlyUnlockedSkillKey, computeScore, pickThreatLanes } from './rules';
import type { SkillUnlocks } from './rules';
import { CONFIG, laneY } from '../data/config';

const UNLOCKS: SkillUnlocks = { rapidFire: 3, healPulse: 5 };

describe('skillUnlocked', () => {
  it('blast/dash(임계값 없음)는 항상 해금', () => {
    expect(skillUnlocked(UNLOCKS, 'blast', 0)).toBe(true);
    expect(skillUnlocked(UNLOCKS, 'dash', 0)).toBe(true);
  });

  it('rapidFire는 3월드 클리어부터', () => {
    expect(skillUnlocked(UNLOCKS, 'rapidFire', 2)).toBe(false);
    expect(skillUnlocked(UNLOCKS, 'rapidFire', 3)).toBe(true);
    expect(skillUnlocked(UNLOCKS, 'rapidFire', 6)).toBe(true);
  });

  it('healPulse는 5월드 클리어부터', () => {
    expect(skillUnlocked(UNLOCKS, 'healPulse', 4)).toBe(false);
    expect(skillUnlocked(UNLOCKS, 'healPulse', 5)).toBe(true);
  });
});

describe('newlyUnlockedSkillKey', () => {
  it('3월드 클리어 순간 rapidFire 해금 키 반환', () => {
    expect(newlyUnlockedSkillKey(UNLOCKS, 2, 3)).toBe('skill.rapidFire');
  });

  it('5월드 클리어 순간 healPulse 해금 키 반환', () => {
    expect(newlyUnlockedSkillKey(UNLOCKS, 4, 5)).toBe('skill.healPulse');
  });

  it('임계값을 넘지 않는 클리어는 undefined', () => {
    expect(newlyUnlockedSkillKey(UNLOCKS, 0, 1)).toBeUndefined();
    expect(newlyUnlockedSkillKey(UNLOCKS, 3, 4)).toBeUndefined();
  });

  it('이미 넘긴 임계값은 다시 알리지 않음', () => {
    expect(newlyUnlockedSkillKey(UNLOCKS, 3, 4)).toBeUndefined();
  });
});

describe('computeScore', () => {
  const w = { perMeter: 1, perCoin: 5, perGem: 20, perKill: 30, perBoss: 500 };

  it('가중 합을 floor 처리', () => {
    expect(computeScore({ distance: 123.9, coins: 10, gems: 2, kills: 4, bossKills: 1 }, w)).toBe(
      Math.floor(123.9 + 10 * 5 + 2 * 20 + 4 * 30 + 1 * 500),
    );
  });

  it('0 상태는 0점', () => {
    expect(computeScore({ distance: 0, coins: 0, gems: 0, kills: 0, bossKills: 0 }, w)).toBe(0);
  });

  it('실제 CONFIG.score 가중치와 정합', () => {
    expect(computeScore({ distance: 100, coins: 0, gems: 0, kills: 0, bossKills: 1 }, CONFIG.score)).toBe(600);
  });
});

describe('pickThreatLanes (안전 레인 보장)', () => {
  it('플레이어 레인을 항상 포함', () => {
    for (let pl = 0; pl < 3; pl++) {
      expect(pickThreatLanes(pl, 2, 3)).toContain(pl);
    }
  });

  it('최대 laneCount-1개만 점유 → 안전 레인이 항상 남음', () => {
    for (let n = 1; n <= 5; n++) {
      for (let pl = 0; pl < 3; pl++) {
        const lanes = pickThreatLanes(pl, n, 3);
        expect(lanes.length).toBeLessThanOrEqual(2);
        const safe = [0, 1, 2].filter((l) => !lanes.includes(l));
        expect(safe.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('중복 레인 없음', () => {
    const lanes = pickThreatLanes(1, 2, 3);
    expect(new Set(lanes).size).toBe(lanes.length);
  });

  it('rng 주입 시 결정적', () => {
    const lanes = pickThreatLanes(0, 2, 3, () => 0);
    expect(lanes).toEqual([0, 1]);
  });
});

// 구 3D 가로좌표 헬퍼(레인→가로좌표 매핑) 제거 — lane(정수)이 세로 위치의 단일 SoT다.
// 그 SoT를 렌더 기준선으로 변환하는 함수만 최소 1개 확인해 config.test.ts와의 중복을 피한다.
describe('레인 세로 SoT → 화면 기준선 매핑', () => {
  it('레인 인덱스가 커질수록 화면 아래로 내려간다(0=위 … count-1=아래)', () => {
    for (let l = 1; l < CONFIG.lanes.count; l++) {
      expect(laneY(l)).toBeGreaterThan(laneY(l - 1));
    }
  });
});

describe('expCurve (성장 곡선)', () => {
  it('필요 EXP = 50 * level 선형', () => {
    expect(CONFIG.progression.expCurve(1)).toBe(50);
    expect(CONFIG.progression.expCurve(5)).toBe(250);
  });
});
