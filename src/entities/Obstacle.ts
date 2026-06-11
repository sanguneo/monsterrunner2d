// ============================================================
// 장애물 — LOW/HIGH/PIT/BLOCK (§6.1)
// view-logic 분리: 프리미티브 박스/벽, 추후 모델 교체 가능.
// ============================================================

import * as THREE from 'three';
import { CONFIG, laneX } from '../data/config';
import type { Player } from './Player';

export type ObstacleType = 'LOW' | 'HIGH' | 'PIT' | 'BLOCK';

const lowGeo = new THREE.BoxGeometry(1.7, 0.8, 0.6);
const lowMat = new THREE.MeshStandardMaterial({ color: 0xb45309 });
const highGeo = new THREE.BoxGeometry(1.8, 1.2, 0.6);
const highMat = new THREE.MeshStandardMaterial({ color: 0x7c3aed });
const pitGeo = new THREE.PlaneGeometry(1.9, 2.4);
const pitMat = new THREE.MeshBasicMaterial({ color: 0x050308 });
const blockGeo = new THREE.BoxGeometry(1.9, 3.0, 0.8);
const blockMat = new THREE.MeshStandardMaterial({ color: 0x57534e });

/** 월드 테마 색상 적용 — 스테이지마다 장애물 색이 달라진다 */
export function applyObstacleTheme(colors: { obsLow: number; obsHigh: number; obsBlock: number }): void {
  lowMat.color.setHex(colors.obsLow);
  highMat.color.setHex(colors.obsHigh);
  blockMat.color.setHex(colors.obsBlock);
}

export class Obstacle {
  alive = true;
  /** 충돌 데미지 중복 방지 */
  hitDone = false;
  readonly mesh: THREE.Mesh;
  readonly zLen: number;

  constructor(
    public type: ObstacleType,
    public lane: number,
    public z: number,
  ) {
    const x = laneX(lane);
    switch (type) {
      case 'LOW':
        this.mesh = new THREE.Mesh(lowGeo, lowMat);
        this.mesh.position.set(x, 0.4, z);
        this.zLen = 0.6;
        break;
      case 'HIGH':
        // 머리 위 가로막: y 1.0~2.2 — 슬라이드로 통과
        this.mesh = new THREE.Mesh(highGeo, highMat);
        this.mesh.position.set(x, 1.6, z);
        this.zLen = 0.6;
        break;
      case 'PIT':
        this.mesh = new THREE.Mesh(pitGeo, pitMat);
        this.mesh.rotation.x = -Math.PI / 2;
        this.mesh.position.set(x, 0.02, z);
        this.zLen = 2.4;
        break;
      case 'BLOCK':
        this.mesh = new THREE.Mesh(blockGeo, blockMat);
        this.mesh.position.set(x, 1.5, z);
        this.zLen = 0.8;
        break;
    }
  }

  /** 플레이어 피격 판정 (히트박스 80% 축소 적용 — §13.2) */
  collides(player: Player): boolean {
    const scale = CONFIG.accessibility.hitboxScale;
    const halfW = 0.45 * scale;
    const px = player.x;
    const pz = player.z;
    const py = player.y;
    const pHeight = (player.sliding ? 0.8 : 1.6) * scale;

    if (Math.abs(px - laneX(this.lane)) > 0.85 + halfW) return false;
    if (Math.abs(pz - this.z) > this.zLen / 2 + 0.4 * scale) return false;

    switch (this.type) {
      case 'LOW':
        return py < 0.8; // 발이 허들 위를 못 넘으면 충돌
      case 'HIGH':
        return py + pHeight > 1.05; // 슬라이드(0.64)면 통과, 서있거나 점프 중이면 충돌
      case 'PIT':
        return py <= 0.05; // 지면에 있으면 추락 데미지
      case 'BLOCK':
        return py < 2.6; // 점프로 못 넘는 전체 벽
    }
  }

  get damage(): number {
    return CONFIG.obstacles.damage[this.type];
  }
}
