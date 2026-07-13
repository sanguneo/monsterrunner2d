import { describe, it, expect } from 'vitest';
import { frameIndexAt, type AnimState } from './Sprites';

function st(frames: number, fps: number, loop: boolean): AnimState {
  return { fps, loop, frames: Array.from({ length: frames }, () => ({ x: 0, y: 0, w: 1, h: 1 })) };
}

describe('frameIndexAt', () => {
  it('loop=true 순환 (fps 8, 4프레임)', () => {
    const s = st(4, 8, true);
    expect(frameIndexAt(s, 0)).toBe(0);
    expect(frameIndexAt(s, 1 / 8)).toBe(1);
    expect(frameIndexAt(s, 3 / 8)).toBe(3);
    expect(frameIndexAt(s, 4 / 8)).toBe(0); // 한 바퀴
    expect(frameIndexAt(s, 5 / 8)).toBe(1);
  });

  it('loop=false 는 마지막 프레임에 고정', () => {
    const s = st(3, 10, false);
    expect(frameIndexAt(s, 0)).toBe(0);
    expect(frameIndexAt(s, 0.2)).toBe(2);
    expect(frameIndexAt(s, 100)).toBe(2); // 클램프
  });

  it('단일 프레임 / fps 0 은 항상 0 (0나눗셈·무한 방지)', () => {
    expect(frameIndexAt(st(1, 12, true), 5)).toBe(0);
    expect(frameIndexAt(st(6, 0, true), 5)).toBe(0);
  });

  it('음수 시간도 유효 인덱스', () => {
    const s = st(4, 8, true);
    expect(frameIndexAt(s, -1 / 8)).toBe(3);
  });
});
