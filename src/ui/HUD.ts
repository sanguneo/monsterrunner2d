// ============================================================
// 인게임 HUD (§16) — 체력/거리/재화/레벨/스킬 쿨다운/보스 체력바
// DOM 오버레이 기반 (터치/마우스 공용, 세이프존 고려)
// ============================================================

import * as THREE from 'three';
import { t } from '../data/i18n';
import type { Game } from '../core/Game';
import type { SkillId } from '../systems/Combat';
import { uiIcon } from './icons';

const PHASE_COLORS = ['#22c55e', '#f97316', '#ef4444']; // P1 초록 → P2 주황 → P3 빨강 (§9.4)

// AI 생성 아이콘 (nanobanana → webp). 이모지 대체 (public/assets/icons)
/** 스킬 슬롯 아이콘 (nanobanana 생성 webp) */
const SKILL_ICON: Record<SkillId, string> = {
  blast: uiIcon('blast', 'skill-icon'),
  dash: uiIcon('dash', 'skill-icon'),
  rapidFire: uiIcon('rapid', 'skill-icon'),
  healPulse: uiIcon('heal', 'skill-icon'),
};

export class HUD {
  private root: HTMLElement;
  private el: HTMLElement;

  private hpFill!: HTMLElement;
  private hpText!: HTMLElement;
  private distEl!: HTMLElement;
  private scoreEl!: HTMLElement;
  private coinEl!: HTMLElement;
  private gemEl!: HTMLElement;
  private levelEl!: HTMLElement;
  private expFill!: HTMLElement;

  private hpBar!: HTMLElement;

  private bossWrap!: HTMLElement;
  private bossName!: HTMLElement;
  private bossFill!: HTMLElement;
  private bossTrail!: HTMLElement;
  private bossTicks!: HTMLElement;
  private bossTrailValue = 1;
  private prevBossPhase = -1;

  private skillBtns: { el: HTMLElement; cd: HTMLElement; badge: HTMLElement; wasCooling: boolean }[] = [];
  private skillLayoutKey = ''; // 현재 아크 배치가 반영한 해금 스킬 집합
  private floaters!: HTMLElement;
  private vignette!: HTMLElement;
  private shade!: HTMLElement;
  private weakPopup!: HTMLElement;
  private banner!: HTMLElement;

  private projVec = new THREE.Vector3();

