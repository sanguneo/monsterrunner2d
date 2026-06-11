// ============================================================
// 일반 몬스터 — 월드별 데이터 정의(MonsterDef) 기반 (§7.2)
// view-logic 분리: 종류별로 다른 프리미티브 도형 + 빨간 눈
// (수집 아이템과 한눈에 구분되도록 적대적 외형 통일)
// ============================================================

import * as THREE from 'three';
import { laneX } from '../data/config';
import type { MonsterDef, MonsterBehavior, MonsterShape } from '../data/worlds';

const eyeGeo = new THREE.SphereGeometry(0.09, 8, 8);
const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff1111 });

const shapeGeos: Record<MonsterShape, THREE.BufferGeometry> = {
  box: new THREE.BoxGeometry(0.85, 0.85, 0.5),
  cone: new THREE.ConeGeometry(0.45, 1.1, 10),
  capsule: new THREE.CapsuleGeometry(0.32, 0.6, 4, 10),
  tetra: new THREE.TetrahedronGeometry(0.62),
  spiky: new THREE.IcosahedronGeometry(0.52, 0),
  sphere: new THREE.SphereGeometry(0.5, 12, 10),
};

const matCache = new Map<number, THREE.MeshStandardMaterial>();

function materialFor(color: number): THREE.MeshStandardMaterial {
  let m = matCache.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, emissive: 0x111111 });
    matCache.set(color, m);
  }
  return m;
}

export class Monster {
  alive = true;
  hp: number;
  readonly contactDamage: number;
  readonly behavior: MonsterBehavior;
  readonly speed: number;
  readonly exp: number;
  readonly id: string;
  readonly mesh: THREE.Group;
  private body: THREE.Mesh;
  private t = Math.random() * Math.PI * 2;
  /** 보스 소환 잡몹 여부 */
  isMinion = false;

  constructor(
    def: MonsterDef,
    public lane: number,
    public z: number,
  ) {
    this.id = def.id;
    this.hp = def.hp;
    this.contactDamage = def.contact;
    this.behavior = def.behavior;
    this.speed = def.speed;
    this.exp = def.exp;

    this.mesh = new THREE.Group();
    this.body = new THREE.Mesh(shapeGeos[def.shape], materialFor(def.color));
    this.mesh.add(this.body);

    // 빨간 눈 — "적"임을 한눈에 알리는 공통 신호 (플레이어 방향 -Z를 본다)
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.18, 0.16, -0.42);
    eyeR.position.set(0.18, 0.16, -0.42);
    this.mesh.add(eyeL, eyeR);

    this.mesh.position.set(laneX(lane), 0.8, z);
  }

  update(dt: number, playerZ: number): void {
    this.t += dt;
    if (this.z > playerZ + 1.2) {
      this.z -= this.speed * dt;
    }
    let x = laneX(this.lane);
    if (this.behavior === 'weave') {
      x += Math.sin(this.t * 4) * 0.9;
    }
    this.mesh.position.set(x, 0.8 + Math.sin(this.t * 3) * 0.12, this.z);
    // 위협적 흔들림 — 정적인 수집물과 모션으로도 구분
    this.body.rotation.z = Math.sin(this.t * 6) * 0.18;
    this.body.rotation.y = Math.sin(this.t * 2.5) * 0.3;
  }

  /** @returns true면 사망 */
  takeDamage(d: number): boolean {
    this.hp -= d;
    if (this.hp <= 0) {
      this.alive = false;
      return true;
    }
    return false;
  }

  get x(): number {
    return this.mesh.position.x;
  }
  get y(): number {
    return this.mesh.position.y;
  }
  get position(): THREE.Vector3 {
    return this.mesh.position;
  }
}
