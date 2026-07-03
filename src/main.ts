import './style.css';
import { Game } from './core/Game';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const game = new Game(canvas);
game.start();

// 부팅 로더 제거 (흰 화면 방지 — 검토의견 §2)
// rAF는 백그라운드/숨김 탭에서 멈추므로 load 이벤트 + 타임아웃 폴백으로 확실히 제거한다.
function hideBootLoader(): void {
  const loader = document.getElementById('boot-loader');
  if (!loader || loader.classList.contains('hide')) return;
  loader.classList.add('hide');
  setTimeout(() => loader.remove(), 450);
}
if (document.readyState === 'complete') hideBootLoader();
else window.addEventListener('load', hideBootLoader, { once: true });
setTimeout(hideBootLoader, 1200); // 폴백

// 디버그/E2E 테스트용 노출 — 개발 빌드에서만 (프로덕션 치트 경로 차단)
declare global {
  interface Window {
    game?: Game;
  }
}
if (import.meta.env.DEV) {
  window.game = game;
}
