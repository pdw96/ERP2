// 메뉴 「MPS」의 알림 — 주소에 실린 칸 수를 문장으로. 저장(?saved=) · 확정(?confirmed=) · 확정 취소(?unconfirmed=).
// 한 번에 2,000칸까지라 네 자리까지만 읽는다 — 숫자가 아니면 알림을 내지 않는다.

type Params = Record<string, string | string[] | undefined>;

/** 칸 수 — 같은 이름이 여럿이면 앞의 것(쪽과 같다). */
function countOf(value: string | string[] | undefined): number | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v !== undefined && /^[0-9]{1,4}$/.test(v) ? Number(v) : undefined;
}

const n = (count: number) => count.toLocaleString("ko-KR");

/** 저장 · 확정 · 확정 취소 뒤의 알림. */
export function mpsNotice(params: Params): string | undefined {
  const saved = countOf(params.saved);
  if (saved !== undefined) return saved === 0 ? "바뀐 칸이 없습니다" : `${n(saved)}칸을 저장했습니다`;
  const confirmed = countOf(params.confirmed);
  if (confirmed !== undefined) return confirmed === 0 ? "고정할 안이 없습니다" : `${n(confirmed)}칸을 고정했습니다`;
  const unconfirmed = countOf(params.unconfirmed);
  if (unconfirmed !== undefined)
    return unconfirmed === 0 ? "풀 칸이 없습니다" : `${n(unconfirmed)}칸의 고정을 풀었습니다`;
  return undefined;
}
