// ERP 의 업무 영역 — 왼쪽 메뉴와 영역 화면이 이 목록 하나를 읽는다.
export type Area = {
  href: string;
  label: string;
};

export const AREAS: readonly Area[] = [
  { href: "/inventory", label: "재고" },
  { href: "/production", label: "생산" },
  { href: "/purchasing", label: "구매" },
  { href: "/sales", label: "영업" },
  { href: "/accounting", label: "회계" },
  { href: "/hr", label: "인사" },
];

export function areaByHref(href: string): Area {
  const area = AREAS.find((a) => a.href === href);
  if (!area) throw new Error(`알 수 없는 영역: ${href}`);
  return area;
}
