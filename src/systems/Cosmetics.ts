// ============================================================
// 꾸미기 — 장비 장착 외형 반영 (§12)
// 슬롯: 망토 / 모자. 스탯 효과 없음(외형만).
// ============================================================

import { REWARD_ITEMS } from '../data/worlds';
import type { Player } from '../entities/Player';
import type { Inventory } from './Inventory';

export class Cosmetics {
  /** 인벤토리 장비 상태를 플레이어 외형에 반영 */
  apply(player: Player, inventory: Inventory): void {
    const cape = inventory.equipment.cape ? REWARD_ITEMS[inventory.equipment.cape] : null;
    if (cape) player.equipCape(cape.color);
    else player.unequipCape();

    const hat = inventory.equipment.hat ? REWARD_ITEMS[inventory.equipment.hat] : null;
    if (hat) player.equipHat(hat.color);
    else player.unequipHat();
  }
}
