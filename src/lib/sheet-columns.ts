import { ITEM_CLASSES, NOTE_MAX } from "./item-fields";
import { FOREIGN_BIZ_NO_MAX, PARTNER_TEXT_FIELDS } from "./partner-fields";
import { ITEM_TYPES, PROC_TYPES } from "./master-codes";
import type { SheetColumn } from "./sheet";

// 시트형 등록의 칸 — 순서는 한 건 등록 화면과 같다(저자 판정 2026-11-03). 붙여넣기는 이 순서대로 칸을 채운다.
// 고르는 값은 이름 · 코드 둘 다 받고, 검사 대상 · 매입처 · 매출처는 Y/N · O/X · 예/아니오를 받는다.
// PR H 의 설명용 칸은 지금 칸의 뒤에 붙는다 — PR F 의 칸 순서로 만든 표를 붙여넣어도 앞 칸이 어긋나지 않는다.
// PR J 의 사용 여부도 그때의 맨 뒤에, 재고 수불 PR B 의 재고 칸 넷은 그 뒤에 붙는다. 코드는 칸이 아니다 — 불러온 줄의 숨은 칸이다(src/lib/sheet.ts 의 CODE_KEY).

type Option = { code: string; name: string };

const listOf = (options: readonly Option[]) => options.map((o) => `${o.name}(${o.code})`).join(" · ");

export const YES_NO = "Y · N (O · X, 예 · 아니오도 됩니다)";

/**
 * 사용 여부(PR J) — PR J 때 맨 뒤에 붙어 앞 PR 의 칸 순서로 만든 표를 붙여넣어도 앞 칸이 어긋나지 않는다(저자 판정 2026-11-05 — 시트에서 바꾼다).
 * 뒤에 붙는 칸(품목의 재고 칸 넷)은 이 칸 뒤에 붙는다 — 같은 까닭.
 * 새 줄은 한 건 등록처럼 「사용」으로만 등록한다.
 */
const ACTIVE_COLUMN: SheetColumn = {
  key: "active",
  label: "사용 여부",
  rule: `Y(사용) · N(사용 안 함) — 비우면 Y. 새 행은 Y 로만 등록합니다`,
  width: 6,
};

type ClassLists = Partial<Record<(typeof ITEM_CLASSES)[number]["field"], readonly Option[]>>;
/** 재고 칸의 안내 — 사용 중인 LOT 번호 규칙과, 고를 수 있는 창고(사용 중 · 불량창고 아님). */
type StockOptions = { rules?: readonly Option[]; warehouses?: readonly Option[] };

/**
 * 품목 시트의 칸 — 단위 · 분류의 안내는 공통코드 `UNIT` · `ITEM_CLS1 ~ 3` 의 사용 중인 값으로 만든다.
 * 재고 칸 넷(조각 「재고 수불」 PR B)은 사용 여부 뒤에 붙는다 — 앞 PR 의 칸 순서로 만든 표를 붙여넣어도 앞 칸이 어긋나지 않는다.
 */
