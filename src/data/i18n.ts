// ============================================================
// i18n — 한국어 기본 + 영어 전환 (§17)
// 모든 UI 문자열은 하드코딩 금지, 키 참조.
// ============================================================

import { CONFIG } from './config';

export type Locale = 'ko' | 'en';

const STRINGS: Record<Locale, Record<string, string>> = {
  ko: {
    'title.name': '몬스터 헌터 러너',
    'title.subtitle': '6개의 월드, 6명의 몬스터 왕',
    'title.start': '시작하기',
    'title.tutorialReplay': '튜토리얼 다시 보기',
    'title.highscore': '최고 점수',
    'title.selectWorld': '월드 선택',

    'world.school': '학교 유령',
    'world.zombie': '좀비 마을',
    'world.lab': '프랑켄슈타인 연구소',
    'world.sea': '바다마녀의 심해',
    'world.dracula': '드라큘라 성',
    'world.skull': '해골왕의 성',
    'settings.title': '설정',
    'settings.autoSkill': '자동 스킬',
    'settings.language': '언어',
    'settings.on': '켬',
    'settings.off': '끔',

    'hud.auto': 'AUTO',
    'hud.phase': '페이즈',

    'boss.ghostTeacher': '유령 선생님',
    'boss.ghostGirl': '학교 괴담 소녀',
    'boss.giantZombie': '거대 좀비',
    'boss.zombieKing': '좀비 킹',
    'boss.lightningGolem': '번개 골렘',
    'boss.frankenstein': '프랑켄슈타인',
    'boss.kraken': '크라켄',
    'boss.seaWitch': '바다마녀',
    'boss.werewolfChief': '늑대인간 대장',
    'boss.dracula': '드라큘라',
    'boss.skeletonKnight': '해골 기사',
    'boss.skullKing': '해골왕',
    'boss.weak': '약점!',
    'boss.incoming': '보스 등장!',

    'tut.run': '달리기는 저절로 돼요!',
    'tut.lane': '← → 키 / 좌우로 밀어서 보석을 먹어요!',
    'tut.jump': '위로! 점프! (↑ 키 / 위로 밀기)',
    'tut.slide': '아래로! 숙이기! (↓ 키 / 아래로 밀기)',
    'tut.autofire': '공격은 저절로! 유령을 물리쳐요!',
    'tut.skillAuto': '스킬도 자동이에요! (AUTO 배지를 봐요)',
    'tut.skillManual': 'Q / E 키나 버튼으로 필살기!',
    'tut.skip': '건너뛰기 ▶',
    'tut.ready': '준비 완료!',

    'reward.title': '스테이지 클리어!',
    'reward.got': '획득!',
    'reward.tap': '화면을 눌러 계속',
    'reward.ghost_cape': '유령 망토',
    'reward.zombie_hat': '좀비 모자',
    'reward.lightning_helmet': '번개 헬멧',
    'reward.seawitch_crown': '바다마녀 왕관',
    'reward.dracula_cape': '드라큘라 망토',
    'reward.skull_crown': '해골왕 왕관',

    'result.title': '결과',
    'result.level': '도달 레벨',
    'result.kills': '몬스터 처치',
    'result.bosses': '보스 처치',
    'result.coins': '동전',
    'result.gems': '보석',
    'result.distance': '달린 거리',
    'result.score': '점수',
    'result.newRecord': '🎉 신기록!',
    'result.nextWorld': '다음 월드 ▶',
    'result.master': '👑 몬스터 마스터 달성!',
    'result.retry': '다시 하기',
    'result.toTitle': '타이틀로',

    'over.title': '게임 오버',
    'over.revive': '💫 체크포인트에서 부활',

    'pause.title': '일시정지',
    'pause.resume': '계속하기',
    'pause.toTitle': '그만하기',

    'float.levelup': '레벨 업!',
    'float.heal': '회복!',
    'misc.victory': '승리!',
    'misc.meters': 'm',
  },
  en: {
    'title.name': 'Monster Hunter Runner',
    'title.subtitle': '6 worlds, 6 monster kings',
    'title.start': 'START',
    'title.tutorialReplay': 'Replay Tutorial',
    'title.highscore': 'High Score',
    'title.selectWorld': 'Select World',

    'world.school': 'School Ghosts',
    'world.zombie': 'Zombie Village',
    'world.lab': 'Frankenstein Lab',
    'world.sea': 'Sea Witch Depths',
    'world.dracula': 'Dracula Castle',
    'world.skull': 'Skull King Castle',
    'settings.title': 'Settings',
    'settings.autoSkill': 'Auto Skill',
    'settings.language': 'Language',
    'settings.on': 'ON',
    'settings.off': 'OFF',

    'hud.auto': 'AUTO',
    'hud.phase': 'Phase',

    'boss.ghostTeacher': 'Ghost Teacher',
    'boss.ghostGirl': 'Phantom School Girl',
    'boss.giantZombie': 'Giant Zombie',
    'boss.zombieKing': 'Zombie King',
    'boss.lightningGolem': 'Lightning Golem',
    'boss.frankenstein': 'Frankenstein',
    'boss.kraken': 'Kraken',
    'boss.seaWitch': 'Sea Witch',
    'boss.werewolfChief': 'Werewolf Chief',
    'boss.dracula': 'Dracula',
    'boss.skeletonKnight': 'Skeleton Knight',
    'boss.skullKing': 'Skull King',
    'boss.weak': 'WEAK SPOT!',
    'boss.incoming': 'BOSS!',

    'tut.run': 'Running is automatic!',
    'tut.lane': '← → keys / swipe to grab the gem!',
    'tut.jump': 'Jump! (↑ key / swipe up)',
    'tut.slide': 'Slide! (↓ key / swipe down)',
    'tut.autofire': 'Attacks are automatic! Beat the ghost!',
    'tut.skillAuto': 'Skills are automatic too! (See the AUTO badge)',
    'tut.skillManual': 'Press Q / E or the buttons for skills!',
    'tut.skip': 'Skip ▶',
    'tut.ready': 'Ready!',

    'reward.title': 'STAGE CLEAR!',
    'reward.got': 'acquired!',
    'reward.tap': 'Tap to continue',
    'reward.ghost_cape': 'Ghost Cape',
    'reward.zombie_hat': 'Zombie Hat',
    'reward.lightning_helmet': 'Lightning Helmet',
    'reward.seawitch_crown': 'Sea Witch Crown',
    'reward.dracula_cape': 'Dracula Cape',
    'reward.skull_crown': 'Skull King Crown',

    'result.title': 'Results',
    'result.level': 'Level Reached',
    'result.kills': 'Monsters Defeated',
    'result.bosses': 'Bosses Defeated',
    'result.coins': 'Coins',
    'result.gems': 'Gems',
    'result.distance': 'Distance',
    'result.score': 'Score',
    'result.newRecord': '🎉 New Record!',
    'result.nextWorld': 'Next World ▶',
    'result.master': '👑 MONSTER MASTER!',
    'result.retry': 'Retry',
    'result.toTitle': 'Title',

    'over.title': 'GAME OVER',
    'over.revive': '💫 Revive at Checkpoint',

    'pause.title': 'Paused',
    'pause.resume': 'Resume',
    'pause.toTitle': 'Quit',

    'float.levelup': 'LEVEL UP!',
    'float.heal': 'Heal!',
    'misc.victory': 'VICTORY!',
    'misc.meters': 'm',
  },
};

let currentLocale: Locale = CONFIG.i18n.defaultLocale;
const listeners: Array<() => void> = [];

export function t(key: string): string {
  return STRINGS[currentLocale][key] ?? STRINGS.ko[key] ?? key;
}

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  if (locale === currentLocale) return;
  currentLocale = locale;
  listeners.forEach((fn) => fn());
}

export function onLocaleChange(fn: () => void): void {
  listeners.push(fn);
}
