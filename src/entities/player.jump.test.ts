import { describe, it, expect } from 'vitest';
import { Player } from './Player';
import type { Input } from '../core/Input';

// update()는 allowControl=false면 입력을 소비하지 않지만 hop 물리는 진행된다.
const stubInput = { consumeAny: () => null } as unknown as Input;

function step(p: Player, frames: number): void {
  for (let i = 0; i < frames; i++) p.update(1 / 60, stubInput, false);
}

describe('점프(§5) — hop / airborne', () => {
  it('점프 전 false → 점프 중 true → 착지 후 false', () => {
    const p = new Player();
    expect(p.airborne).toBe(false);

    p.tryAction('jump');
    step(p, 15); // ~0.25s: hop 정점 부근
    expect(p.airborne).toBe(true);

    step(p, 45); // 체공(0.55s) 종료 후: 착지
    expect(p.airborne).toBe(false);
  });

  it('지면에서만 점프 시작 — 착지 후 재점프 가능', () => {
    const p = new Player();
    p.tryAction('jump');
    step(p, 60); // 완전 착지
    expect(p.airborne).toBe(false);
    p.tryAction('jump'); // 지면에서 재점프
    step(p, 15);
    expect(p.airborne).toBe(true);
  });
});

describe('애니 상태 — per-state 타이머 (비루프 jump/hit 시퀀스 재생)', () => {
  it('run → jump 진입 시 animTime 0에서 다시 시작, 착지 후 run 복귀', () => {
    const p = new Player();
    step(p, 30); // run 상태로 0.5s 누적
    expect(p.animState).toBe('run');
    const runT = p.animTime;
    expect(runT).toBeGreaterThan(0.4);

    p.tryAction('jump');
    step(p, 1);
    expect(p.animState).toBe('jump');
    expect(p.animTime).toBeLessThan(runT); // 전역 시간이 아니라 상태 진입 후 시간

    step(p, 60); // 체공(0.55s) 종료 → 착지
    expect(p.animState).toBe('run');
  });

  it('피격(무적) 중 hit 상태, 무적 해제 후 run 복귀', () => {
    const p = new Player();
    p.takeDamage(1); // invuln 0.5s 시작
    step(p, 1);
    expect(p.animState).toBe('hit');
    step(p, 40); // 0.66s > hitInvuln(0.5s)
    expect(p.animState).toBe('run');
  });
});
