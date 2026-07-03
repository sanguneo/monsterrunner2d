// ============================================================
// 전투 — 자동 사격 + 수동 스킬 + 충돌 (§7, §8, §13.1)
// ============================================================

import * as THREE from 'three';
import { CONFIG, laneX } from '../data/config';
import { t } from '../data/i18n';
import { Projectile } from '../entities/Projectile';

import type { Game } from '../core/Game';

export type SkillId = 'blast' | 'dash' | 'rapidFire' | 'healPulse';

interface BlastFx {
  mesh: THREE.Mesh;
  life: number;
}

const ringGeo = new THREE.TorusGeometry(1, 0.12, 8, 28);
const ringMat = new THREE.MeshBasicMaterial({ color: 0xffa726, transparent: true, opacity: 0.9 });

export class Combat {
  /** 잔여 쿨다운(초). 0이면 사용 가능. */
  cooldowns: Record<SkillId, number> = { blast: 0, dash: 0, rapidFire: 0, healPulse: 0 };
  readonly cooldownMax: Record<SkillId, number> = {
    blast: CONFIG.skills.slot1.cooldown,
    dash: CONFIG.skills.slot2.cooldown,
    rapidFire: CONFIG.skills.pool.rapidFire.cooldown,
    healPulse: CONFIG.skills.pool.healPulse.cooldown,
  };

  private fireTimer = 0;
  private rapidActive = 0; // 연사 폭주 잔여 시간
  private dashReadyIdle = 0; // 자동 대시: 위협 없을 때 대기 시간
  private fx: BlastFx[] = [];

  constructor(private game: Game) {}

  reset(): void {
    this.cooldowns = { blast: 0, dash: 0, rapidFire: 0, healPulse: 0 };
    this.fireTimer = 0;
    this.rapidActive = 0;
    this.dashReadyIdle = 0;
    this.fx.forEach((f) => {
      this.game.scene.remove(f.mesh);
      (f.mesh.material as THREE.Material).dispose(); // clone된 링 머티리얼 해제
    });
    this.fx = [];
  }

  update(dt: number): void {
    const game = this.game;

    // 쿨다운/버프 갱신
    (Object.keys(this.cooldowns) as SkillId[]).forEach((id) => {
      if (this.cooldowns[id] > 0) this.cooldowns[id] = Math.max(0, this.cooldowns[id] - dt);
    });
    if (this.rapidActive > 0) this.rapidActive -= dt;

    // 수동 스킬 입력 (자동 모드여도 수동 입력 허용)
    if (game.skillsEnabled) {
      if (game.input.consume('skill1', 0.3)) this.useSkill('blast');
      if (game.input.consume('skill2', 0.3)) this.useSkill('dash');
      if (game.input.consume('skill3', 0.3)) this.useSkill('rapidFire');
      if (game.input.consume('skill4', 0.3)) this.useSkill('healPulse');
    }

    // 자동 스킬 발동 (§13.1, 기본 ON)
    if (game.skillsEnabled && game.autoSkill) {
      this.updateAutoSkills(dt);
    }

    this.updateAutofire(dt);
    this.updateProjectiles(dt);
    this.updateContacts();
    this.updateFx(dt);
  }

  // ----------------------------------------------------------
  // 자동 사격 (§7.1)
  // ----------------------------------------------------------

  private updateAutofire(dt: number): void {
    const game = this.game;
    this.fireTimer -= dt;
    if (this.fireTimer > 0) return;

    // 공포의 비명: active 동안 자동사격 봉인 (§9.2)
    if (game.boss?.fireLockActive) return;

    const target = this.findTarget();
    if (!target) return;

    const interval = CONFIG.player.fireInterval * (this.rapidActive > 0 ? CONFIG.skills.pool.rapidFire.fireMult : 1);
    this.fireTimer = interval;

    const p = game.player;
    const isCrit = Math.random() < p.critChance;
    const damage = p.attack * (isCrit ? CONFIG.player.critMult : 1);

    const origin = new THREE.Vector3(p.x, p.y + 1.0, p.z + 0.5);
    const dir = target.clone().sub(origin).normalize();
    const vel = dir.multiplyScalar(CONFIG.projectiles.playerSpeed);
    const proj = new Projectile('player', damage, origin, vel, isCrit, CONFIG.projectiles.playerLife);
    game.projectiles.push(proj);
    game.scene.add(proj.mesh);
    game.sound.play('shoot');
  }

