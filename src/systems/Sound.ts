// ============================================================
// 사운드 매니저 — 인터페이스 구조만 구현 (§18)
// 실제 오디오 에셋은 폴리싱 단계. 게임 로직은 호출 지점만 갖추고 무음 동작.
// ============================================================

export type SoundId =
  | 'laneMove'
  | 'coin'
  | 'gem'
  | 'heal'
  | 'shoot'
  | 'hitPlayer'
  | 'hitMonster'
  | 'kill'
  | 'skillBlast'
  | 'skillDash'
  | 'levelUp'
  | 'bossIntro'
  | 'bossHit'
  | 'bossStagger'
  | 'bossPhase'
  | 'bossDefeat'
  | 'telegraph'
  | 'scream'
  | 'checkpoint'
  | 'victory'
  | 'gameover'
  | 'uiClick'
  | 'bgmRun'
  | 'bgmBoss';

export class SoundManager {
  private volume = 1.0;
  private muted = false;

  /** 효과음/BGM 재생 (에셋 미탑재 — 호출 지점만 유지) */
  play(_id: SoundId, _opts?: { loop?: boolean; volume?: number }): void {
    // 폴리싱 단계에서 실제 오디오 로딩/재생 구현
  }

  stop(_id: SoundId): void {}

  stopAll(): void {}

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
  }

  getVolume(): number {
    return this.volume;
  }

  setMuted(m: boolean): void {
    this.muted = m;
  }

  isMuted(): boolean {
    return this.muted;
  }
}
