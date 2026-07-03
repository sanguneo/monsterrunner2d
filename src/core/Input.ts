// ============================================================
// 키보드 + 터치 통합 입력 (§5, §13.2)
// 입력 버퍼(0.15s) — 소비 측(Player/Combat)이 버퍼에서 꺼내 쓴다.
// ============================================================

import { CONFIG } from '../data/config';

export type Action = 'left' | 'right' | 'jump' | 'slide' | 'skill1' | 'skill2' | 'skill3' | 'skill4' | 'pause';

interface BufferedAction {
  action: Action;
  time: number;
}

export class Input {
  private buffer: BufferedAction[] = [];
  /** 즉시 콜백 (pause 등 UI성 입력) */
  onAction: ((a: Action) => void) | null = null;

  private touchStartX = 0;
  private touchStartY = 0;
  private touchStartTime = 0;
  private touchActive = false;

  constructor(private target: HTMLElement) {
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    target.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
    target.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
    target.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

  private now(): number {
    return performance.now() / 1000;
  }

  push(action: Action): void {
    this.buffer.push({ action, time: this.now() });
    if (this.buffer.length > 8) this.buffer.shift();
    this.onAction?.(action);
  }

  /** 버퍼에서 해당 액션을 소비. maxAge(초) 내의 것만 인정. */
  consume(action: Action, maxAge: number = CONFIG.accessibility.inputBuffer): boolean {
    const t = this.now();
    for (let i = this.buffer.length - 1; i >= 0; i--) {
      const b = this.buffer[i];
      if (b.action === action && t - b.time <= maxAge) {
        this.buffer.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  /** 주어진 액션들 중 가장 오래된(먼저 입력된) 유효 항목을 소비해 반환. */
  consumeAny(actions: Action[], maxAge: number = CONFIG.accessibility.inputBuffer): Action | null {
    const t = this.now();
    for (let i = 0; i < this.buffer.length; i++) {
      const b = this.buffer[i];
      if (actions.includes(b.action) && t - b.time <= maxAge) {
        this.buffer.splice(i, 1);
        return b.action;
      }
    }
    return null;
  }

  clear(): void {
    this.buffer = [];
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.repeat) return;
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.push('left');
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.push('right');
        break;
      case 'ArrowUp':
      case 'KeyW':
      case 'Space':
        e.preventDefault();
        this.push('jump');
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.push('slide');
        break;
      case 'KeyQ':
        this.push('skill1');
        break;
      case 'KeyE':
        this.push('skill2');
        break;
      case 'KeyR':
        this.push('skill3');
        break;
      case 'KeyF':
        this.push('skill4');
        break;
      case 'Escape':
      case 'KeyP':
        this.push('pause');
        break;
    }
  }

  private onTouchStart(e: TouchEvent): void {
    e.preventDefault();
    const touch = e.changedTouches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
    this.touchStartTime = this.now();
    this.touchActive = true;
  }

  private onTouchEnd(e: TouchEvent): void {
    e.preventDefault();
    if (!this.touchActive) return;
    this.touchActive = false;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - this.touchStartX;
    const dy = touch.clientY - this.touchStartY;
    const dist = Math.hypot(dx, dy);
    const SWIPE_MIN = 24;

    if (dist >= SWIPE_MIN) {
      // 스와이프: 주축 방향 판정
      if (Math.abs(dx) > Math.abs(dy)) {
        this.push(dx > 0 ? 'right' : 'left');
      } else {
        this.push(dy < 0 ? 'jump' : 'slide');
      }
    } else if (this.now() - this.touchStartTime < 0.35) {
      // 탭: 레인 터치 (좌 1/3=좌, 우 1/3=우, 중앙=점프)
      const w = window.innerWidth;
      if (touch.clientX < w / 3) this.push('left');
      else if (touch.clientX > (w * 2) / 3) this.push('right');
      else this.push('jump');
    }
  }
}