  /** 사정거리 내 가장 가까운 몬스터(또는 보스) 자동 타겟 */
  private findTarget(): THREE.Vector3 | null {
    const game = this.game;
    const p = game.player;
    let best: THREE.Vector3 | null = null;
    let bestDist = CONFIG.player.fireRange;

    for (const m of game.monsters) {
      if (!m.alive || m.z < p.z - 0.5) continue;
      const d = m.z - p.z;
      if (d < bestDist) {
        bestDist = d;
        best = m.position.clone();
      }
    }
    if (game.boss && game.boss.targetable) {
      const d = game.boss.z - p.z;
      if (d < bestDist) {
        best = game.boss.position.clone().setY(1.5);
      }
    }
    return best;
  }

  // ----------------------------------------------------------
  // 발사체 이동/명중
  // ----------------------------------------------------------

  private updateProjectiles(dt: number): void {
    const game = this.game;
    const p = game.player;
    const scale = CONFIG.accessibility.hitboxScale;

    for (let i = game.projectiles.length - 1; i >= 0; i--) {
      const proj = game.projectiles[i];
      proj.update(dt);

      if (proj.alive && proj.owner === 'player') {
        // 몬스터 명중 (정상 크기 판정 — §7.1)
        for (const m of game.monsters) {
          if (!m.alive) continue;
          if (proj.position.distanceTo(m.position) < CONFIG.combat.monsterHitRadius) {
            proj.alive = false;
            game.hud.floatTextWorld(m.position.clone(), `${Math.round(proj.damage)}`, proj.isCrit ? 'crit' : 'dmg');
            game.sound.play('hitMonster');
            if (m.takeDamage(proj.damage)) game.onMonsterKilled(m);
            break;
          }
        }
        // 보스 명중
        if (proj.alive && game.boss && game.boss.targetable) {
          const bossCenter = game.boss.position.clone().setY(1.5);
          if (proj.position.distanceTo(bossCenter) < CONFIG.combat.bossHitRadius) {
            proj.alive = false;
            const dealt = game.boss.takeDamage(proj.damage);
            if (dealt > 0) {
              // 경직 중 데미지 숫자 확대·노란색 (§9.4)
              const cls = game.boss.staggered ? 'dmg-weak' : proj.isCrit ? 'crit' : 'dmg';
              game.hud.floatTextWorld(bossCenter, `${dealt}`, cls);
            }
          }
        }
      } else if (proj.alive && proj.owner === 'enemy') {
        // 적 투사체(분필) vs 플레이어 — 피격 히트박스 80% (§13.2)
        if (
          Math.abs(proj.position.x - p.x) < CONFIG.combat.enemyProjHalfX * scale + 0.15 &&
          Math.abs(proj.position.z - p.z) < CONFIG.combat.enemyProjHalfZ &&
          p.y < 2.4
        ) {
          proj.alive = false;
          game.damagePlayer(proj.damage);
        }
        if (proj.position.z < p.z - 4) proj.alive = false;
      }

      if (!proj.alive) {
        game.scene.remove(proj.mesh);
        game.projectiles.splice(i, 1);
      }
    }
  }

  // ----------------------------------------------------------
  // 접촉/장애물/수집 판정
  // ----------------------------------------------------------

  private updateContacts(): void {
    const game = this.game;
    const p = game.player;
    const scale = CONFIG.accessibility.hitboxScale;

    // 몬스터 접촉
    for (const m of game.monsters) {
      if (!m.alive) continue;
      if (
        Math.abs(m.x - p.x) < CONFIG.combat.monsterContact * scale &&
        Math.abs(m.z - p.z) < CONFIG.combat.monsterContact &&
        p.y < 1.4
      ) {
        if (p.dashTimer > 0) continue; // 무적 대시: 관통
        if (game.damagePlayer(m.contactDamage)) {
          m.alive = false; // 접촉한 몬스터는 소멸 (EXP 없음)
          game.removeMonsterMesh(m);
        }
      }
    }

    // 장애물 충돌
    for (const o of game.obstacles) {
      if (!o.alive || o.hitDone) continue;
      if (p.dashTimer > 0) continue; // 무적 대시: 장애물 관통
      if (o.collides(p)) {
        o.hitDone = true;
        game.damagePlayer(o.damage);
      }
    }

    // 수집물 획득 (관대한 판정)
    for (const pk of game.pickups) {
      if (!pk.alive) continue;
      if (
        Math.abs(pk.x - p.x) < CONFIG.combat.pickupRadius &&
        Math.abs(pk.z - p.z) < CONFIG.combat.pickupRadius &&
        Math.abs(pk.y - (p.y + 0.8)) < 1.3
      ) {
        pk.alive = false;
        game.onPickupCollected(pk);
      }
    }
  }

