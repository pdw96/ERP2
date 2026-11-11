// ERP 의 모듈과 메뉴 — 왼쪽 메뉴와 모듈 화면이 이 목록 하나를 읽는다.
// 모듈의 순서와 메뉴는 마스터플랜 「모듈과 메뉴」를 따르고, 후보 메뉴는 넣지 않는다.
// 지은 화면만 주소(href)를 갖는다 — 주소가 없는 메뉴는 「준비 중」으로 보인다.

import { MOVE_MENUS } from "@/lib/move-menus";

export type Menu = {
  label: string;
  /** 이 메뉴를 짓는 조각(마스터플랜의 조각 이름). */
  slice: string;
  /** 지은 화면의 주소. 없으면 준비 중. */
  href?: string;
};

/** 메뉴 묶음 — 「○○ 기준정보」 · 「수불관리」처럼 이름이 있는 묶음, 또는 이름 없이 모듈 바로 아래의 메뉴. */
export type MenuGroup = { label?: string; menus: readonly Menu[] };

export type Area = {
  href: string;
  label: string;
  summary: string;
  groups: readonly MenuGroup[];
};

export const AREAS: readonly Area[] = [
  {
    href: "/master",
    label: "기준정보",
    summary: "여러 모듈이 같이 쓰는 품목과 거래처",
    groups: [
      {
        menus: [
          // 등록 · 조회로 나눈다(ADR 0013). 조회는 등록의 주소 아래라, 지금 화면은 가장 길게 맞는 메뉴다(activeMenuHref).
          { label: "품목 등록", slice: "기준정보", href: "/master/items" },
          { label: "품목 조회", slice: "기준정보", href: "/master/items/inquiry" },
          { label: "거래처 등록", slice: "기준정보", href: "/master/partners" },
          { label: "거래처 조회", slice: "기준정보", href: "/master/partners/inquiry" },
        ],
      },
    ],
  },
  {
    href: "/sales",
    label: "영업",
    summary: "수주부터 출하 · 매출 · 반품까지",
    groups: [
      { label: "영업 기준정보", menus: [{ label: "판매 단가", slice: "영업" }] },
      {
        menus: [
          { label: "수주", slice: "영업" },
          { label: "출하요청", slice: "영업" },
          { label: "출하", slice: "영업" },
          { label: "매출", slice: "영업" },
          { label: "반품", slice: "영업" },
          { label: "판매계획", slice: "MPS" },
        ],
      },
    ],
  },
  {
    href: "/purchasing",
    label: "구매",
    summary: "발주부터 입고 · 매입 · 구매 반품까지",
    groups: [
      {
        label: "구매 기준정보",
        menus: [
          { label: "품목별 공급처", slice: "구매" },
          { label: "구매 단가", slice: "구매" },
        ],
      },
      {
        menus: [
          { label: "발주", slice: "구매" },
          { label: "입고", slice: "구매" },
          { label: "매입", slice: "구매" },
          { label: "구매 반품", slice: "구매" },
        ],
      },
    ],
  },
  {
    href: "/inventory",
    label: "재고",
    summary: "창고, 수불, 품목별 · 창고별 · LOT별 재고",
    groups: [
      { label: "재고 기준정보", menus: [{ label: "창고", slice: "기준정보", href: "/inventory/warehouses" }] },
      {
        label: "수불관리",
        menus: [
          // 등록은 수불구분마다 메뉴 하나다(ADR 0020) — 이름 · 주소는 src/lib/move-menus.ts 가 든다.
          ...MOVE_MENUS.map((m) => ({ label: m.label, slice: "재고 수불", href: m.href })),
          { label: "재고 실사", slice: "재고 수불", href: "/inventory/counts" },
          { label: "수불 이력", slice: "재고 수불", href: "/inventory/history" },
          { label: "수불부", slice: "재고 수불", href: "/inventory/ledger" },
        ],
      },
      {
        label: "재고관리",
        menus: [
          { label: "품목별 재고", slice: "재고 현황", href: "/inventory/status/items" },
          { label: "창고별 재고", slice: "재고 현황" },
          { label: "LOT별 재고", slice: "재고 현황" },
          // 예상재고는 조각 「작업지시」가 할당 현황과 함께 짓는다(ADR 0023 의 1).
          { label: "예상재고", slice: "작업지시" },
          { label: "할당 현황", slice: "작업지시" },
        ],
      },
    ],
  },
  {
    href: "/production",
    label: "생산",
    summary: "BOM · 라우팅, 생산계획, 작업지시와 생산실적, LOT 추적",
    groups: [
      {
        label: "생산 기준정보",
        menus: [
          { label: "BOM", slice: "BOM" },
          { label: "공정", slice: "라우팅" },
          { label: "작업장", slice: "라우팅" },
          { label: "라우팅", slice: "라우팅" },
          { label: "근무 캘린더", slice: "능력계획(CRP)" },
          { label: "작업장 능력", slice: "능력계획(CRP)" },
        ],
      },
      {
        label: "생산계획",
        menus: [
          { label: "MPS", slice: "MPS" },
          { label: "MRP", slice: "MRP" },
          { label: "능력계획", slice: "능력계획(CRP)" },
        ],
      },
      {
        label: "생산 실행",
        menus: [
          { label: "작업지시", slice: "작업지시" },
          { label: "생산실적", slice: "생산실적" },
        ],
      },
      { menus: [{ label: "LOT 추적", slice: "LOT 추적" }] },
    ],
  },
  {
    href: "/quality",
    label: "품질",
    summary: "수입 · 공정 · 출하 검사와 불량의 격리 · 처분",
    groups: [
      {
        label: "품질 기준정보",
        menus: [
          { label: "불량 유형", slice: "라우팅" },
          { label: "검사 항목 · 기준", slice: "품질" },
        ],
      },
      {
        menus: [
          { label: "수입검사", slice: "품질" },
          { label: "공정검사", slice: "품질" },
          { label: "출하검사", slice: "품질" },
          { label: "불량 격리 · 처분", slice: "품질" },
        ],
      },
    ],
  },
  {
    href: "/accounting",
    label: "회계",
    summary: "매입과 매출 전표, 채권과 채무, 시산표",
    groups: [
      { label: "회계 기준정보", menus: [{ label: "계정과목", slice: "회계" }] },
      {
        menus: [
          { label: "전표", slice: "회계" },
          { label: "채권", slice: "회계" },
          { label: "채무", slice: "회계" },
          { label: "시산표", slice: "회계" },
        ],
      },
    ],
  },
  {
    href: "/hr",
    label: "인사",
    summary: "부서와 직급, 사원",
    groups: [
      {
        label: "인사 기준정보",
        menus: [
          { label: "부서", slice: "인사" },
          { label: "직급", slice: "인사" },
        ],
      },
      { menus: [{ label: "사원", slice: "인사" }] },
    ],
  },
  {
    href: "/system",
    label: "시스템 관리",
    summary: "공통코드 · 번호 규칙, 회사 정보, 사용자 · 메뉴와 권한",
    groups: [
      {
        menus: [
          { label: "공통코드", slice: "기준정보", href: "/system/codes" },
          // LOT 번호의 규칙만 든다(ADR 0016). 전표 · 발주 · 작업지시 번호를 얹을지는 그 조각의 착공에서 정한다.
          { label: "번호 규칙", slice: "재고 수불", href: "/system/number-rules" },
          { label: "회사 정보", slice: "인사" },
          { label: "사용자", slice: "인사" },
          // 메뉴를 DB 의 표로 두어 권한이 가리킨다 — 처음 값은 이 목록을 옮긴다(마스터플랜 범위 변경 2026-11-05).
          { label: "메뉴 관리", slice: "인사" },
          { label: "권한", slice: "인사" },
        ],
      },
    ],
  },
];

export function areaByHref(href: string): Area {
  const area = AREAS.find((a) => a.href === href);
  if (!area) throw new Error(`알 수 없는 영역: ${href}`);
  return area;
}

/** 지은 화면이 하나라도 있는 모듈인가. */
export function isOpen(area: Area): boolean {
  return area.groups.some((g) => g.menus.some((m) => m.href));
}

/** 주소가 이 모듈 또는 그 아래 화면인가. */
export function isWithin(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * 지금 화면에 맞는 메뉴의 주소 — 주소가 여러 메뉴 아래에 들면 가장 길게 맞는 것.
 * 「품목 조회」(/master/items/inquiry)는 「품목 등록」(/master/items) 아래에 있어도 조회만 표시된다.
 */
export function activeMenuHref(pathname: string, area: Area): string | undefined {
  return area.groups
    .flatMap((g) => g.menus.flatMap((m) => (m.href && isWithin(pathname, m.href) ? [m.href] : [])))
    .sort((a, b) => b.length - a.length)[0];
}
