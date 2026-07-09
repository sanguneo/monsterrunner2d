// ============================================================
// 환경(배경/트랙) — Canvas 2D 렌더 (§7 배경)
// 원경 패럴럭스 밴드 + 3줄 트랙 바닥/구분선. worldToScreenX로 수평 스크롤.
// 월드 테마 색상만 코드 적용, 최종은 타일셋 교체 (에셋소싱 §7)
// ============================================================

import { CONFIG, laneY, worldToScreenX } from '../data/config';
import type { WorldTheme } from '../data/worlds';
import type { CameraController } from './Camera';

function hex(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

export class Environment {
  private theme: WorldTheme | null = null;

  /** 월드 테마 저장 (Game.applyWorldTheme) */
  setTheme(theme: WorldTheme): void {
    this.theme = theme;
  }

  /** 배경 패럴럭스 + 3줄 트랙을 논리 좌표계(960x540)에 그린다 */
  draw(ctx: CanvasRenderingContext2D, camera: CameraController, theme: WorldTheme = this.theme ?? DEFAULT_THEME): void {
    const w = CONFIG.render.logicalWidth;
    const h = CONFIG.render.logicalHeight;
    const bg = hex(theme.bg);
    const floorColor = hex(theme.floor);
    const wallA = hex(theme.wallA);
    const wallB = hex(theme.wallB);

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // 원경 패럴럭스 밴드 (느린 스크롤, §7)
    const bandH = h * 0.32;
    ctx.fillStyle = wallB;
    ctx.fillRect(0, 0, w, bandH);
    const farOriginX = worldToScreenX(0, camera.scrollWorldX * 0.3);
    const spacing = 140;
    const farOffset = ((farOriginX % spacing) + spacing) % spacing;
    ctx.fillStyle = wallA;
    for (let x = farOffset - spacing; x < w + spacing; x += spacing) {
      ctx.fillRect(x, bandH * 0.4, 56, bandH * 0.6);
    }

    // 트랙 바닥 (3줄)
    const half = CONFIG.render.laneSpacingPx / 2;
    const trackTop = laneY(0) - half;
    const trackBottom = laneY(2) + half;
    ctx.fillStyle = floorColor;
    ctx.fillRect(0, trackTop, w, trackBottom - trackTop);

    // 줄 구분선(점선) — worldToScreenX 기준으로 스크롤과 동기화
    const originX = worldToScreenX(0, camera.scrollWorldX);
    const dashSpan = 32;
    const dashOffset = ((originX % dashSpan) + dashSpan) % dashSpan;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.setLineDash([18, 14]);
    ctx.lineDashOffset = -dashOffset;
    for (const boundaryY of [laneY(0) + half, laneY(1) + half]) {
      ctx.beginPath();
      ctx.moveTo(0, boundaryY);
      ctx.lineTo(w, boundaryY);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
}

const DEFAULT_THEME: WorldTheme = {
  bg: 0x241a38,
  bgDark: 0x120a1c,
  floor: 0x4a3f63,
  wallA: 0x37304f,
  wallB: 0x2a2440,
  obsLow: 0xb45309,
  obsHigh: 0x7c3aed,
  obsBlock: 0x57534e,
} as WorldTheme;
