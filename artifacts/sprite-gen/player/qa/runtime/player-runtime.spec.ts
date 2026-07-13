import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 960, height: 540 } });

const evidenceDir = 'C:/Users/USER/WebstormProjects/m2d/artifacts/sprite-gen/player/qa/runtime';

test('player atlas loads and run/jump animate in the real game', async ({ page }) => {
  test.setTimeout(60_000);
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const spriteResponses = new Map<string, number>();
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => failedRequests.push(`${request.url()} ${request.failure()?.errorText ?? ''}`));
  page.on('response', (response) => {
    if (/\/assets\/sprites\/player(?:_atlas\.png|\.json)$/.test(response.url())) {
      spriteResponses.set(new URL(response.url()).pathname, response.status());
    }
  });

  await page.addInitScript(() => sessionStorage.setItem('mhr_tutorial_seen', '1'));
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(() => Boolean((window as Window & { game?: unknown }).game));

  await page.locator('[data-act="start"]').click();
  await page.locator('[data-act="go"]').click();

  await expect.poll(() => spriteResponses.get('/assets/sprites/player.json')).toBe(200);
  await expect.poll(() => spriteResponses.get('/assets/sprites/player_atlas.png')).toBe(200);
  await expect(page.locator('#screen-overlay')).toBeHidden();

  const playerClip = { x: 154, y: 132, width: 160, height: 220 };
  await page.screenshot({ path: `${evidenceDir}/game-running.png` });
  await page.screenshot({ path: `${evidenceDir}/run-frame-a.png`, clip: playerClip });
  await page.waitForTimeout(110);
  await page.screenshot({ path: `${evidenceDir}/run-frame-b.png`, clip: playerClip });

  const runState = await page.evaluate(() => {
    const game = (window as Window & { game?: { player?: { animState?: string; animTime?: number } } }).game;
    return { state: game?.player?.animState, time: game?.player?.animTime };
  });
  expect(runState.state).toBe('run');

  await page.keyboard.press('Space');
  await page.waitForFunction(() => {
    const game = (window as Window & { game?: { player?: { animState?: string } } }).game;
    return game?.player?.animState === 'jump';
  });
  await page.waitForTimeout(95);
  await page.screenshot({ path: `${evidenceDir}/jump-frame.png`, clip: playerClip });

  const jumpState = await page.evaluate(() => {
    const game = (window as Window & { game?: { player?: { animState?: string; animTime?: number } } }).game;
    return { state: game?.player?.animState, time: game?.player?.animTime };
  });
  expect(jumpState.state).toBe('jump');
  expect(jumpState.time).toBeGreaterThan(0);
  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});
