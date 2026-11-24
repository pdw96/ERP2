// 메뉴 「MRP」의 알림 — 주소에 실린 결과를 문장으로. [MRP 실행](?ran=계획오더 수) · 완성일 기준 요일 저장(?setting=saved · same).
// 한 실행의 계획오더는 20,000건까지라 다섯 자리까지만 읽는다 — 숫자가 아니거나 모르는 값이면 알림을 내지 않는다.

type Params = Record<string, string | string[] | undefined>;

/** 같은 이름이 여럿이면 앞의 것(목록의 거르기와 같다). */
const firstOf = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** 실행 · 기준 요일 저장 뒤의 알림. */
export function mrpNotice(params: Params): string | null {
  const ran = firstOf(params.ran);
  if (ran !== undefined && /^[0-9]{1,5}$/.test(ran))
    return `MRP 를 실행했습니다 — 계획오더 ${Number(ran).toLocaleString("ko-KR")}건`;
  const setting = firstOf(params.setting);
  if (setting === "saved") return "완성일 기준 요일을 저장했습니다 — 다음 실행부터 적용합니다";
  if (setting === "same") return "바뀐 것이 없습니다";
  return null;
}
