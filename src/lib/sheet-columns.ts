import { ITEM_CLASSES, NOTE_MAX } from "./item-fields";
import { FOREIGN_BIZ_NO_MAX, PARTNER_TEXT_FIELDS } from "./partner-fields";
import { ITEM_TYPES, PROC_TYPES } from "./master-codes";
import type { SheetColumn } from "./sheet";

// 시트형 등록의 칸 — 순서는 한 건 등록 화면과 같다(저자 판정 2026-11-03). 붙여넣기는 이 순서대로 칸을 채운다.
// 고르는 값은 이름 · 코드 둘 다 받고, 검사 대상 · 매입처 · 매출처는 Y/N · O/X · 예/아니오를 받는다.
// PR H 의 설명용 칸은 지금 칸의 뒤에 붙는다 — PR F 의 칸 순서로 만든 표를 붙여넣어도 앞 칸이 어긋나지 않는다.

type Option = { code: string; name: string };

const listOf = (options: readonly Option[]) => options.map((o) => `${o.name}(${o.code})`).join(" · ");

export const YES_NO = "Y · N (O · X, 예 · 아니오도 됩니다)";

type ClassLists = Partial<Record<(typeof ITEM_CLASSES)[number]["field"], readonly Option[]>>;

/** 품목 시트의 칸 — 단위 · 분류의 안내는 공통코드 `UNIT` · `ITEM_CLS1 ~ 3` 의 사용 중인 값으로 만든다. */
export function itemSheetColumns(units: readonly Option[], classes: ClassLists = {}): SheetColumn[] {
  return [
    { key: "itemType", label: "유형", rule: `${listOf(ITEM_TYPES)} — 꼭 넣습니다`, width: 8 },
    { key: "name", label: "품명", rule: "100자까지 — 꼭 넣습니다", width: 18 },
    { key: "spec", label: "규격", rule: "100자까지 — 비워도 됩니다", width: 14 },
    {
      key: "unit",
      label: "단위",
      rule: `${units.length ? listOf(units) : "공통코드 UNIT 의 값"} — 이름이나 코드, 꼭 넣습니다`,
      width: 7,
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
  ];
}

/** 거래처 시트의 칸 — 국가의 안내는 공통코드 `COUNTRY` 의 사용 중인 값으로 만든다. */
export function partnerSheetColumns(countries: readonly Option[]): SheetColumn[] {
  return [
    { key: "name", label: "거래처명", rule: "100자까지 — 꼭 넣습니다", width: 20 },
    {
      key: "isSupplier",
      label: "매입처",
      rule: `${YES_NO} — 매입처 · 매출처 가운데 하나 이상`,
      errorKey: "role",
      width: 6,
    },
    { key: "isCustomer", label: "매출처", rule: `${YES_NO} — 비우면 N`, errorKey: "role", width: 6 },
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
