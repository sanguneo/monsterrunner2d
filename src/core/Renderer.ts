// ============================================================
// Renderer2D — Canvas 2D 렌더 인프라 (§3.1, §20)
// 논리 해상도 960x540 고정, DPR≤pixelRatioMax 클램프, 레터박스 스케일.
// Game이 begin() → ctx로 레이어 드로우 → end() 순서로 직접 그린다.
// ============================================================

import { CONFIG } from '../data/config';

export class Renderer2D {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D 캔버스 컨텍스트를 생성할 수 없습니다.');
    this.context = ctx;
    this.resize();
  }

  /** 논리 좌표계(960x540) ctx — Game이 레이어를 직접 그린다 */
  get ctx(): CanvasRenderingContext2D {
    return this.context;
  }

  get width(): number {
    return CONFIG.render.logicalWidth;
  }

  get height(): number {
    return CONFIG.render.logicalHeight;
  }

  /** 창 크기에 맞춰 DPR 클램프 + 논리 해상도 레터박스 스케일 재계산 */
  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.render.pixelRatioMax);
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.width = Math.max(1, Math.round(cssW * dpr));
    this.canvas.height = Math.max(1, Math.round(cssH * dpr));

    const { logicalWidth, logicalHeight } = CONFIG.render;
    this.scale = Math.min(this.canvas.width / logicalWidth, this.canvas.height / logicalHeight);
    this.offsetX = (this.canvas.width - logicalWidth * this.scale) / 2;
    this.offsetY = (this.canvas.height - logicalHeight * this.scale) / 2;
  }

  /** 클리어 + 레터박스 변환 적용. 이후 ctx는 논리(960x540) 좌표계로 그린다. */
  begin(): void {
    const ctx = this.context;
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);
  }

  end(): void {
    this.context.restore();
  }

  /** dx,dy(px, 논리 좌표 기준) 흔들림을 적용한 상태로 cb를 실행 후 원복 */
  withShake(dx: number, dy: number, cb: () => void): void {
    const ctx = this.context;
    ctx.save();
    ctx.translate(dx, dy);
    cb();
    ctx.restore();
  }
}
