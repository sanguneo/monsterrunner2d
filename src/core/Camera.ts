// ============================================================
// 카메라(2D) — scrollWorldX가 화면 매핑 기준점(SoT, §3.1)
// follow: 즉시 추적(수평 lerp 없음). boss: 진입 직전 worldX 고정.
// title: 정지. 화면 흔들림(shake)은 px 오프셋으로 렌더러가 적용.
// ============================================================

export type CameraMode = 'follow' | 'boss' | 'title';

export class CameraController {
  mode: CameraMode = 'title';

  /** 2D 렌더 기준점(SoT) — worldToScreenX(worldX, scrollWorldX)에 사용 */
  scrollWorldX = 0;

  private shakeTime = 0;
  private shakeAmp = 0;
  private shakeDx = 0;
  private shakeDy = 0;
  /** 보스 모드 진입 직전 worldX — 진입 중 스크롤 고정 기준 */
  private bossEntryWorldX: number | null = null;

  /** aspect는 3D 카메라(shim) 제거로 더는 쓰이지 않지만, 호출부 시그니처 호환을 위해 유지한다. */
  constructor(aspect: number) {
    void aspect;
  }

  resize(aspect: number): void {
    void aspect;
  }

  shake(amp: number, duration: number): void {
    this.shakeAmp = amp;
    this.shakeTime = duration;
  }

  /** 이번 프레임 화면 흔들림 오프셋(px, 논리 좌표계) */
  get shakeOffset(): { dx: number; dy: number } {
    return { dx: this.shakeDx, dy: this.shakeDy };
  }

  /**
   * playerWorldX: 플레이어 진행거리(worldX). bossWorldX: 보스 모드일 때 보스 진행거리.
   * follow → scrollWorldX = playerWorldX(즉시). boss → 진입 직전 worldX에 고정. title → 정지(0 유지).
   */
  update(dt: number, playerWorldX: number, bossWorldX: number | null): void {
    void bossWorldX;
    if (this.mode === 'boss') {
      if (this.bossEntryWorldX === null) this.bossEntryWorldX = playerWorldX;
      this.scrollWorldX = this.bossEntryWorldX;
    } else if (this.mode === 'follow') {
      this.bossEntryWorldX = null;
      this.scrollWorldX = playerWorldX;
    } else {
      this.bossEntryWorldX = null;
    }

    this.shakeDx = 0;
    this.shakeDy = 0;
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      if (this.shakeTime > 0) {
        this.shakeDx = (Math.random() - 0.5) * this.shakeAmp * 48;
        this.shakeDy = (Math.random() - 0.5) * this.shakeAmp * 48;
      }
    }
  }
}
