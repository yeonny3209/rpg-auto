// 아이템 종류별 단색 SVG 아이콘 (외부 에셋 없음). currentColor로 등급색을 받는다.
const P: Record<string, string> = {
  weapon: '<path d="M12 2l3 3-7 11-3 1 1-3zM6 18l-3 3" />',
  head: '<path d="M4 14a8 8 0 0116 0v3H4zM9 17v3M15 17v3" />',
  body: '<path d="M7 3l-4 4 3 3 1-1v11h8V9l1 1 3-3-4-4-2 2h-4z" />',
  hands: '<path d="M7 20v-8l-2-3 2-1 2 3V5h2v6V4h2v7V5h2v8l2-2 1 1-3 5v3z" />',
  feet: '<path d="M7 3h6v9l6 3v4H5V3z" />',
  ring: '<circle cx="12" cy="14" r="6" /><path d="M9 4h6l2 3H7z" />',
};
export function itemIcon(kind: string, plus = 0): string {
  const p = P[kind] ?? P.ring;
  const badge = plus > 0 ? `<i class="plus">+${plus}</i>` : "";
  return `<svg viewBox="0 0 24 24" class="ico" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">${p}</svg>${badge}`;
}
