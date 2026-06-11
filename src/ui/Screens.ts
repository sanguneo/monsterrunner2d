// ============================================================
// 화면 오버레이 — 타이틀/일시정지/결과/게임오버/보상/튜토리얼 (§16)
// 모든 문자열은 i18n 키 참조 (§17)
// ============================================================

import { t, getLocale, setLocale, onLocaleChange } from '../data/i18n';
import type { Locale } from '../data/i18n';
import { WORLDS, REWARD_ITEMS, worldImage, rewardImage, TITLE_BG_IMAGE } from '../data/worlds';
import type { Game } from '../core/Game';

export interface ResultData {
  level: number;
  kills: number;
  bossKills: number;
  coins: number;
  gems: number;
  distance: number;
  score: number;
  isNewRecord: boolean;
  hasNextWorld: boolean;
  isAllClear: boolean;
}

export interface RewardData {
  itemId: string;
  emoji: string;
  nameKey: string;
}

export interface GameOverData {
  distance: number;
  level: number;
  coins: number;
  score: number;
  canRevive: boolean;
}

type ScreenName = 'title' | 'pause' | 'result' | 'gameover' | 'reward' | 'stageintro' | null;

export class Screens {
  private root: HTMLElement;
  private overlay: HTMLElement;
  private current: ScreenName = null;
  private currentData: unknown = null;

  // 튜토리얼 UI
  private tutPrompt: HTMLElement;
  private tutSkip: HTMLElement;
  private onSkip: (() => void) | null = null;

  constructor(private game: Game) {
    this.root = document.getElementById('ui-root')!;
    this.overlay = document.createElement('div');
    this.overlay.id = 'screen-overlay';
    this.overlay.hidden = true;
    this.root.appendChild(this.overlay);

    this.tutPrompt = document.createElement('div');
    this.tutPrompt.id = 'tut-prompt';
    this.tutPrompt.hidden = true;
    this.root.appendChild(this.tutPrompt);

    this.tutSkip = document.createElement('button');
    this.tutSkip.id = 'tut-skip';
    this.tutSkip.hidden = true;
    this.tutSkip.addEventListener('click', () => this.onSkip?.());
    this.root.appendChild(this.tutSkip);

    onLocaleChange(() => this.rerender());

    // 이미지 에셋 프리로드 (스테이지 인트로/보상 화면 즉시 표시용)
    new Image().src = TITLE_BG_IMAGE;
    WORLDS.forEach((_, i) => (new Image().src = worldImage(i)));
    Object.keys(REWARD_ITEMS).forEach((id) => (new Image().src = rewardImage(id)));
  }

  private rerender(): void {
    if (this.current === 'title') this.showTitle();
    else if (this.current === 'pause') this.showPause();
    else if (this.current === 'result') this.showResult(this.currentData as ResultData);
    else if (this.current === 'gameover') this.showGameOver(this.currentData as GameOverData);
    else if (this.current === 'reward') this.showReward(this.currentData as RewardData);
    this.tutSkip.textContent = t('tut.skip');
  }

  hide(): void {
    this.overlay.hidden = true;
    this.overlay.classList.remove('title-bg');
    this.current = null;
  }

  /** 화면 표시 공통 준비 — 타이틀 배경 이미지는 타이틀에서만 */
  private open(name: Exclude<ScreenName, null>): void {
    this.current = name;
    this.overlay.hidden = false;
    this.overlay.classList.toggle('title-bg', name === 'title');
  }

  // ----------------------------------------------------------
  // 타이틀 (§16): 시작 / 설정(자동 스킬·언어) / 튜토리얼 다시 보기
  // ----------------------------------------------------------

