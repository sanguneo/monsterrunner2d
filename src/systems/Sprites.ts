// ============================================================
// 스프라이트 로더/캐시 — public/assets/sprites/*.png 지연 로드 + 폴백
// (그래픽에셋_코딩에이전트_인수인계.md)
// 모든 draw*는 로드 완료 전/실패 시 false를 반환해 호출부가 기존 Canvas
// 도형으로 폴백할 수 있게 한다(§인수인계 8.6 "로드 실패 시 fallback").
// ============================================================

const SPRITE_BASE = `${import.meta.env.BASE_URL}assets/sprites`;

type Status = 'loading' | 'ok' | 'error';
interface Entry {
  readonly img: HTMLImageElement;
  status: Status;
}

const entries = new Map<string, Entry>();
const tintCache = new Map<string, HTMLCanvasElement>();

/** 현재 플레이 중인 월드 id — mob/obstacle/env 파일명 접두에 사용 (§인수인계 3·5·7) */
let currentWorldId = '';

export function setCurrentWorld(worldId: string): void {
  currentWorldId = worldId;
}

export function currentWorld(): string {
  return currentWorldId;
}

/** 공통(월드 무관) 스프라이트 — 시작 시 프리로드 (§인수인계 2·6) */
export const COMMON_SPRITES: readonly string[] = [
  'player_idle',
  'cape_ghost',
  'cape_dracula',
  'attach_cape_ghost',
  'attach_cape_dracula',
  'hat_zombie',
  'hat_lightning',
  'hat_seawitch',
  'hat_skull',
  'attach_hat_zombie',
  'attach_hat_lightning',
  'attach_hat_seawitch',
  'attach_hat_skull',
  'fx_proj_ball',
  'fx_proj_rod',
  'fx_proj_shard',
  'fx_wave',
  'fx_scream',
  'fx_blast',
  'fx_hit',
];

function hex(n: number): string {
  return `#${(n >>> 0).toString(16).padStart(6, '0').slice(-6)}`;
}

/** manifest.image 등에서 명시된 확장자 오버라이드 (name → 'png'|'webp') */
const extOverride = new Map<string, string>();

/** 파일 확장자 — 명시 오버라이드 > env_*(WebP 최적화) > 기본 PNG. */
function spriteExt(name: string): string {
  return extOverride.get(name) ?? (name.startsWith('env_') ? 'webp' : 'png');
}

function ensure(name: string): Entry {
  const found = entries.get(name);
  if (found) return found;
  const img = new Image();
  const entry: Entry = { img, status: 'loading' };
  img.onload = (): void => {
    entry.status = img.naturalWidth > 0 ? 'ok' : 'error';
  };
  img.onerror = (): void => {
    entry.status = 'error';
  };
  img.src = `${SPRITE_BASE}/${name}.${spriteExt(name)}`;
  entries.set(name, entry);
  return entry;
}

/** 파일들을 미리 로드(fire-and-forget). 월드 시작 전 호출로 팝인 방지. */
export function preload(names: readonly string[]): void {
  for (const n of names) ensure(n);
}

/** 로드 완료된 이미지 또는 null(최초 요청 시 지연 로드 시작). */
export function sprite(name: string): HTMLImageElement | null {
  const e = ensure(name);
  return e.status === 'ok' ? e.img : null;
}

export interface DrawOpts {
  /** 목표 높이(px). 미지정 시 이미지 원본 높이 사용. */
  height?: number;
  /** 목표 너비(px). height가 우선하며, 둘 다 없으면 원본 크기. */
  width?: number;
  /** 수평 반전(좌향 표현). 기본 false(우향 정측면). */
  flip?: boolean;
  /** 추가 알파(0~1). 현재 globalAlpha에 곱해진다. */
  alpha?: number;
  /** 세로 앵커: 'bottom'=발밑 중앙(anchorY=바닥), 'center'=중앙. 기본 'bottom'. */
  pivot?: 'bottom' | 'center';
  /** 지면 접지 보정: 스프라이트/프레임의 하단 투명 여백만큼 아래로 내려 실제 발이 anchorY(그림자선)에 닿게 한다. pivot 'bottom'에서만 적용. */
  groundContact?: boolean;
}

