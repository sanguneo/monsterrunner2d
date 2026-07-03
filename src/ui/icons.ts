// ============================================================
// UI 아이콘 헬퍼 — AI(nanobanana) 생성 webp로 이모지 대체
// public/assets/icons/<name>.webp
// ============================================================

export const ICON_DIR = `${import.meta.env.BASE_URL}assets/icons`;

/** 인라인 아이콘 <img> 마크업. cls 기본값 'ui-icon'(텍스트 높이에 맞춤). */
export function uiIcon(name: string, cls = 'ui-icon'): string {
  return `<img class="${cls}" src="${ICON_DIR}/${name}.webp" alt="" draggable="false" />`;
}
