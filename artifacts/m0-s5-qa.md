# M0 S5 (G004) 보스 줄 패턴 축 전환 QA/레드팀 리포트

## 빌드/테스트 (leader 실행, 커밋 e89ddc5 + 위협 렌더 후속)
- pnpm build (tsc && vite build): exit 0, 245~248KB.
- pnpm test (vitest): 21/21 passed. 회귀 없음.

## walls P0 (v2.0 무데미지 버그) 해소 — executor 20-QaExecS5 + leader 확인
- Boss.ts:591 `if (!w.hitDone && grown && w.timer>0.1 && player.lane === w.lane) { if (damagePlayer) w.hitDone=true }`.
- 줄 점유(player.lane===w.lane) 판정 + hitDone 래치(벽당 1회, 실제 피해 성공 시에만). 구 x-근접 판정 잔재 0.

## 패턴/보존 (architect 19-QaArchS5 + executor 20)
- 9개 패턴 타입(projectile/barrage/wave/walls/chase/rush/summon/teleport/scream) startPattern+beginActive 스위치 전부 존재.
- wave=pickLanes(player.lane,2) 2줄 위협·1줄 안전, targetLanes.includes(player.lane) 판정. scream=대상 줄 음파+fireLock 봉인+순차 경직(screamHit). player.y/sliding 판정 잔재 0.
- 페이즈(phaseIdx/checkPhaseTransition/광폭화 dark)·경직(staggerDamageMult ×1.5)·체력바·밸런스 수치 전부 보존.
- Boss.ts THREE import 0.

## Architect WATCH 해소
- 최초 WATCH: 보스 위협(walls/wave/scream)이 2D 미렌더 → "보이지 않는 피해".
- 해소: Boss.drawHazards() 신설 — telegraph 예고(대상 줄 마커/밴드/그림자/락온) + walls/wave/scream/투사체 active 위협 2D 드로우. 임박 펄스로 안전 줄 시각 단서 제공. (커밋 후속) build+vitest 그린.

## 한계 / 후속(S6/S7)
- 라이브 GUI 픽셀·보스전 체감은 브라우저 불가로 S7/실기기 QA 유예.
- LOW(S6 정리): worlds.ts 패턴 주석(점프/슬라이드 잔재 문구), Sound 'jump'/'slide' dead enum, chase 중복 invuln 가드.
