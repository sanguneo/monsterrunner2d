// ============================================================
// 3인칭 추적 카메라 (§3.1) — 오프셋 (0,+4,-7) lerp 추적
// 보스 모드: 보스 정면 프레이밍. 화면 흔들림 지원(비명 등).
// ============================================================

import * as THREE from 'three';

export type CameraMode = 'follow' | 'boss' | 'title';

export class CameraController {
  readonly camera: THREE.PerspectiveCamera;
  mode: CameraMode = 'title';

  private shakeTime = 0;
  private shakeAmp = 0;
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

  /** playerPos: 플레이어 월드 위치, bossPos: 보스 모드일 때 보스 위치 */
  update(dt: number, playerPos: THREE.Vector3, bossPos: THREE.Vector3 | null): void {
    if (this.mode === 'boss' && bossPos) {
      // 플레이어 뒤에서 보스를 정면으로 프레이밍
      this.targetPos.set(playerPos.x * 0.5, playerPos.y + 4.2, playerPos.z - 8);
      this.lookPos.set(bossPos.x * 0.4, 1.8, (playerPos.z + bossPos.z) / 2 + 1.5);
    } else if (this.mode === 'follow') {
      this.targetPos.set(playerPos.x * 0.7, playerPos.y * 0.3 + 4, playerPos.z - 7);
      this.lookPos.set(playerPos.x * 0.5, 1.2, playerPos.z + 9);
    } else {
      // 타이틀: 천천히 도는 느낌
      const tt = performance.now() / 1000;
      this.targetPos.set(Math.sin(tt * 0.25) * 3, 3.5, playerPos.z - 8);
      this.lookPos.set(0, 1.2, playerPos.z + 6);
    }

    const k = 1 - Math.pow(0.001, dt); // 프레임 독립 lerp
    this.camera.position.lerp(this.targetPos, k);
    this.curLook.lerp(this.lookPos, k);

    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const s = this.shakeAmp * (this.shakeTime > 0 ? 1 : 0);
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }

    this.camera.lookAt(this.curLook);
  }
}
