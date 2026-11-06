import type { Item, ItemClassOptions } from "@/db/items";
import { dateKst, orDash, type InquiryColumn } from "@/components/inquiry-table";
import { ITEM_CLASSES } from "@/lib/item-fields";
import type { StockLists } from "@/lib/item-stock";
import { isMadeType, itemTypeName, procTypeName } from "@/lib/master-codes";

// 품목 조회의 칸 — 한 건 등록 화면 · 시트의 순서 그대로, 끝에 사용 여부 · 수정일(저자 판정 2026-11-04).
// 품명은 왼쪽에 붙는 칸(코드 · 품명)에 있다.

const qty = (n: number) => n.toLocaleString("ko-KR", { maximumFractionDigits: 3 });

export function itemInquiryColumns(classes: ItemClassOptions, stock: StockLists): InquiryColumn<Item>[] {
  // 창고는 코드와 이름으로 — 목록에 없는 번호는 그대로(지우는 길이 없어 생기지 않는다).
  const warehouse = (id: number | null) => {
    if (id === null) return "—";
    const w = stock.warehouses.find((x) => x.id === id);
    return w ? `${w.code} ${w.name}` : String(id);
  };
  return [
    { label: "유형", cell: (i) => itemTypeName(i.itemType) },
    { label: "규격", cell: (i) => orDash(i.spec), long: true },
    { label: "단위", cell: (i) => i.unit, mono: true },
    { label: "조달구분", cell: (i) => procTypeName(i.procurement) },
    {
      label: "검사 대상",
      cell: (i) => [i.inspectIn && "수입", i.inspectOut && "출하"].filter(Boolean).join(" · ") || "—",
    },
    // 재고(조각 「재고 수불」 PR B) — 규칙은 반제품 · 완제품만 있고, 비우면 유형의 기본 규칙이다.
    { label: "LOT 관리", cell: (i) => (i.lotManaged ? "함" : "안 함") },
    {
      label: "LOT 번호 규칙",
      cell: (i) => (isMadeType(i.itemType) ? (i.lotRuleCode ?? "유형의 기본") : "—"),
      mono: true,
    },
    { label: "기본 입고 창고", cell: (i) => warehouse(i.defaultInWarehouseId) },
    { label: "기본 출고 창고", cell: (i) => warehouse(i.defaultOutWarehouseId) },
    { label: "리드타임", cell: (i) => `${i.leadTimeDays}일`, numeric: true },
    { label: "안전재고", cell: (i) => qty(i.safetyStock), numeric: true },
    { label: "최소 발주 · 생산량", cell: (i) => qty(i.minLot), numeric: true },
    { label: "발주 · 생산 배수", cell: (i) => (i.lotMultiple ? qty(i.lotMultiple) : "없음"), numeric: true },
    ...ITEM_CLASSES.map(({ field, label }) => ({
      label,
      // 이름을 모르는 값은 코드 그대로.
      cell: (i: Item) => {
        const code = i[field];
        return code ? (classes[field].find((c) => c.code === code)?.name ?? code) : "—";
      },
    })),
    { label: "비고", cell: (i) => orDash(i.note), long: true },
    { label: "사용 여부", cell: (i) => (i.active ? "사용" : "사용 안 함") },
    { label: "수정일", cell: (i) => dateKst(i.updatedAt), mono: true },
  ];
}
