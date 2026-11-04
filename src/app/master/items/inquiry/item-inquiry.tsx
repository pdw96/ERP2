import type { Item, ItemClassOptions } from "@/db/items";
import { dateKst, orDash, type InquiryColumn } from "@/components/inquiry-table";
import { ITEM_CLASSES } from "@/lib/item-fields";
import { itemTypeName, procTypeName } from "@/lib/master-codes";

// 품목 조회의 칸 — 한 건 등록 화면 · 시트의 순서 그대로, 끝에 사용 여부 · 수정일(저자 판정 2026-11-04).
// 품명은 왼쪽에 붙는 칸(코드 · 품명)에 있다.

const qty = (n: number) => n.toLocaleString("ko-KR", { maximumFractionDigits: 3 });

export function itemInquiryColumns(classes: ItemClassOptions): InquiryColumn<Item>[] {
  return [
    { label: "유형", cell: (i) => itemTypeName(i.itemType) },
    { label: "규격", cell: (i) => orDash(i.spec), long: true },
    { label: "단위", cell: (i) => i.unit, mono: true },
    { label: "조달구분", cell: (i) => procTypeName(i.procurement) },
    {
      label: "검사 대상",
      cell: (i) => [i.inspectIn && "수입", i.inspectOut && "출하"].filter(Boolean).join(" · ") || "—",
    },
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
