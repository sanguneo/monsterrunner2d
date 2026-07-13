// ============================================================
// 환경(배경/트랙) — Canvas 2D 렌더 (§7 배경)
// 원경 패럴럭스 밴드 + 3줄 트랙 바닥/구분선. worldToScreenX로 수평 스크롤.
// 월드 테마 색상만 코드 적용, 최종은 타일셋 교체 (에셋소싱 §7)
// ============================================================

import { CONFIG, laneY, worldToScreenX } from '../data/config';
import type { WorldTheme } from '../data/worlds';
import type { CameraController } from './Camera';
import { sprite, currentWorld } from '../systems/Sprites';

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
    const worldId = currentWorld();

    // 하늘/기본 바탕 — 원경 스프라이트가 없을 때의 바탕이자 상단 채움
    ctx.fillStyle = hex(theme.bg);
    ctx.fillRect(0, 0, w, h);

    const half = CONFIG.render.laneSpacingPx / 2;
    const trackTop = laneY(0) - half;
    const trackBottom = laneY(2) + half;

    // 원경(far) — 0.3배 패럴럭스, 상단 하늘 밴드 [0, trackTop]. 로드 전이면 색 밴드+기둥 폴백.
    if (!this.drawLayer(ctx, `env_${worldId}_far`, camera.scrollWorldX * 0.3, 0, trackTop)) {
      const bandH = h * 0.32;
      ctx.fillStyle = hex(theme.wallB);
      ctx.fillRect(0, 0, w, bandH);
      const farOriginX = worldToScreenX(0, camera.scrollWorldX * 0.3);
      const spacing = 140;
      const farOffset = ((farOriginX % spacing) + spacing) % spacing;
      ctx.fillStyle = hex(theme.wallA);
      for (let x = farOffset - spacing; x < w + spacing; x += spacing) {
        ctx.fillRect(x, bandH * 0.4, 56, bandH * 0.6);
      }
    }

    // 근경(near) — 0.6배 패럴럭스, 바닥이 trackTop인 지평선 스트립(장식). 없으면 생략.
    const nearH = Math.max(90, trackTop * 0.7);
    this.drawLayer(ctx, `env_${worldId}_near`, camera.scrollWorldX * 0.6, trackTop - nearH, nearH);

    // 바닥(floor) — 1.0배 패럴럭스, 트랙 밴드 [trackTop, 화면 하단]. 로드 전이면 단색 폴백.
    if (!this.drawLayer(ctx, `env_${worldId}_floor`, camera.scrollWorldX, trackTop, h - trackTop)) {
      ctx.fillStyle = hex(theme.floor);
      ctx.fillRect(0, trackTop, w, trackBottom - trackTop);
    }

    // 줄 구분선(점선) — 게임플레이 가독성 유지, worldToScreenX 기준 스크롤 동기화
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

  /** 스프라이트 레이어를 밴드 높이에 맞춰 가로 반복 타일링(패럴럭스). 로드 전이면 false. */
  private drawLayer(
    ctx: CanvasRenderingContext2D,
    name: string,
    scrollWorldX: number,
    bandTop: number,
    bandH: number,
  ): boolean {
    const img = sprite(name);
    if (!img || img.naturalHeight === 0) return false;
    const tileW = img.naturalWidth * (bandH / img.naturalHeight);
    if (tileW <= 0) return false;
    const originX = worldToScreenX(0, scrollWorldX);
    const offset = ((originX % tileW) + tileW) % tileW;
    const w = CONFIG.render.logicalWidth;
    for (let x = offset - tileW; x < w + tileW; x += tileW) {
      ctx.drawImage(img, x, bandTop, tileW, bandH);
    }
    return true;
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
