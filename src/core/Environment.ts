// ============================================================
// 환경(복도 배경) — 바닥/레인 점선/측벽 재활용 스크롤 (§7 배경)
// 월드 테마 색상만 코드 적용, 최종은 타일셋 교체 (에셋소싱 §7)
// ============================================================

import * as THREE from 'three';
import { CONFIG } from '../data/config';
import type { WorldTheme } from '../data/worlds';

export class Environment {
  private floor: THREE.Mesh;
  private dashes: THREE.Mesh[] = [];
  private walls: THREE.Mesh[] = [];
  private readonly dashSpan = 180;
  private readonly wallSpan = 192;
  private floorMat: THREE.MeshStandardMaterial;
  private wallMatA: THREE.MeshStandardMaterial;
  private wallMatB: THREE.MeshStandardMaterial;

  constructor(scene: THREE.Scene) {
    const floorGeo = new THREE.PlaneGeometry(10, 240);
    this.floorMat = new THREE.MeshStandardMaterial({ color: 0x4a3f63 });
    this.floor = new THREE.Mesh(floorGeo, this.floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -0.01;
    scene.add(this.floor);

    // 레인 경계 점선
    const dashGeo = new THREE.BoxGeometry(0.12, 0.02, 2.2);
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xbcb3d8 });
    for (let side = 0; side < 2; side++) {
      const x = side === 0 ? -CONFIG.lanes.spacing / 2 : CONFIG.lanes.spacing / 2;
      for (let i = 0; i < 30; i++) {
        const d = new THREE.Mesh(dashGeo, dashMat);
        d.position.set(x, 0.01, i * 6);
        scene.add(d);
        this.dashes.push(d);
      }
    }

    // 측벽 (월드 테마별 교차 톤)
    const wallGeo = new THREE.BoxGeometry(0.6, 5, 11);
    this.wallMatA = new THREE.MeshStandardMaterial({ color: 0x37304f });
    this.wallMatB = new THREE.MeshStandardMaterial({ color: 0x2a2440 });
    for (let side = 0; side < 2; side++) {
      const x = side === 0 ? -5.2 : 5.2;
      for (let i = 0; i < 16; i++) {
        const w = new THREE.Mesh(wallGeo, i % 2 === 0 ? this.wallMatA : this.wallMatB);
        w.position.set(x, 2.5, i * 12);
        scene.add(w);
        this.walls.push(w);
      }
    }
  }

  /** 월드 테마 색상 적용 */
  setTheme(theme: WorldTheme): void {
    this.floorMat.color.setHex(theme.floor);
    this.wallMatA.color.setHex(theme.wallA);
    this.wallMatB.color.setHex(theme.wallB);
  }

  update(playerZ: number): void {
    this.floor.position.z = playerZ + 80;
    for (const d of this.dashes) {
      if (d.position.z < playerZ - 20) d.position.z += this.dashSpan;
    }
    for (const w of this.walls) {
      if (w.position.z < playerZ - 24) w.position.z += this.wallSpan;
    }
  }
}