  showTitle(): void {
    this.open('title');
    const high = this.game.loadHighScore();
    const unlocked = this.game.unlockedWorldIdx();
    const worldBtns = WORLDS.map((w, i) => {
      const locked = i > unlocked;
      const selected = i === this.game.worldIdx;
      return `<button class="world-btn ${selected ? 'selected' : ''} ${locked ? 'locked' : ''}"
        data-world="${i}" ${locked ? 'disabled' : ''} title="${t(w.nameKey)}"
        style="background-image:url('${worldImage(i)}')">
        ${locked ? '<span class="world-lock">🔒</span>' : ''}<span class="world-num">${i + 1}</span>
      </button>`;
    }).join('');

    this.overlay.innerHTML = `
      <div class="screen title-screen">
        <div class="game-logo">👻</div>
        <h1 class="game-title">${t('title.name')}</h1>
        <p class="game-subtitle">${t('title.subtitle')}</p>
        ${high > 0 ? `<p class="highscore">🏆 ${t('title.highscore')}: ${high.toLocaleString()}</p>` : ''}
        <div class="world-select">
          <div class="settings-title">${t('title.selectWorld')}</div>
          <div class="world-grid">${worldBtns}</div>
          <p class="world-name">${this.game.world.emoji} ${t(this.game.world.nameKey)}</p>
        </div>
        <button class="btn btn-primary" data-act="start">${t('title.start')}</button>
        <button class="btn" data-act="tutorial">${t('title.tutorialReplay')}</button>
        <div class="settings-box">
          <div class="settings-title">${t('settings.title')}</div>
          <label class="setting-row">
            <span>${t('settings.autoSkill')}</span>
            <button class="toggle ${this.game.autoSkill ? 'on' : ''}" data-act="autoskill">
              ${this.game.autoSkill ? t('settings.on') : t('settings.off')}
            </button>
          </label>
          <label class="setting-row">
            <span>${t('settings.language')}</span>
            <button class="toggle" data-act="lang">${getLocale() === 'ko' ? '한국어' : 'English'}</button>
          </label>
        </div>
      </div>
    `;
    this.overlay.querySelectorAll<HTMLElement>('.world-btn:not(.locked)').forEach((el) => {
      el.addEventListener('click', () => {
        this.game.sound.play('uiClick');
        this.game.selectWorld(parseInt(el.dataset.world!, 10));
      });
    });
    this.bind('start', () => this.game.startRun(false));
    this.bind('tutorial', () => this.game.startRun(true));
    this.bind('autoskill', () => {
      this.game.setAutoSkill(!this.game.autoSkill);
      this.showTitle();
    });
    this.bind('lang', () => {
      const next: Locale = getLocale() === 'ko' ? 'en' : 'ko';
      setLocale(next);
    });
  }

  // ----------------------------------------------------------
  // 일시정지 (§15.4) — 자동 스킬 토글 게임 중 즉시 전환 (§13.1)
  // ----------------------------------------------------------

  showPause(): void {
    this.open('pause');
    this.overlay.innerHTML = `
      <div class="screen pause-screen">
        <h2>${t('pause.title')}</h2>
        <button class="btn btn-primary" data-act="resume">${t('pause.resume')}</button>
        <label class="setting-row">
          <span>${t('settings.autoSkill')}</span>
          <button class="toggle ${this.game.autoSkill ? 'on' : ''}" data-act="autoskill">
            ${this.game.autoSkill ? t('settings.on') : t('settings.off')}
          </button>
        </label>
        <button class="btn" data-act="title">${t('pause.toTitle')}</button>
      </div>
    `;
    this.bind('resume', () => this.game.togglePause());
    this.bind('autoskill', () => {
      this.game.setAutoSkill(!this.game.autoSkill);
      this.showPause();
    });
    this.bind('title', () => {
      this.game.togglePause();
      this.game.toTitle();
    });
  }

  // ----------------------------------------------------------
  // 보상 연출 (§15.2 REWARD)
  // ----------------------------------------------------------

  showReward(data: RewardData): void {
    this.open('reward');
    this.currentData = data;
    this.overlay.innerHTML = `
      <div class="screen reward-screen" data-act="continue">
        <h2 class="reward-title">${t('reward.title')}</h2>
        <img class="reward-img" src="${rewardImage(data.itemId)}" alt="${t(data.nameKey)}" />
        <p class="reward-text">${data.emoji} ${t(data.nameKey)} ${t('reward.got')}</p>
        <p class="reward-tap">${t('reward.tap')}</p>
      </div>
    `;
    this.bind('continue', () => this.game.onRewardDone());
  }

  // ----------------------------------------------------------
  // 스테이지 인트로 — 월드 이미지 먼저 표시 후 출발
  // ----------------------------------------------------------

  showStageIntro(worldIdx: number): void {
    this.open('stageintro');
    const w = WORLDS[worldIdx];
    this.overlay.innerHTML = `
      <div class="screen stage-intro" data-act="go">
        <div class="stage-label">${t('stage.world')} ${worldIdx + 1}</div>
        <img class="stage-img" src="${worldImage(worldIdx)}" alt="${t(w.nameKey)}" />
        <h2 class="stage-name">${w.emoji} ${t(w.nameKey)}</h2>
        <p class="stage-tap">${t('stage.tapToStart')}</p>
      </div>
    `;
    this.bind('go', () => this.game.dismissStageIntro());
  }