export function itemSheetColumns(
  units: readonly Option[],
  classes: ClassLists = {},
  stock: StockOptions = {},
): SheetColumn[] {
  return [
    {
      key: "itemType",
      label: "유형",
      rule: `${listOf(ITEM_TYPES)} — 꼭 넣습니다. 불러온 행은 고칠 수 없습니다`,
      width: 8,
      required: true,
      fixed: true,
    },
    { key: "name", label: "품명", rule: "100자까지 — 꼭 넣습니다", width: 18, required: true },
    { key: "spec", label: "규격", rule: "100자까지 — 비워도 됩니다", width: 14 },
    {
      key: "unit",
      label: "단위",
      rule: `${units.length ? listOf(units) : "공통코드 UNIT 의 값"} — 이름이나 코드, 꼭 넣습니다`,
      width: 7,
      required: true,
    },
    { key: "procurement", label: "조달구분", rule: `${listOf(PROC_TYPES)} — 비우면 유형의 기본값`, width: 8 },
    { key: "inspectIn", label: "수입검사", rule: `${YES_NO} — 비우면 유형의 기본값`, width: 6 },
    { key: "inspectOut", label: "출하검사", rule: `${YES_NO} — 비우면 유형의 기본값`, width: 6 },
    { key: "leadTimeDays", label: "리드타임(일)", rule: "0 ~ 365 의 정수 — 비우면 0", width: 7 },
    { key: "safetyStock", label: "안전재고", rule: "0 이상, 소수 셋째 자리까지 — 비우면 0", width: 8 },
    { key: "minLot", label: "최소 발주 · 생산량", rule: "0 이상, 소수 셋째 자리까지 — 비우면 0", width: 8 },
    { key: "lotMultiple", label: "발주 · 생산 배수", rule: "0 이면 배수 없음 — 비우면 0", width: 8 },
    ...ITEM_CLASSES.map(({ field, group, label }) => {
      const list = classes[field] ?? [];
      return {
        key: field,
        label,
        rule: `${list.length ? listOf(list) : `공통코드 ${group} 의 값`} — 이름이나 코드, 비워도 됩니다`,
        width: 8,
      };
    }),
    { key: "note", label: "비고", rule: `${NOTE_MAX}자까지 — 비워도 됩니다`, width: 16 },
    ACTIVE_COLUMN,
    { key: "lotManaged", label: "LOT 관리", rule: `${YES_NO} — 비우면 유형의 기본값`, width: 6 },
    {
      key: "lotRuleCode",
      label: "LOT 번호 규칙",
      rule: `${stock.rules?.length ? listOf(stock.rules) : "「시스템 관리 › 번호 규칙」의 규칙"} — 이름이나 코드, 반제품 · 완제품만. 비우면 유형의 기본 규칙`,
      width: 10,
    },
    ...(
      [
        ["defaultInWarehouse", "기본 입고 창고"],
        ["defaultOutWarehouse", "기본 출고 창고"],
      ] as const
    ).map(([key, label]) => ({
      key,
      label,
      rule: `${stock.warehouses?.length ? listOf(stock.warehouses) : "창고"} — 이름이나 코드, 불량창고는 안 됩니다. 비워도 됩니다`,
      width: 9,
    })),
  ];
}

/** 거래처 시트의 칸 — 국가의 안내는 공통코드 `COUNTRY` 의 사용 중인 값으로 만든다. */
export function partnerSheetColumns(countries: readonly Option[]): SheetColumn[] {
  return [
    { key: "name", label: "거래처명", rule: "100자까지 — 꼭 넣습니다", width: 20, required: true },
    {
      key: "isSupplier",
      label: "매입처",
      rule: `${YES_NO} — 매입처 · 매출처 가운데 하나 이상`,
      errorKey: "role",
      width: 6,
      required: true,
    },
    {
      key: "isCustomer",
      label: "매출처",
      rule: `${YES_NO} — 비우면 N. 매입처 · 매출처 가운데 하나 이상`,
      errorKey: "role",
      width: 6,
      required: true,
    },
    {
      key: "country",
      label: "국가",
      rule: `${countries.length ? listOf(countries) : "공통코드 COUNTRY 의 값"} — 이름이나 코드, 비우면 한국(KR)`,
      width: 7,
    },
    {
      key: "bizNo",
      label: "사업자번호",
      rule: `한국이면 000-00-00000, 다른 나라면 그 나라의 번호를 그대로(${FOREIGN_BIZ_NO_MAX}자까지) — 비워도 됩니다`,
      width: 14,
    },
    ...PARTNER_TEXT_FIELDS.map(({ field, label, max }) => ({
      key: field,
      label,
      rule: `${max}자까지${TEXT_RULE[field] ?? ""} — 비워도 됩니다`,
      width: TEXT_WIDTH[field] ?? 10,
    })),
    ACTIVE_COLUMN,
  ];
}

// 설명용 칸의 꼴 안내와 칸의 넓이.
const TEXT_RULE: Partial<Record<(typeof PARTNER_TEXT_FIELDS)[number]["field"], string>> = {
  phone: ", 숫자 · 붙임표(-) · + · 괄호",
  contactPhone: ", 숫자 · 붙임표(-) · + · 괄호",
  email: ", name@example.com 꼴",
};
const TEXT_WIDTH: Partial<Record<(typeof PARTNER_TEXT_FIELDS)[number]["field"], number>> = {
  address: 20,
  email: 16,
  note: 16,
  phone: 11,
  contactPhone: 11,
};

/** 거절을 보이는 자리의 이름 — 칸 이름과 다른 것만(매입처 · 매출처의 「구분」, 줄 전체). */
export const PARTNER_SHEET_ERROR_LABELS: Record<string, string> = { role: "구분(매입처 · 매출처)" };
