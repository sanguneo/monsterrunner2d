import { describe, it, expect } from 'vitest';
import { CONFIG, laneY, worldToScreenX } from './config';

describe('2D 좌표 헬퍼 (§20)', () => {
  it('laneY: 중간 줄(1)은 트랙 세로 중심, 위/아래는 ±laneSpacingPx', () => {
    const center = CONFIG.render.trackCenterY * CONFIG.render.logicalHeight;
    expect(laneY(1)).toBe(center);
    expect(laneY(0)).toBe(center - CONFIG.render.laneSpacingPx);
    expect(laneY(2)).toBe(center + CONFIG.render.laneSpacingPx);
  });

  it('laneY: 위(0) < 중간(1) < 아래(2) 순서로 화면 아래로 내려간다', () => {
    expect(laneY(0)).toBeLessThan(laneY(1));
    expect(laneY(1)).toBeLessThan(laneY(2));
  });

  it('worldToScreenX: 플레이어(worldX==scrollWorldX)는 앵커 X에 고정된다', () => {
    const anchor = CONFIG.render.playerAnchorX * CONFIG.render.logicalWidth;
    expect(worldToScreenX(100, 100)).toBe(anchor);
    expect(worldToScreenX(0, 0)).toBe(anchor);
  });

  it('worldToScreenX: 앞선 위협(worldX > scroll)은 앵커 오른쪽, ppu 비례', () => {
    const anchor = CONFIG.render.playerAnchorX * CONFIG.render.logicalWidth;
    expect(worldToScreenX(105, 100)).toBe(anchor + 5 * CONFIG.render.ppu);
    expect(worldToScreenX(95, 100)).toBe(anchor - 5 * CONFIG.render.ppu);
  });

  it('render/obstacles 2D 상수가 설계서 §20과 일치', () => {
    expect(CONFIG.render.laneSpacingPx).toBe(96);
    expect(CONFIG.render.ppu).toBe(24);
    expect(CONFIG.obstacles.maxBlockedLanes).toBe(2);
    expect(CONFIG.obstacles.maxBlockedLanes).toBeLessThan(CONFIG.lanes.count);
    expect(CONFIG.combat.enemyProjHalfY).toBe(0.7);
  });
});