/** (이미지/프레임 키 → 하단 투명 여백 비율) 캐시 — 접지 보정용(§인수인계 5·레인 정렬). */
const bottomPadCache = new Map<string, number>();

/**
 * 이미지(또는 아틀라스 프레임)의 하단 투명 여백 비율(0~1)을 측정해 캐시한다.
 * 반환 f = (콘텐츠 최하단 아래로 비어 있는 높이 / 전체 높이). pivot bottom 렌더 시
 * anchorY를 f·h만큼 내려 실제 발이 그림자선(anchorY)에 닿게 한다.
 * 측정 불가 환경(non-DOM)·getImageData 오류 시 0(무보정)으로 안전 폴백.
 */
function bottomPadFrac(
  src: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  key: string,
): number {
  const cached = bottomPadCache.get(key);
  if (cached !== undefined) return cached;
  let frac = 0;
  if (typeof document !== 'undefined' && sw > 0 && sh > 0) {
    try {
      const c = document.createElement('canvas');
      c.width = sw;
      c.height = sh;
      const g = c.getContext('2d', { willReadFrequently: true });
      if (g) {
        g.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
        const data = g.getImageData(0, 0, sw, sh).data;
        let bottom = -1;
        for (let y = sh - 1; y >= 0 && bottom < 0; y--) {
          for (let x = 0; x < sw; x++) {
            if (data[(y * sw + x) * 4 + 3] > 16) {
              bottom = y;
              break;
            }
          }
        }
        if (bottom >= 0) frac = (sh - 1 - bottom) / sh;
      }
    } catch {
      frac = 0;
    }
  }
  bottomPadCache.set(key, frac);
  return frac;
}

function blit(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  natW: number,
  natH: number,
  cx: number,
  anchorY: number,
  opts: DrawOpts,
  bottomPad = 0,
): void {
  let w: number;
  let h: number;
  if (opts.height != null) {
    h = opts.height;
    w = opts.width ?? natW * (h / natH);
  } else if (opts.width != null) {
    w = opts.width;
    h = natH * (w / natW);
  } else {
    w = natW;
    h = natH;
  }
  const top = opts.pivot === 'center' ? anchorY - h / 2 : anchorY - h + bottomPad * h;
  ctx.save();
  if (opts.alpha != null) ctx.globalAlpha *= opts.alpha;
  if (opts.flip) {
    ctx.translate(cx, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(src, -w / 2, top, w, h);
  } else {
    ctx.drawImage(src, cx - w / 2, top, w, h);
  }
  ctx.restore();
}

/** 스프라이트를 (cx, anchorY)에 그린다. 로드 전/실패면 false(호출부 폴백). */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  name: string,
  cx: number,
  anchorY: number,
  opts: DrawOpts = {},
): boolean {
  const img = sprite(name);
  if (!img) return false;
  const pad =
    opts.groundContact && opts.pivot !== 'center'
      ? bottomPadFrac(img, 0, 0, img.naturalWidth, img.naturalHeight, `img:${name}`)
      : 0;
  blit(ctx, img, img.naturalWidth, img.naturalHeight, cx, anchorY, opts, pad);
  return true;
}

/** name 이미지를 color로 틴트한 캔버스(캐시). 로드 전이면 null. */
function tintedCanvas(name: string, color: number): HTMLCanvasElement | null {
  const img = sprite(name);
  if (!img) return null;
  const key = `${name}#${color}`;
  const cached = tintCache.get(key);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext('2d');
  if (!g) return null;
  // 원본 명암을 유지하며 색만 입힌다: multiply 후 원본 알파로 마스킹.
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = hex(color);
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(img, 0, 0);
  tintCache.set(key, c);
  return c;
}

/** 색 틴트 스프라이트를 그린다(발사체·파동 색 개성 등). 로드 전이면 false. */
export function drawTinted(
  ctx: CanvasRenderingContext2D,
  name: string,
  color: number,
  cx: number,
  anchorY: number,
  opts: DrawOpts = {},
): boolean {
  const c = tintedCanvas(name, color);
  if (!c) return false;
  const pad =
    opts.groundContact && opts.pivot !== 'center'
      ? bottomPadFrac(c, 0, 0, c.width, c.height, `tint:${name}`)
      : 0;
  blit(ctx, c, c.width, c.height, cx, anchorY, opts, pad);
  return true;
}