  // ----------------------------------------------------------
  // 스킬 (§8)
  // ----------------------------------------------------------

  useSkill(id: SkillId): boolean {
    if (this.cooldowns[id] > 0 || !this.game.skillsEnabled || !this.game.skillUnlocked(id)) return false;
    switch (id) {
      case 'blast':
        return this.castBlast();
      case 'dash':
        return this.castDash();
      case 'rapidFire':
        return this.castRapidFire();
      case 'healPulse':
        return this.castHealPulse();
    }
  }

  /** 광역 폭발: 전방 범위 몬스터·보스에 공격력×4 (§8.1) */
  private castBlast(): boolean {
    const game = this.game;
    const p = game.player;
    const range = CONFIG.skills.slot1.range;
    const damage = p.attack * CONFIG.skills.slot1.dmgMult;

    let hitAny = false;
    for (const m of [...game.monsters]) {
      if (!m.alive) continue;
      if (m.z > p.z - 2 && m.z < p.z + range) {
        hitAny = true;
        game.hud.floatTextWorld(m.position.clone(), `${Math.round(damage)}`, 'crit');
        if (m.takeDamage(damage)) game.onMonsterKilled(m);
      }
    }
    if (game.boss && game.boss.targetable && game.boss.z - p.z < range + 4) {
      const dealt = game.boss.takeDamage(damage);
      if (dealt > 0) {
        hitAny = true;
        game.hud.floatTextWorld(
          game.boss.position.clone().setY(2),
          `${dealt}`,
          game.boss.staggered ? 'dmg-weak' : 'crit',
        );
      }
    }

    this.cooldowns.blast = this.cooldownMax.blast;
    this.spawnBlastFx();
    game.sound.play('skillBlast');
    game.cameraCtl.shake(0.1, 0.15);
    void hitAny;
    return true;
  }

  /** 무적 대시: 1.5s 무적 + 전진속도 +50% + 관통 (§8.1) */
  private castDash(): boolean {
    const game = this.game;
    game.player.dashTimer = CONFIG.skills.slot2.duration;
    this.cooldowns.dash = this.cooldownMax.dash;
    this.dashReadyIdle = 0;
    game.sound.play('skillDash');
    return true;
  }

  /** 연사 폭주 (해금 예정 — 로직만, §8.1) */
  private castRapidFire(): boolean {
    this.rapidActive = CONFIG.skills.pool.rapidFire.duration;
    this.cooldowns.rapidFire = this.cooldownMax.rapidFire;
    return true;
  }

  /** 회복 파동 (해금 예정 — 로직만, §8.1) */
  private castHealPulse(): boolean {
    const game = this.game;
    game.player.heal(CONFIG.skills.pool.healPulse.heal);
    game.hud.floatTextWorld(game.player.position.clone(), t('float.heal'), 'heal');
    // 주변 잡몹 약한 넉백
    for (const m of game.monsters) {
      if (m.alive && Math.abs(m.z - game.player.z) < 6) m.z += 3;
    }
    this.cooldowns.healPulse = this.cooldownMax.healPulse;
    return true;
  }

  // ----------------------------------------------------------
  // 자동 스킬 발동 (§13.1)
  // ----------------------------------------------------------

