import { ITEM_TYPES, PROC_TYPES } from "@/lib/master-codes";
import type { codeGroups, codes, items, partners, warehouses } from "./schema";

// 샘플 데이터 — 가상 반도체 후공정(패키징) 회사. 매일 밤 되돌림(ADR 0004)과 첫 배포가 이 값으로 테이블을 채운다.
// 실제 회사명 · 실제 사람의 정보를 쓰지 않는다(CLAUDE.md). 거래처 이름은 「(가상)」으로 시작하고,
// 사업자등록번호는 실제로 발급되지 않는 「000-00-」 꼴만 쓴다.

type New<T extends { $inferInsert: unknown }> = T["$inferInsert"];

export const SAMPLE_CODE_GROUPS: New<typeof codeGroups>[] = [
  { code: "ITEM_TYPE", name: "품목 유형", isSystem: true },
  { code: "PROC_TYPE", name: "조달구분", isSystem: true },
  { code: "UNIT", name: "단위", isSystem: false },
];

export const SAMPLE_CODES: New<typeof codes>[] = [
  ...ITEM_TYPES.map((t, i) => ({ groupCode: "ITEM_TYPE", code: t.code, name: t.name, sortOrder: (i + 1) * 10 })),
  ...PROC_TYPES.map((t, i) => ({ groupCode: "PROC_TYPE", code: t.code, name: t.name, sortOrder: (i + 1) * 10 })),
  { groupCode: "UNIT", code: "EA", name: "개", sortOrder: 10 },
  { groupCode: "UNIT", code: "M", name: "미터", sortOrder: 20 },
  { groupCode: "UNIT", code: "KG", name: "킬로그램", sortOrder: 30 },
  { groupCode: "UNIT", code: "G", name: "그램", sortOrder: 40 },
];

export const SAMPLE_WAREHOUSES: New<typeof warehouses>[] = [
  { code: "WH-01", name: "자재창고" },
  { code: "WH-02", name: "생산현장" },
  { code: "WH-03", name: "제품창고" },
  { code: "WH-04", name: "불량창고" },
];

export const SAMPLE_PARTNERS: New<typeof partners>[] = [
  { code: "BP-0001", name: "(가상) 가람리드프레임", isSupplier: true, bizNo: "000-00-00001" },
  { code: "BP-0002", name: "(가상) 누리와이어", isSupplier: true, bizNo: "000-00-00002" },
  { code: "BP-0003", name: "(가상) 다온케미칼", isSupplier: true, bizNo: "000-00-00003" },
  { code: "BP-0004", name: "(가상) 라온전자", isCustomer: true, bizNo: "000-00-00004" },
  { code: "BP-0005", name: "(가상) 마루반도체", isSupplier: true, isCustomer: true, bizNo: "000-00-00005" },
];

// 원자재 → 구매 · 수입검사, 반제품 · 완제품 → 생산, 완제품 → 출하검사(ADR 0003 의 기본값).
const rm = { itemType: "RM", procurement: "BUY", inspectIn: true } as const;
const sf = { itemType: "SF", procurement: "MAKE" } as const;
const fg = { itemType: "FG", procurement: "MAKE", inspectOut: true } as const;

export const SAMPLE_ITEMS: New<typeof items>[] = [
  {
    ...rm,
    code: "RM-0001",
    name: "웨이퍼",
    spec: "8인치 · 두께 200µm",
    unit: "EA",
    leadTimeDays: 21,
    safetyStock: 50,
    minLot: 25,
    lotMultiple: 25,
  },
  {
    ...rm,
    code: "RM-0002",
    name: "리드프레임",
    spec: "SOP-8 · 구리 합금",
    unit: "EA",
    leadTimeDays: 14,
    safetyStock: 20000,
    minLot: 10000,
    lotMultiple: 5000,
  },
  {
    ...rm,
    code: "RM-0003",
    name: "금 와이어",
    spec: "지름 25µm",
    unit: "M",
    leadTimeDays: 10,
    safetyStock: 5000,
    minLot: 2000,
    lotMultiple: 1000,
  },
  {
    ...rm,
    code: "RM-0004",
    name: "에폭시 몰딩 컴파운드",
    spec: "EMC · 흑색",
    unit: "KG",
    leadTimeDays: 14,
    safetyStock: 50,
    minLot: 25,
    lotMultiple: 25,
  },
  {
    ...rm,
    code: "RM-0005",
    name: "다이 접착제",
    spec: "은 페이스트",
    unit: "G",
    leadTimeDays: 7,
    safetyStock: 500,
    minLot: 250,
    lotMultiple: 250,
  },
  {
    ...rm,
    code: "RM-0006",
    name: "QFN 리드프레임",
    spec: "QFN-32 · 5×5mm",
    unit: "EA",
    leadTimeDays: 14,
    safetyStock: 10000,
    minLot: 5000,
    lotMultiple: 5000,
  },
  { ...sf, code: "SF-0001", name: "다이 본딩 완료품", spec: "SOP-8 · 와이어 본딩 전", unit: "EA", leadTimeDays: 1 },
  { ...sf, code: "SF-0002", name: "몰딩 완료품", spec: "SOP-8 · 도금 · 절단 전", unit: "EA", leadTimeDays: 1 },
  {
    ...fg,
    code: "FG-0001",
    name: "전원 관리 IC",
    spec: "SOP-8 패키지",
    unit: "EA",
    leadTimeDays: 3,
    safetyStock: 2000,
    minLot: 1000,
    lotMultiple: 1000,
  },
  {
    ...fg,
    code: "FG-0002",
    name: "센서 IC",
    spec: "QFN-32 패키지",
    unit: "EA",
    leadTimeDays: 3,
    safetyStock: 1000,
    minLot: 500,
    lotMultiple: 500,
  },
];
