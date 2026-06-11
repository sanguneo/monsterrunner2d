import './style.css';
import { Game } from './core/Game';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const game = new Game(canvas);
game.start();

// 디버그/E2E 테스트용 노출
declare global {
  interface Window {
    game: Game;
  }
}
window.game = game;
