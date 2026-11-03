// 받침에 따라 조사를 붙인다 — 「품명을」 · 「안전재고를」, 「품명은」 · 「안전재고는」.
// 받침을 알 수 없는 글자(영문 · 숫자 등)로 끝나면 받침 없는 쪽을 쓴다.
function josa(word: string, withFinal: string, withoutFinal: string): string {
  const last = word.charCodeAt(word.length - 1);
  const hasFinal = last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0;
  return word + (hasFinal ? withFinal : withoutFinal);
}

export const eul = (w: string) => josa(w, "을", "를");
export const eun = (w: string) => josa(w, "은", "는");