  constructor(private game: Game) {
    this.root = document.getElementById('ui-root')!;
    this.el = document.createElement('div');
    this.el.id = 'hud';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="hud-top">
        <div class="hud-left">
          <div class="hp-bar"><div class="hp-fill"></div><span class="hp-text">${uiIcon('heart')} <span class="hp-num"></span></span></div>
          <div class="currency">${uiIcon('coin')} <span class="coin-count">0</span>&nbsp;&nbsp;${uiIcon('gem')} <span class="gem-count">0</span></div>
          <div class="level-row">
            <span class="level-label">Lv.<span class="level-num">1</span></span>
            <div class="exp-bar"><div class="exp-fill"></div></div>
          </div>
        </div>
        <div class="hud-center">
          <div class="distance">${uiIcon('distance')} <span class="dist-num">0m</span></div>
          <div class="score">${uiIcon('star')} <span class="score-num">0</span></div>
        </div>
        <button class="pause-btn" aria-label="pause">${uiIcon('pause', 'pause-icon')}</button>
      </div>
      <div class="boss-wrap" hidden>
        <div class="boss-name"></div>
        <div class="boss-bar">
          <div class="boss-trail"></div>
          <div class="boss-fill"></div>
          <div class="boss-ticks"></div>
        </div>
      </div>
      <div class="skills">
        <button class="skill-btn" data-skill="blast">${SKILL_ICON.blast}<div class="skill-cd"></div><span class="auto-badge"></span><span class="skill-label" data-skill-label="blast"></span></button>
        <button class="skill-btn" data-skill="dash">${SKILL_ICON.dash}<div class="skill-cd"></div><span class="auto-badge"></span><span class="skill-label" data-skill-label="dash"></span></button>
        <button class="skill-btn" data-skill="rapidFire" hidden>${SKILL_ICON.rapidFire}<div class="skill-cd"></div><span class="auto-badge"></span><span class="skill-label" data-skill-label="rapidFire"></span></button>
        <button class="skill-btn" data-skill="healPulse" hidden>${SKILL_ICON.healPulse}<div class="skill-cd"></div><span class="auto-badge"></span><span class="skill-label" data-skill-label="healPulse"></span></button>
      </div>
      <div class="floaters"></div>
      <div class="vignette"></div>
      <div class="scream-shade"></div>
      <div class="weak-popup" hidden></div>
      <div class="hud-banner" hidden></div>
    `;
    this.root.appendChild(this.el);

    this.hpBar = this.q('.hp-bar');
    this.hpFill = this.q('.hp-fill');
    this.hpText = this.q('.hp-num');
    this.distEl = this.q('.dist-num');
    this.scoreEl = this.q('.score-num');
    this.coinEl = this.q('.coin-count');
    this.gemEl = this.q('.gem-count');
    this.levelEl = this.q('.level-num');
    this.expFill = this.q('.exp-fill');
    this.bossWrap = this.q('.boss-wrap');
    this.bossName = this.q('.boss-name');
    this.bossFill = this.q('.boss-fill');
    this.bossTrail = this.q('.boss-trail');
    this.bossTicks = this.q('.boss-ticks');
    this.floaters = this.q('.floaters');
    this.vignette = this.q('.vignette');
    this.shade = this.q('.scream-shade');
    this.weakPopup = this.q('.weak-popup');
    this.banner = this.q('.hud-banner');

    this.q('.pause-btn').addEventListener('click', () => game.togglePause());

    this.el.querySelectorAll<HTMLElement>('.skill-btn').forEach((btn) => {
      const skill = btn.dataset.skill as SkillId;
      const handler = (e: Event) => {
        e.preventDefault();
        game.combat.useSkill(skill);
      };
      btn.addEventListener('click', handler);
      btn.addEventListener('touchstart', handler, { passive: false });
      this.skillBtns.push({
        el: btn,
        cd: btn.querySelector('.skill-cd')!,
        badge: btn.querySelector('.auto-badge')!,
        wasCooling: false,
      });
    });
  }

  private q(sel: string): HTMLElement {
    return this.el.querySelector(sel) as HTMLElement;
  }

  show(): void {
    this.el.hidden = false;
  }

  hide(): void {
    this.el.hidden = true;
    this.hideBossBar();
    this.setShade(0);
    this.weakPopup.hidden = true;
  }

  /**
   * 스킬 버튼 반원 아크 배치 — 중심은 우하단 코너(.skills 앵커).
   * 해금된(표시되는) 스킬 개수 N에 따라 반지름·각도를 동적으로 계산한다.
   * 개수가 적으면 원이 작아지고, 항상 균등한 간격을 유지한다.
   */
  private layoutSkills(): void {
    const order: SkillId[] = ['blast', 'dash', 'rapidFire', 'healPulse'];
    const visible = order.filter((id) => this.game.skillUnlocked(id));
    const key = visible.join(',');
    if (key === this.skillLayoutKey) return;
    this.skillLayoutKey = key;

    const BTN = 82; // .skill-btn 크기와 일치
    const GAP = 30; // 버튼 사이 최소 여백(px)
    const S = BTN + GAP; // 중심 간 목표 현(chord) 길이
    const N = visible.length;
    const aMin = (18 * Math.PI) / 180;
    const aMax = (84 * Math.PI) / 180;
    const dθ = N > 1 ? (aMax - aMin) / (N - 1) : 0;
    // 현(chord) = 2R·sin(dθ/2) = S  → R = S / (2 sin(dθ/2)). N=1이면 고정 반지름.
    const R = N > 1 ? S / (2 * Math.sin(dθ / 2)) : 150;

    visible.forEach((id, i) => {
      const ang = N > 1 ? aMin + dθ * i : (51 * Math.PI) / 180;
      const right = Math.round(R * Math.cos(ang) - BTN / 2);
      const bottom = Math.round(R * Math.sin(ang) - BTN / 2);
      const btn = this.skillBtns.find((b) => b.el.dataset.skill === id);
      if (btn) {
        btn.el.style.right = `${right}px`;
        btn.el.style.bottom = `${bottom}px`;
      }
    });
  }

  // ----------------------------------------------------------
  // 매 프레임 갱신
  // ----------------------------------------------------------

  update(dt: number): void {
    const game = this.game;
    const p = game.player;

    const hpFrac = Math.max(0, p.hp / p.maxHp);
    this.hpFill.style.width = `${hpFrac * 100}%`;
    this.hpFill.style.background = hpFrac > 0.5 ? '#4ade80' : hpFrac > 0.25 ? '#facc15' : '#ef4444';
    this.hpText.textContent = `${Math.ceil(p.hp)}/${p.maxHp}`;
    this.hpBar.classList.toggle('danger', hpFrac <= 0.25 && hpFrac > 0);

    this.distEl.textContent = `${Math.floor(game.distance)}${t('misc.meters')}`;
    this.scoreEl.textContent = `${game.score().toLocaleString()}`;
    this.coinEl.textContent = `${game.inventory.coins}`;
    this.gemEl.textContent = `${game.inventory.gems}`;
    this.levelEl.textContent = `${p.level}`;
    this.expFill.style.width = `${(p.exp / p.expToNext) * 100}%`;

    // 스킬 쿨다운 원형 게이지 + AUTO 배지 + READY 글로우 (§8.2, §13.1)
    const ids: SkillId[] = ['blast', 'dash', 'rapidFire', 'healPulse'];
    const labelKeys: Record<SkillId, string> = {
      blast: 'hud.skill.blast',
      dash: 'hud.skill.dash',
      rapidFire: 'hud.skill.rapidFire',
      healPulse: 'hud.skill.healPulse',
    };
    this.skillBtns.forEach((btn, i) => {
      const id = ids[i];
      // 미해금 스킬 슬롯은 숨김 (§8.1 월드 해금)
      const unlocked = game.skillUnlocked(id);
      btn.el.hidden = !unlocked;
      if (!unlocked) return;
      const remain = game.combat.cooldowns[id];
      const max = game.combat.cooldownMax[id];
      const frac = remain / max;
      if (frac > 0) {
        btn.cd.style.display = 'block';
        btn.cd.style.background = `conic-gradient(rgba(0,0,0,0.72) ${frac * 360}deg, transparent 0deg)`;
        btn.el.classList.add('cooling');
        btn.el.classList.remove('ready');
        btn.wasCooling = true;
      } else {
        btn.cd.style.display = 'none';
        btn.el.classList.remove('cooling');
        if (btn.wasCooling) {
          btn.el.classList.remove('ready');
          void btn.el.offsetWidth; // reflow로 애니메이션 재시작
          btn.el.classList.add('ready');
          btn.wasCooling = false;
        }
      }
      btn.badge.textContent = t('hud.auto');
      btn.badge.style.display = game.autoSkill ? 'block' : 'none';
      const labelEl = btn.el.querySelector<HTMLElement>('[data-skill-label]');
      if (labelEl) labelEl.textContent = t(labelKeys[id]);
    });
    this.layoutSkills();

    // 보스 체력바
    const boss = game.boss;
    if (boss && !this.bossWrap.hidden) {
      const frac = boss.hpFrac;
      this.bossFill.style.width = `${frac * 100}%`;
      this.bossFill.style.background = PHASE_COLORS[Math.min(boss.phaseIdx, PHASE_COLORS.length - 1)];
      // 페이즈 전환 셰이크
      if (this.prevBossPhase !== -1 && boss.phaseIdx !== this.prevBossPhase) {
        this.bossWrap.classList.remove('phase-break');
        void this.bossWrap.offsetWidth;
        this.bossWrap.classList.add('phase-break');
        this.bossWrap.addEventListener('animationend', () => this.bossWrap.classList.remove('phase-break'), {
          once: true,
        });
      }
      this.prevBossPhase = boss.phaseIdx;
      // 흰색 잔상 (딜레이 감소 — §9.4)
      this.bossTrailValue = Math.max(frac, this.bossTrailValue - dt * 0.25);
      this.bossTrail.style.width = `${this.bossTrailValue * 100}%`;

      // 약점 팝업 — 보스 머리 위 (§9.4)
      if (boss.staggered) {
        this.weakPopup.hidden = false;
        this.weakPopup.textContent = `▼ ${t('boss.weak')} ▼`;
        const sp = this.project(boss.position.clone().setY(3.4));
        this.weakPopup.style.left = `${sp.x}px`;
        this.weakPopup.style.top = `${sp.y}px`;
      } else {
        this.weakPopup.hidden = true;
      }
    } else {
      this.weakPopup.hidden = true;
    }
  }

  // ----------------------------------------------------------
  // 보스 바
  // ----------------------------------------------------------

  showBossBar(nameKey: string, phaseFroms: number[]): void {
    this.bossWrap.hidden = false;
    this.bossName.textContent = t(nameKey);
    this.bossTrailValue = 1;
    this.prevBossPhase = 0;
    // 페이즈 경계 눈금 (§9.4)
    this.bossTicks.innerHTML = '';
    phaseFroms
      .filter((f) => f < 1)
      .forEach((f) => {
        const tick = document.createElement('div');
        tick.className = 'boss-tick';
        tick.style.left = `${f * 100}%`;
        this.bossTicks.appendChild(tick);
      });
  }

  hideBossBar(): void {
    this.bossWrap.hidden = true;
    this.prevBossPhase = -1;
  }

  // ----------------------------------------------------------
  // 연출 (플로팅 텍스트 / 플래시 / 셰이드 / 배너)
  // ----------------------------------------------------------

  private project(pos: THREE.Vector3): { x: number; y: number } {
    this.projVec.copy(pos).project(this.game.cameraCtl.camera);
    return {
      x: (this.projVec.x * 0.5 + 0.5) * window.innerWidth,
      y: (-this.projVec.y * 0.5 + 0.5) * window.innerHeight,
    };
  }

  floatTextWorld(pos: THREE.Vector3, text: string, cls: string): void {
    if (this.el.hidden) return;
    const sp = this.project(pos);
    const div = document.createElement('div');
    div.className = `floater ${cls}`;
    div.innerHTML = text; // 아이콘 img 포함 가능 (내부 생성 문자열만 사용)
    div.style.left = `${sp.x}px`;
    div.style.top = `${sp.y}px`;
    this.floaters.appendChild(div);
    setTimeout(() => div.remove(), 950);
  }

  /** 피격 빨강 비네트 */
  damageFlash(): void {
    this.vignette.classList.remove('flash');
    void this.vignette.offsetWidth; // reflow로 애니메이션 재시작
    this.vignette.classList.add('flash');
  }

  /** 화면 전체 플래시 (페이즈 전환/레벨업) */
  flashScreen(color: string, duration: number): void {
    const div = document.createElement('div');
    div.className = 'screen-flash';
    div.style.background = color;
    div.style.animationDuration = `${duration}s`;
    this.el.appendChild(div);
    setTimeout(() => div.remove(), duration * 1000 + 60);
  }

  /** 비명 가장자리 어둡게 (§9.4) */
  setShade(opacity: number): void {
    this.shade.style.opacity = `${opacity}`;
  }

  /** 중앙 배너 (보스 등장 등) */
  showBanner(text: string, duration = 1.6): void {
    this.banner.innerHTML = text; // 아이콘 img 포함 가능 (내부 생성 문자열만 사용)
    this.banner.hidden = false;
    this.banner.classList.remove('pop');
    void this.banner.offsetWidth;
    this.banner.classList.add('pop');
    setTimeout(() => {
      this.banner.hidden = true;
    }, duration * 1000);
  }
}
