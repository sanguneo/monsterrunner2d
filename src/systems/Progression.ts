// ============================================================
// 성장 — 경험치 → 레벨업 → 능력치 자동 분배 (§10)
// ============================================================

import { CONFIG } from '../data/config';
import { t } from '../data/i18n';
import type { Game } from '../core/Game';

export class Progression {
  constructor(private game: Game) {}

  /** 경험치 획득. 튜토리얼 중에는 무EXP (§14). */
  addExp(amount: number): void {
    if (this.game.inTutorial) return;
    const p = this.game.player;
    p.exp += amount;
    while (p.exp >= p.expToNext) {
      p.exp -= p.expToNext;
      this.levelUp();
    }
  }

  private levelUp(): void {
    const p = this.game.player;
    p.level += 1;
    p.maxHp += CONFIG.player.hpPerLevel;
    p.hp = Math.min(p.maxHp, p.hp + CONFIG.player.hpPerLevel);
    p.attack += CONFIG.player.attackPerLevel;
    p.critChance += CONFIG.player.critPerLevel;
    p.expToNext = CONFIG.progression.expCurve(p.level);

    this.game.sound.play('levelUp');
    this.game.hud.floatTextWorld(p.worldX, p.lane, t('float.levelup'), 'levelup', 2.2);
    this.game.hud.flashScreen('#ffd54a', 0.15);
  }
}