  private updateAutoSkills(dt: number): void {
    const game = this.game;
    const p = game.player;

    // 광역 폭발 / 연사 폭주: 전방 사정거리 내 몬스터/보스 있을 때 자동 (헛방 방지)
    const range = CONFIG.skills.slot1.range;
    const enemyNear =
      game.monsters.some((m) => m.alive && m.z > p.z - 1 && m.z < p.z + range) ||
      (game.boss !== null && game.boss.targetable && game.boss.z - p.z < range + 4);

    if (this.cooldowns.blast <= 0 && enemyNear) this.useSkill('blast');

    // 연사 폭주: 해금 시 전방에 적이 있고 아직 버프가 없을 때 자동 (§8.1)
    if (game.skillUnlocked('rapidFire') && this.cooldowns.rapidFire <= 0 && this.rapidActive <= 0 && enemyNear) {
      this.useSkill('rapidFire');
    }

    // 회복 파동: 해금 시 체력이 임계 이하이고 회복이 낭비되지 않을 때 자동 (§8.1)
    if (game.skillUnlocked('healPulse') && this.cooldowns.healPulse <= 0) {
      const healAmt = CONFIG.skills.pool.healPulse.heal;
      if (p.hp / p.maxHp <= CONFIG.skills.autoHealHpFrac && p.maxHp - p.hp >= healAmt * 0.8) {
        this.useSkill('healPulse');
      }
    }

    // 무적 대시: 회피 불가 위협 감지 시 우선 발동, 없으면 쿨마다 (대기 후)
    if (this.cooldowns.dash <= 0) {
      if (this.detectImminentThreat()) {
        this.useSkill('dash');
      } else {
        this.dashReadyIdle += dt;
        if (game.isRunningState && this.dashReadyIdle >= CONFIG.skills.autoDashIdleDelay) {
          this.useSkill('dash');
        }
      }
    } else {
      this.dashReadyIdle = 0;
    }

    this.autoJumpPit();
  }

  /**
   * 자동 점프 보조 — 전방 PIT(구덩이, 데미지 30·점프만 회피)를 자동 점프로 넘긴다.
   * 대시가 쿨일 때도 무료로 회피 가능. 어린이 방치 플레이 안전망 (검토의견 §4).
   */
  private autoJumpPit(): void {
    const p = this.game.player;
    if (p.airborne || p.dashTimer > 0) return;
    const lookAhead = Math.max(this.game.runSpeed, 8) * CONFIG.skills.autoDashLookAhead;
    for (const o of this.game.obstacles) {
      if (!o.alive || o.hitDone || o.type !== 'PIT' || o.lane !== p.lane) continue;
      const d = o.z - p.z;
      if (d > 0.3 && d < lookAhead) {
        p.tryAction('jump');
        return;
      }
    }
  }

  /** 전방 회피 불가 위협 감지 (자동 대시 트리거) */
  private detectImminentThreat(): boolean {
    const game = this.game;
    const p = game.player;
    if (p.invulnerable) return false;
    const lookAhead = Math.max(game.runSpeed, 8) * CONFIG.skills.autoDashLookAhead;

    // 플레이어 레인 장애물 근접
    for (const o of game.obstacles) {
      if (!o.alive || o.hitDone || o.lane !== p.lane) continue;
      const d = o.z - p.z;
      if (d > 0.3 && d < lookAhead) return true;
    }
    // 적 투사체 접근
    for (const proj of game.projectiles) {
      if (proj.owner !== 'enemy') continue;
      if (Math.abs(proj.position.x - laneX(p.lane)) < 1.0) {
        const d = proj.position.z - p.z;
        if (d > 0 && d < 5) return true;
      }
    }
    return false;
  }

  // ----------------------------------------------------------
  // 이펙트
  // ----------------------------------------------------------

  private spawnBlastFx(): void {
    const p = this.game.player;
    const mesh = new THREE.Mesh(ringGeo, ringMat.clone());
    mesh.position.set(p.x, 1.0, p.z + 2);
    mesh.rotation.y = Math.PI / 2;
    this.game.scene.add(mesh);
    this.fx.push({ mesh, life: 0.45 });
  }

  private updateFx(dt: number): void {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.life -= dt;
      f.mesh.scale.addScalar(dt * 22);
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, f.life / 0.45);
      if (f.life <= 0) {
        this.game.scene.remove(f.mesh);
        (f.mesh.material as THREE.Material).dispose(); // clone된 링 머티리얼 해제
        this.fx.splice(i, 1);
      }
    }
  }
}
