// ============================================================
// 인벤토리 — 재화/장비 (§11, §12)
// 장비 슬롯: 망토 / 모자. 아이템은 월드 클리어 보상 (data/worlds.ts REWARD_ITEMS)
// ============================================================

export interface Equipment {
  cape: string | null;
  hat: string | null;
}

export class Inventory {
  coins = 0;
  gems = 0;
  equipment: Equipment = { cape: null, hat: null };

  addCoins(n: number): void {
    this.coins += n;
  }

  addGems(n: number): void {
    this.gems += n;
  }

  grantItem(itemId: string, slot: 'cape' | 'hat'): void {
    this.equipment[slot] = itemId;
  }

  reset(): void {
    this.coins = 0;
    this.gems = 0;
    this.equipment = { cape: null, hat: null };
  }

  snapshot(): { coins: number; gems: number; equipment: Equipment } {
    return { coins: this.coins, gems: this.gems, equipment: { ...this.equipment } };
  }

  restore(s: { coins: number; gems: number; equipment: Equipment }): void {
    this.coins = s.coins;
    this.gems = s.gems;
    this.equipment = { ...s.equipment };
  }
}
