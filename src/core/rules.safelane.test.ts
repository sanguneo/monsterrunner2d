import { describe, it, expect } from 'vitest';
import { pickThreatLanes } from './rules';
import { CONFIG } from '../data/config';

// 순수 3줄 닷지의 핵심 불변식(§6.4/§9): 위협은 동시에 안전 줄을 ≥1 남긴다.
describe('안전 줄 불변식 — pickThreatLanes 전수', () => {
  const laneCount = CONFIG.lanes.count; // 3

  it('모든 playerLane × n × 시드에서 안전 줄 ≥1, 점유 ≤ laneCount-1, 중복 없음', () => {
    for (let pl = 0; pl < laneCount; pl++) {
      for (let n = 0; n <= 5; n++) {
        for (const seed of [0, 0.25, 0.5, 0.75, 0.999]) {
          const threat = pickThreatLanes(pl, n, laneCount, () => seed);
          const uniq = new Set(threat);
          // 중복 없음
          expect(uniq.size).toBe(threat.length);
          // 동시 점유 ≤ laneCount-1 → 안전 줄 ≥1
          expect(uniq.size).toBeLessThanOrEqual(laneCount - 1);
          // 유효 범위
          for (const l of threat) {
            expect(l).toBeGreaterThanOrEqual(0);
            expect(l).toBeLessThan(laneCount);
          }
          // 안전 줄이 실제로 존재
          const safe: number[] = [];
          for (let l = 0; l < laneCount; l++) if (!uniq.has(l)) safe.push(l);
          expect(safe.length).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it('n≥1이면 플레이어 줄을 위협에 포함(플레이어가 반드시 이동해야 회피)', () => {
    for (let pl = 0; pl < laneCount; pl++) {
      const threat = pickThreatLanes(pl, 2, laneCount, () => 0.5);
      expect(threat).toContain(pl);
    }
  });

  it('config maxBlockedLanes가 안전 줄 불변식과 정합(< lanes.count)', () => {
    expect(CONFIG.obstacles.maxBlockedLanes).toBeLessThan(CONFIG.lanes.count);
    expect(CONFIG.obstacles.maxBlockedLanes).toBe(laneCount - 1);
  });
});
