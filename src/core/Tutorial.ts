// ============================================================
// 튜토리얼 — 6단계 안전 학습 구간 (§14)
// 무피해 · 무게임오버 · 무EXP. 대기-성공(wait-for-success) 방식.
// ============================================================

import { CONFIG } from '../data/config';
import type { Game } from './Game';
import type { Pickup } from '../entities/Pickup';
import type { Obstacle } from '../entities/Obstacle';
import type { Monster } from '../entities/Monster';

type StepName = (typeof CONFIG.tutorial.steps)[number];

export class Tutorial {
  finished = false;

  private stepIdx = 0;
  private phase: 'setup' | 'wait' | 'outro' = 'setup';
  private timer = 0;

  private targetPickup: Pickup | null = null;
  private targetObstacle: Obstacle | null = null;
  private targetMonster: Monster | null = null;
  private actionSucceeded = false;
  private retrySide = 1; // 레인 이동 학습: 좌우 번갈아

  constructor(private game: Game) {}

  start(): void {
    this.stepIdx = 0;
    this.phase = 'setup';
    this.game.screens.showTutorialSkip(() => this.skip());
  }

  skip(): void {
    this.cleanup();
    this.finished = true;
  }

  private get step(): StepName {
    return CONFIG.tutorial.steps[this.stepIdx];
  }

  update(dt: number): void {
    if (this.finished) return;
    const game = this.game;
    const p = game.player;

    if (this.phase === 'outro') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.cleanup();
        this.finished = true;
      }
      return;
    }

    if (this.phase === 'setup') {
      this.setupStep();
      this.phase = 'wait';
      return;
    }

    // --- wait: 단계별 성공 조건 검사 (§14.2) ---
    switch (this.step) {
      case 'run':
        this.timer -= dt;
        if (this.timer <= 0) this.nextStep();
        break;

      case 'lane': {
        const pk = this.targetPickup;
        if (!pk) break;
        if (pk.collected) {
          this.nextStep();
        } else if (!pk.alive || pk.z < p.z - 1.5) {
          this.respawn(); // 놓침 — 처벌 없이 반복
        }
        break;
      }

      case 'jump': {
        const o = this.targetObstacle;
        if (!o) break;
        if (Math.abs(p.z - o.z) < 0.7 && p.y > 0.35) this.actionSucceeded = true;
        if (o.z < p.z - 1.5) {
          if (this.actionSucceeded) this.nextStep();
          else this.respawn();
        }
        break;
      }

      case 'slide': {
        const o = this.targetObstacle;
        if (!o) break;
        if (Math.abs(p.z - o.z) < 0.7 && p.sliding) this.actionSucceeded = true;
        if (o.z < p.z - 1.5) {
          if (this.actionSucceeded) this.nextStep();
          else this.respawn();
        }
        break;
      }

      case 'autofire': {
        const m = this.targetMonster;
        if (!m) break;
        if (!m.alive && m.hp <= 0) {
          this.nextStep(); // 자동 사격으로 처치 성공
        } else if (!m.alive || m.z < p.z - 1.5) {
          this.respawn();
        }
        break;
      }

      case 'skill': {
        if (this.game.autoSkill) {
          // 자동 모드: AUTO 배지 안내만 — 일정 시간 노출
          this.timer -= dt;
          if (this.timer <= 0) this.complete();
        } else {
          // 수동: Q/E 1회 시전 성공 시
          const cd = this.game.combat.cooldowns;
          if (cd.blast > 0 || cd.dash > 0) this.complete();
        }
        break;
      }
    }
  }

  private setupStep(): void {
    const game = this.game;
    const p = game.player;
    this.actionSucceeded = false;

    switch (this.step) {
      case 'run':
        game.screens.showTutorialPrompt('tut.run');
        this.timer = 2.5;
        break;

      case 'lane': {
        game.screens.showTutorialPrompt('tut.lane');
        let lane = p.lane + this.retrySide;
        if (lane < 0 || lane > 2) lane = p.lane - this.retrySide;
        this.retrySide *= -1;
        this.targetPickup = game.spawnPickup('gem', lane, p.z + 24, 0.9);
        break;
      }

      case 'jump':
        game.screens.showTutorialPrompt('tut.jump');
        this.targetObstacle = game.spawnObstacle('LOW', p.lane, p.z + 24);
        break;

      case 'slide':
        game.screens.showTutorialPrompt('tut.slide');
        this.targetObstacle = game.spawnObstacle('HIGH', p.lane, p.z + 24);
        break;

      case 'autofire':
        game.screens.showTutorialPrompt('tut.autofire');
        // 현재 월드의 최약체([2]) 몬스터로 학습
        this.targetMonster = game.spawnMonster(game.world.monsters[2], p.lane, p.z + 20);
        break;

      case 'skill':
        game.screens.showTutorialPrompt(game.autoSkill ? 'tut.skillAuto' : 'tut.skillManual');
        this.timer = 3.0;
        break;
    }
  }

  /** 실패 시 데미지 0, 같은 단계 반복 (§14.1) */
  private respawn(): void {
    this.phase = 'setup';
  }

  private nextStep(): void {
    this.stepIdx++;
    if (this.stepIdx >= CONFIG.tutorial.steps.length) {
      this.complete();
    } else {
      this.phase = 'setup';
    }
  }

  private complete(): void {
    this.game.screens.showTutorialPrompt('tut.ready');
    this.phase = 'outro';
    this.timer = 1.3;
  }

  private cleanup(): void {
    this.game.screens.hideTutorialPrompt();
    this.game.screens.hideTutorialSkip();
  }
}