  hideStageIntro(): void {
    if (this.current === 'stageintro') this.hide();
  }

  get isStageIntroVisible(): boolean {
    return this.current === 'stageintro';
  }

  // ----------------------------------------------------------
  // 결과 화면 (§16)
  // ----------------------------------------------------------

  showResult(data: ResultData): void {
    this.open('result');
    this.currentData = data;
    this.overlay.innerHTML = `
      <div class="screen result-screen">
        <h2>🎉 ${t('result.title')}</h2>
        ${data.isAllClear ? `<p class="master-title">${t('result.master')}</p>` : ''}
        ${data.isNewRecord ? `<p class="new-record">${t('result.newRecord')}</p>` : ''}
        <div class="stat-grid">
          <div class="stat"><span>${t('result.score')}</span><b>${data.score.toLocaleString()}</b></div>
          <div class="stat"><span>${t('result.distance')}</span><b>${Math.floor(data.distance)}m</b></div>
          <div class="stat"><span>${t('result.level')}</span><b>Lv.${data.level}</b></div>
          <div class="stat"><span>${t('result.kills')}</span><b>${data.kills}</b></div>
          <div class="stat"><span>${t('result.bosses')}</span><b>${data.bossKills}</b></div>
          <div class="stat"><span>${t('result.coins')}</span><b>🪙 ${data.coins}</b></div>
          <div class="stat"><span>${t('result.gems')}</span><b>💎 ${data.gems}</b></div>
        </div>
        ${data.hasNextWorld ? `<button class="btn btn-primary" data-act="next">${t('result.nextWorld')}</button>` : ''}
        <button class="btn ${data.hasNextWorld ? '' : 'btn-primary'}" data-act="retry">${t('result.retry')}</button>
        <button class="btn" data-act="title">${t('result.toTitle')}</button>
      </div>
    `;
    if (data.hasNextWorld) this.bind('next', () => this.game.startNextWorld());
    this.bind('retry', () => this.game.restartRun());
    this.bind('title', () => this.game.toTitle());
  }

  // ----------------------------------------------------------
  // 게임오버 (§16) + 체크포인트 부활 (§15.3)
  // ----------------------------------------------------------

  showGameOver(data: GameOverData): void {
    this.open('gameover');
    this.currentData = data;
    this.overlay.innerHTML = `
      <div class="screen gameover-screen">
        <h2>💀 ${t('over.title')}</h2>
        <div class="stat-grid">
          <div class="stat"><span>${t('result.distance')}</span><b>${Math.floor(data.distance)}m</b></div>
          <div class="stat"><span>${t('result.level')}</span><b>Lv.${data.level}</b></div>
          <div class="stat"><span>${t('result.coins')}</span><b>🪙 ${data.coins}</b></div>
          <div class="stat"><span>${t('result.score')}</span><b>${data.score.toLocaleString()}</b></div>
        </div>
        ${data.canRevive ? `<button class="btn btn-primary" data-act="revive">${t('over.revive')}</button>` : ''}
        <button class="btn ${data.canRevive ? '' : 'btn-primary'}" data-act="retry">${t('result.retry')}</button>
        <button class="btn" data-act="title">${t('result.toTitle')}</button>
      </div>
    `;
    if (data.canRevive) this.bind('revive', () => this.game.revive());
    this.bind('retry', () => this.game.restartRun());
    this.bind('title', () => this.game.toTitle());
  }

  // ----------------------------------------------------------
  // 튜토리얼 프롬프트 (§14)
  // ----------------------------------------------------------

  showTutorialPrompt(textKey: string): void {
    this.tutPrompt.hidden = false;
    this.tutPrompt.textContent = t(textKey);
  }

  showTutorialText(text: string): void {
    this.tutPrompt.hidden = false;
    this.tutPrompt.textContent = text;
  }

  hideTutorialPrompt(): void {
    this.tutPrompt.hidden = true;
  }

  showTutorialSkip(onSkip: () => void): void {
    this.onSkip = onSkip;
    this.tutSkip.textContent = t('tut.skip');
    this.tutSkip.hidden = false;
  }

  hideTutorialSkip(): void {
    this.tutSkip.hidden = true;
    this.onSkip = null;
  }

  // ----------------------------------------------------------

  private bind(act: string, fn: () => void): void {
    this.overlay.querySelectorAll<HTMLElement>(`[data-act="${act}"]`).forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.game.sound.play('uiClick');
        fn();
      });
    });
  }
}
