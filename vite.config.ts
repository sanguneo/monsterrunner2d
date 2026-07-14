import { defineConfig } from 'vitest/config';

// GitHub Pages 프로젝트 저장소 서브경로 배포: https://sanguneo.github.io/monsterrunner2d/
// dev는 루트('/'), build는 저장소 경로로 base 설정.
// ⚠️ base는 실제 저장소명(monsterrunner2d)과 정확히 일치해야 한다 —
//    런타임 에셋을 `${import.meta.env.BASE_URL}assets/...`로 fetch하므로 불일치 시 전부 404.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/monsterrunner2d/' : '/',
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
}));