// ============================================================
// 애니메이션 (아틀라스 + 매니페스트) — sprite-gen 산출물 재생
// 계약: public/assets/sprites/<group>.png(아틀라스) + <group>.json(매니페스트).
// 매니페스트가 없으면(=아직 미제작) 모든 API가 false/-1을 반환 → 호출부가
// 기존 단일 PNG/도형으로 폴백한다(완전 하위호환).
// ============================================================

/** 아틀라스 내 프레임 사각형(px). */
export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 한 상태(idle/run/jump/...)의 프레임 시퀀스. */
export interface AnimState {
  fps: number;
  loop: boolean;
  frames: Frame[];
}

/** 소켓 = 부착물(모자/망토 등) 앵커 점. 프레임 로컬 px(프레임 좌상단 기준). */
export type FrameSockets = Record<string, [number, number]>;

export interface AnimManifest {
  /** 아틀라스 파일명(같은 폴더). 생략 시 <group>.png */
  image?: string;
  /** 세로 앵커(기본 bottom=발밑). */
  pivot?: 'bottom' | 'center';
  states: Record<string, AnimState>;
  /** state → 프레임별 소켓 맵(선택). sockets[state][frameIndex][socketName] = [x,y] */
  sockets?: Record<string, FrameSockets[]>;
}

interface Clip {
  manifest: AnimManifest | null;
  status: Status;
}

const clips = new Map<string, Clip>();

/** manifest.image → 로더 이름(확장자 제거) + 확장자 오버라이드 등록. 미지정이면 group. */
function atlasNameOf(m: AnimManifest, group: string): string {
  if (!m.image) return group;
  const match = /\.(png|webp)$/i.exec(m.image);
  const base = m.image.replace(/\.(png|webp)$/i, '');
  if (match) extOverride.set(base, match[1].toLowerCase());
  return base;
}

/** 매니페스트 + 아틀라스 지연 로드. */
function ensureClip(group: string): Clip {
  const found = clips.get(group);
  if (found) return found;
  const clip: Clip = { manifest: null, status: 'loading' };
  clips.set(group, clip);
  fetch(`${SPRITE_BASE}/${group}.json`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('no manifest'))))
    .then((m: AnimManifest) => {
      clip.manifest = m;
      ensure(atlasNameOf(m, group)); // 아틀라스 프리로드 (확장자 오버라이드 등록 포함)
      clip.status = 'ok';
    })
    .catch(() => {
      clip.status = 'error';
    });
  return clip;
}

/** 그룹의 애니 매니페스트를 미리 로드(fire-and-forget). */
export function preloadAnim(groups: readonly string[]): void {
  for (const g of groups) ensureClip(g);
}

/** 애니 그룹(매니페스트+아틀라스)이 그릴 준비가 됐는지. 미로드면 로드를 시작하고 false. */
export function isAnimReady(group: string): boolean {
  const clip = ensureClip(group);
  if (clip.status !== 'ok' || !clip.manifest) return false;
  return sprite(atlasNameOf(clip.manifest, group)) != null;
}

/** 상태·경과시간(초)에서 현재 프레임 인덱스. loop면 순환, 아니면 마지막에 고정. (순수 — 테스트 대상) */
export function frameIndexAt(state: AnimState, tSec: number): number {
  const n = state.frames.length;
  if (n <= 1 || state.fps <= 0) return 0;
  const raw = Math.floor(tSec * state.fps);
  if (state.loop) return ((raw % n) + n) % n;
  return Math.min(Math.max(raw, 0), n - 1);
}

/** 매니페스트에서 state를 고른다: 요청 state → 'idle' → 첫 상태. 없으면 null. */
function pickState(m: AnimManifest, want: string): { name: string; state: AnimState } | null {
  if (m.states[want]) return { name: want, state: m.states[want] };
  if (m.states.idle) return { name: 'idle', state: m.states.idle };
  const first = Object.keys(m.states)[0];
  return first ? { name: first, state: m.states[first] } : null;
}

