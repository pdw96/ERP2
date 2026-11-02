// ERP 의 업무 영역 — 왼쪽 메뉴와 영역 화면이 이 목록 하나를 읽는다.
export type Area = {
  href: string;
  label: string;
  summary: string;
};

export const AREAS: readonly Area[] = [
  { href: "/inventory", label: "재고", summary: "품목과 창고, 입고와 출고, 현재고 조회" },
  { href: "/production", label: "생산", summary: "BOM, 작업지시, 생산실적" },
  { href: "/purchasing", label: "구매", summary: "발주와 입고" },
  { href: "/sales", label: "영업", summary: "수주와 출고" },
  { href: "/accounting", label: "회계", summary: "매입과 매출 전표, 채권과 채무, 시산표" },
  { href: "/hr", label: "인사", summary: "부서와 사원, ERP 사용자" },
];

export function areaByHref(href: string): Area {
  const area = AREAS.find((a) => a.href === href);
  if (!area) throw new Error(`알 수 없는 영역: ${href}`);
  return area;
}
