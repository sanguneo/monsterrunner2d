import { defineConfig } from 'vitest/config';

// GitHub Pages 프로젝트 저장소 서브경로 배포: https://<user>.github.io/monsterhuntrunner/
// dev는 루트('/'), build는 저장소 경로로 base 설정.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/monsterhuntrunner/' : '/',
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
}));