export interface AnimDrawResult {
  /** 사용된 상태명 */
  state: string;
  /** 현재 프레임 인덱스 */
  frame: number;
}

/** 애니메이션을 그리지 않고 현재 state/frame만 계산한다(소켓 선행 렌더용). */
export function animFrameAt(group: string, wantState: string, tSec: number): AnimDrawResult | null {
  const clip = ensureClip(group);
  if (clip.status !== 'ok' || !clip.manifest) return null;
  const picked = pickState(clip.manifest, wantState);
  if (!picked) return null;
  const frame = frameIndexAt(picked.state, tSec);
  return picked.state.frames[frame] ? { state: picked.name, frame } : null;
}

/**
 * 아틀라스 애니메이션을 (cx, anchorY)에 그린다.
 * @returns 그렸으면 {state,frame}, 로드 전/미제작이면 null(호출부 폴백).
 */
export function drawAnim(
  ctx: CanvasRenderingContext2D,
  group: string,
  wantState: string,
  tSec: number,
  cx: number,
  anchorY: number,
  opts: DrawOpts = {},
): AnimDrawResult | null {
  const clip = ensureClip(group);
  if (clip.status !== 'ok' || !clip.manifest) return null;
  const picked = pickState(clip.manifest, wantState);
  if (!picked) return null;
  const atlas = sprite(atlasNameOf(clip.manifest, group));
  if (!atlas) return null;

  const fi = frameIndexAt(picked.state, tSec);
  const f = picked.state.frames[fi];
  if (!f) return null;

  const h = opts.height ?? f.h;
  const w = opts.width ?? f.w * (h / f.h);
  const pivot = opts.pivot ?? clip.manifest.pivot ?? 'bottom';
  const pad =
    opts.groundContact && pivot !== 'center'
      ? bottomPadFrac(atlas, f.x, f.y, f.w, f.h, `atlas:${group}:${f.x},${f.y}`)
      : 0;
  const top = pivot === 'center' ? anchorY - h / 2 : anchorY - h + pad * h;
  ctx.save();
  if (opts.alpha != null) ctx.globalAlpha *= opts.alpha;
  if (opts.flip) {
    ctx.translate(cx, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(atlas, f.x, f.y, f.w, f.h, -w / 2, top, w, h);
  } else {
    ctx.drawImage(atlas, f.x, f.y, f.w, f.h, cx - w / 2, top, w, h);
  }
  ctx.restore();
  return { state: picked.name, frame: fi };
}

/**
 * 부착물 소켓의 화면 좌표. drawAnim과 동일한 (cx, anchorY, height, flip) 변환을 사용.
 * @returns {x,y} 또는 소켓/매니페스트 없으면 null.
 */
export function socketScreenPos(
  group: string,
  state: string,
  frame: number,
  socket: string,
  place: { cx: number; anchorY: number; height: number; flip?: boolean },
): { x: number; y: number } | null {
  const clip = clips.get(group);
  if (!clip || clip.status !== 'ok' || !clip.manifest) return null;
  const st = clip.manifest.states[state];
  const socketsForState = clip.manifest.sockets?.[state];
  if (!st || !socketsForState) return null;
  const f = st.frames[frame];
  const pt = socketsForState[frame]?.[socket];
  if (!f || !pt) return null;
  const scale = place.height / f.h;
  const offX = (pt[0] - f.w / 2) * scale; // 프레임 중심 기준 가로 오프셋
  const x = place.flip ? place.cx - offX : place.cx + offX;
  const atlas = sprite(atlasNameOf(clip.manifest, group));
  const pad = atlas ? bottomPadFrac(atlas, f.x, f.y, f.w, f.h, `atlas:${group}:${f.x},${f.y}`) : 0;
  // 발밑(anchorY-height=상단) + 소켓 y + 접지 보정(drawAnim와 동일 오프셋 → 부착물 정합 유지)
  const y = place.anchorY - place.height + pt[1] * scale + pad * place.height;
  return { x, y };
}
