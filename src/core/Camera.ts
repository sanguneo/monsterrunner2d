// ============================================================
// 카메라(2D) — scrollWorldX가 화면 매핑 기준점(SoT, §3.1)
// follow: 즉시 추적(수평 lerp 없음). boss: 진입 직전 worldX 고정.
// title: 정지. 화면 흔들림(shake)은 px 오프셋으로 렌더러가 적용.
// THREE.PerspectiveCamera는 HUD.floatTextWorld(HUD.ts:313)가 S6까지 사용하는 shim.
// ============================================================

import * as THREE from 'three';

export type CameraMode = 'follow' | 'boss' | 'title';

export class CameraController {
  readonly camera: THREE.PerspectiveCamera;
  mode: CameraMode = 'title';

  /** 2D 렌더 기준점(SoT) — worldToScreenX(worldX, scrollWorldX)에 사용 */
  scrollWorldX = 0;

  private shakeTime = 0;
  private shakeAmp = 0;
  private shakeDx = 0;
  private shakeDy = 0;
  /** 보스 모드 진입 직전 worldX — 진입 중 스크롤 고정 기준 */
  private bossEntryWorldX: number | null = null;

  private targetPos = new THREE.Vector3();
  private lookPos = new THREE.Vector3();
  private curLook = new THREE.Vector3(0, 1, 10);

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 220);
    this.camera.position.set(0, 4, -7);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
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
    if (this.mode === 'boss') {
      if (this.bossEntryWorldX === null) this.bossEntryWorldX = playerWorldX;
      this.scrollWorldX = this.bossEntryWorldX;
    } else if (this.mode === 'follow') {
      this.bossEntryWorldX = null;
      this.scrollWorldX = playerWorldX;
    } else {
      this.bossEntryWorldX = null;
    }

    // THREE 카메라(shim) 갱신 — HUD 3D 투영용, 렌더에는 미사용
    if (this.mode === 'boss' && bossWorldX !== null) {
      this.targetPos.set(0, 4.2, playerWorldX - 8);
      this.lookPos.set(0, 1.8, (playerWorldX + bossWorldX) / 2 + 1.5);
    } else if (this.mode === 'follow') {
      this.targetPos.set(0, 4, playerWorldX - 7);
      this.lookPos.set(0, 1.2, playerWorldX + 9);
    } else {
      const tt = performance.now() / 1000;
      this.targetPos.set(Math.sin(tt * 0.25) * 3, 3.5, playerWorldX - 8);
      this.lookPos.set(0, 1.2, playerWorldX + 6);
    }

    const k = 1 - Math.pow(0.001, dt); // 프레임 독립 lerp
    this.camera.position.lerp(this.targetPos, k);
    this.curLook.lerp(this.lookPos, k);
    this.camera.lookAt(this.curLook);

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
