import { ITEM_TYPES, MOVE_TYPES, PROC_TYPES, type ItemType } from "@/lib/master-codes";
import type { MoveLineValues } from "@/lib/move-input";
import type { MoveType } from "@/lib/master-codes";
import type { codeGroups, codes, items, numberRules, partners, unitSpecs, warehouses } from "./schema";

// 샘플 데이터 — 가상 반도체 후공정(패키징) 회사. 매일 밤 되돌림(ADR 0004)과 첫 배포가 이 값으로 테이블을 채운다.
// 실제 회사명 · 실제 사람의 정보를 쓰지 않는다(CLAUDE.md). 거래처 이름은 「(가상)」으로 시작하고,
// 사업자등록번호는 실제로 발급되지 않는 「000-00-」 꼴만 쓴다. 해외 거래처의 번호도 실제로 쓰이지 않는 꼴이다 —
// 일본 법인번호(13자리)는 0 으로 채우고, 미국 EIN 은 발급되지 않는 머리 00 을 쓴다.
// 대표자 · 담당자는 서식 예시에 널리 쓰는 본보기 이름이고, 전화는 쓰이지 않는 0000 번호, 이메일은 예시 전용 주소(example.com),
// 주소는 없는 지명(가상시)이다(저자 인터뷰 2026-11-04).

type New<T extends { $inferInsert: unknown }> = T["$inferInsert"];

export const SAMPLE_CODE_GROUPS: New<typeof codeGroups>[] = [
  { code: "ITEM_TYPE", name: "품목 유형", isSystem: true },
  { code: "PROC_TYPE", name: "조달구분", isSystem: true },
  { code: "UNIT", name: "단위", isSystem: false },
  { code: "COUNTRY", name: "국가", isSystem: false },
  // 품목 분류 — 대분류는 종류, 중분류는 패키지, 소분류는 용도(저자 인터뷰 2026-11-04, ADR 0012).
  { code: "ITEM_CLS1", name: "품목 대분류", isSystem: false },
  { code: "ITEM_CLS2", name: "품목 중분류", isSystem: false },
  { code: "ITEM_CLS3", name: "품목 소분류", isSystem: false },
  // 재고 수불(PR C, ADR 0016) — 수불 유형은 재고 계산이 기대는 시스템 코드, 조정 사유는 사용자 코드.
  { code: "MOVE_TYPE", name: "수불 유형", isSystem: true },
  { code: "ADJ_REASON", name: "조정 사유", isSystem: false },
];

export const SAMPLE_CODES: New<typeof codes>[] = [
  ...ITEM_TYPES.map((t, i) => ({ groupCode: "ITEM_TYPE", code: t.code, name: t.name, sortOrder: (i + 1) * 10 })),
  ...PROC_TYPES.map((t, i) => ({ groupCode: "PROC_TYPE", code: t.code, name: t.name, sortOrder: (i + 1) * 10 })),
  ...MOVE_TYPES.map((t, i) => ({ groupCode: "MOVE_TYPE", code: t.code, name: t.name, sortOrder: (i + 1) * 10 })),
  { groupCode: "ADJ_REASON", code: "COUNT", name: "실사 차이", sortOrder: 10 },
  { groupCode: "ADJ_REASON", code: "DAMAGE", name: "파손", sortOrder: 20 },
  { groupCode: "ADJ_REASON", code: "LOSS", name: "분실", sortOrder: 30 },
  { groupCode: "ADJ_REASON", code: "FOUND", name: "발견", sortOrder: 40 },
  { groupCode: "ADJ_REASON", code: "ETC", name: "기타", sortOrder: 50 },
  { groupCode: "UNIT", code: "EA", name: "개", sortOrder: 10 },
  { groupCode: "UNIT", code: "M", name: "미터", sortOrder: 20 },
  { groupCode: "UNIT", code: "KG", name: "킬로그램", sortOrder: 30 },
  { groupCode: "UNIT", code: "G", name: "그램", sortOrder: 40 },
  // 조각 「재고 수불」 PR A 가 더한 단위(저자 인터뷰 2026-11-05) — 같은 기준의 단위로 바꿔 넣는다(ADR 0017).
  { groupCode: "UNIT", code: "MM", name: "밀리미터", sortOrder: 50 },
  { groupCode: "UNIT", code: "L", name: "리터", sortOrder: 60 },
  { groupCode: "UNIT", code: "ML", name: "밀리리터", sortOrder: 70 },
  { groupCode: "UNIT", code: "MG", name: "밀리그램", sortOrder: 80 },
  // 국가 — 국제 표준 두 글자(ADR 0011). 마이그레이션 0001(손으로 쓴 것)이 데이터가 있는 DB 에 같은 값을 넣는다(시험이 견준다).
  { groupCode: "COUNTRY", code: "KR", name: "한국", sortOrder: 10 },
  { groupCode: "COUNTRY", code: "US", name: "미국", sortOrder: 20 },
  { groupCode: "COUNTRY", code: "JP", name: "일본", sortOrder: 30 },
  { groupCode: "COUNTRY", code: "CN", name: "중국", sortOrder: 40 },
  { groupCode: "COUNTRY", code: "TW", name: "대만", sortOrder: 50 },
  // 품목 분류 — 마이그레이션 0003(손으로 쓴 것)이 데이터가 있는 DB 에 같은 값을 넣는다(시험이 견준다).
  { groupCode: "ITEM_CLS1", code: "WAFER", name: "웨이퍼", sortOrder: 10 },
  { groupCode: "ITEM_CLS1", code: "FRAME", name: "리드프레임", sortOrder: 20 },
  { groupCode: "ITEM_CLS1", code: "WIRE", name: "와이어", sortOrder: 30 },
  { groupCode: "ITEM_CLS1", code: "CHEM", name: "화학재료", sortOrder: 40 },
  { groupCode: "ITEM_CLS1", code: "WIP", name: "공정품", sortOrder: 50 },
  { groupCode: "ITEM_CLS1", code: "IC", name: "IC", sortOrder: 60 },
  // 부자재 · 소모품의 종류(조각 「재고 수불」 PR B — 저자 판정 2026-11-06). 마이그레이션 0008 이 데이터가 있는 DB 에 같은 값을 넣는다.
  { groupCode: "ITEM_CLS1", code: "PACK", name: "포장재", sortOrder: 70 },
  { groupCode: "ITEM_CLS1", code: "TOOL", name: "공구", sortOrder: 80 },
  { groupCode: "ITEM_CLS2", code: "SOP", name: "SOP", sortOrder: 10 },
  { groupCode: "ITEM_CLS2", code: "QFN", name: "QFN", sortOrder: 20 },
  { groupCode: "ITEM_CLS2", code: "COMMON", name: "공용", sortOrder: 30 },
  { groupCode: "ITEM_CLS3", code: "POWER", name: "전원", sortOrder: 10 },
  { groupCode: "ITEM_CLS3", code: "SENSOR", name: "센서", sortOrder: 20 },
  { groupCode: "ITEM_CLS3", code: "GENERAL", name: "범용", sortOrder: 30 },
];

/**
 * 단위 사양(ADR 0017) — 단위마다 기준 단위 · 배수 · 소수 자릿수. 샘플의 단위(UNIT 값) 하나하나에 하나씩 있다(시험이 견준다).
 * 마이그레이션 0006 이 데이터가 있는 DB 에 넣는 값과 같다.
 */
export const SAMPLE_UNIT_SPECS: New<typeof unitSpecs>[] = [
  { unit: "EA", baseUnit: "EA", factor: 1, decimals: 0 },
  { unit: "M", baseUnit: "M", factor: 1, decimals: 3 },
  { unit: "KG", baseUnit: "G", factor: 1000, decimals: 3 },
  { unit: "G", baseUnit: "G", factor: 1, decimals: 0 },
  { unit: "MM", baseUnit: "M", factor: 0.001, decimals: 0 },
  { unit: "L", baseUnit: "ML", factor: 1000, decimals: 3 },
  { unit: "ML", baseUnit: "ML", factor: 1, decimals: 0 },
  { unit: "MG", baseUnit: "G", factor: 0.001, decimals: 0 },
];

export const SAMPLE_WAREHOUSES: New<typeof warehouses>[] = [
  { code: "WH-01", name: "자재창고" },
  { code: "WH-02", name: "생산현장" },
  { code: "WH-03", name: "제품창고" },
  // 불량창고 표시(조각 「재고 수불」 PR B, ADR 0015) — 이 창고의 재고는 불량이라 가용에 들지 않는다.
  { code: "WH-04", name: "불량창고", isDefect: true },
];

/**
 * LOT 번호 규칙(조각 「재고 수불」 PR B, ADR 0016 · 저자 판정 2026-11-06) — 반제품 · 완제품의 기본 규칙 둘과,
 * 품목에서 다른 규칙을 고르는 것을 보이는 숫자형 하나(센서 IC 가 고른다). 마이그레이션 0008 이 데이터가 있는 DB 에 같은 값을 넣는다.
 */
export const SAMPLE_NUMBER_RULES: New<typeof numberRules>[] = [
  {
    code: "LOT_SF",
    name: "반제품 LOT",
    prefix: "SF",
    separator: "-",
    dateFormat: "YYMMDD",
    seqDigits: 3,
    defaultFor: "SF",
  },
  {
    code: "LOT_FG",
    name: "완제품 LOT",
    prefix: "FG",
    separator: "-",
    dateFormat: "YYMMDD",
    seqDigits: 3,
    defaultFor: "FG",
  },
  { code: "LOT_NUM", name: "숫자형 LOT", prefix: "", separator: "", dateFormat: "YYMMDD", seqDigits: 3 },
];

/**
 * 유형마다 품목의 기본 입고 · 출고 창고(저자 판정 2026-11-06 — 설계 「PR B 를 열기 전에 정한 것」). 사 오는 품목은 자재창고에 들어와
 * 생산현장으로 옮긴 뒤 현장에서 나간다. 되돌림이 창고 코드를 번호(id)로 바꿔 샘플 품목에 넣는다.
 */
export const SAMPLE_DEFAULT_WAREHOUSES: Record<ItemType, { in: string; out: string }> = {
  RM: { in: "WH-01", out: "WH-02" },
  SM: { in: "WH-01", out: "WH-02" },
  CS: { in: "WH-01", out: "WH-02" },
  SF: { in: "WH-02", out: "WH-02" },
  FG: { in: "WH-03", out: "WH-03" },
};

export const SAMPLE_PARTNERS: New<typeof partners>[] = [
  {
    code: "BP-0001",
    name: "(가상) 가람리드프레임",
    isSupplier: true,
    bizNo: "000-00-00001",
    ceo: "홍길동",
    bizType: "제조업",
    bizItem: "리드프레임",
    address: "가상시 가람구 산단로 101",
    phone: "031-0000-0001",
    email: "sales@garam.example.com",
    contactName: "김철수",
    contactPhone: "010-0000-0001",
    note: "SOP · QFN 리드프레임 주 공급처",
  },
  {
    code: "BP-0002",
    name: "(가상) 누리와이어",
    isSupplier: true,
    bizNo: "000-00-00002",
    ceo: "성춘향",
    bizType: "제조업",
    bizItem: "본딩 와이어",
    address: "가상시 누리구 금속로 22",
    phone: "031-0000-0002",
    email: "order@nuri.example.com",
    contactName: "이영희",
    contactPhone: "010-0000-0002",
  },
  {
    code: "BP-0003",
    name: "(가상) 다온케미칼",
    isSupplier: true,
    bizNo: "000-00-00003",
    ceo: "이몽룡",
    bizType: "제조업",
    bizItem: "반도체 재료",
    address: "가상시 다온구 화학로 3",
    phone: "041-0000-0003",
    email: "info@daon.example.com",
  },
  {
    code: "BP-0004",
    name: "(가상) 라온전자",
    isCustomer: true,
    bizNo: "000-00-00004",
    ceo: "심청",
    bizType: "제조업",
    bizItem: "전자기기",
    address: "가상시 라온구 전자로 44",
    phone: "02-0000-0004",
    email: "purchase@raon.example.com",
    contactName: "김영희",
    contactPhone: "010-0000-0004",
  },
  {
    code: "BP-0005",
    name: "(가상) 마루반도체",
    isSupplier: true,
    isCustomer: true,
    bizNo: "000-00-00005",
    ceo: "임꺽정",
    bizType: "제조업 · 도소매",
    bizItem: "반도체",
    address: "가상시 마루구 반도체로 5",
    phone: "031-0000-0005",
    email: "biz@maru.example.com",
    contactName: "이철수",
    contactPhone: "010-0000-0005",
    note: "웨이퍼를 사 오고 패키징한 IC 를 판다",
  },
  // 해외 — 일본의 몰딩 재료(EMC) 매입처, 미국의 IC 고객 매출처(저자 인터뷰 2026-11-03). 업태 · 종목은 한국 세법의 칸이라 비운다.
  {
    code: "BP-0006",
    name: "(가상) 소라몰드머티리얼",
    isSupplier: true,
    country: "JP",
    foreignBizNo: "0000000000006",
    ceo: "Taro Yamada",
    address: "1-6 Kaso-cho, Kaso City, Japan",
    phone: "+81-0-0000-0006",
    email: "export@sora.example.com",
    contactName: "Hanako Yamada",
    contactPhone: "+81-00-0000-0006",
    note: "EMC 주 공급처",
  },
  {
    code: "BP-0007",
    name: "(가상) 노스필드디바이스",
    isCustomer: true,
    country: "US",
    foreignBizNo: "00-0000007",
    ceo: "John Doe",
    address: "7 Example Ave, Kaso City, USA",
    phone: "+1-000-000-0007",
    email: "buyer@northfield.example.com",
    contactName: "Jane Doe",
    contactPhone: "+1-000-000-0070",
  },
];

// 원자재 → 구매 · 수입검사, 반제품 · 완제품 → 생산, 완제품 → 출하검사(ADR 0003 의 기본값).
// 부자재 · 소모품 → 구매 · LOT 관리 끔 · 검사 끔(ADR 0019). LOT 관리는 DB 의 기본값(켬)이라 끄는 것만 적는다.
const rm = { itemType: "RM", procurement: "BUY", inspectIn: true } as const;
const sf = { itemType: "SF", procurement: "MAKE" } as const;
const fg = { itemType: "FG", procurement: "MAKE", inspectOut: true } as const;
const sm = { itemType: "SM", procurement: "BUY", lotManaged: false } as const;
const cs = { itemType: "CS", procurement: "BUY", lotManaged: false } as const;

export const SAMPLE_ITEMS: New<typeof items>[] = [
  {
    ...rm,
    code: "RM-0001",
    cls1: "WAFER",
    cls2: "COMMON",
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
    cls1: "FRAME",
    cls2: "SOP",
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
    cls1: "WIRE",
    cls2: "COMMON",
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
    cls1: "CHEM",
    cls2: "COMMON",
    note: "냉장 보관(5℃ 이하)",
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
    cls1: "CHEM",
    cls2: "COMMON",
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
    cls1: "FRAME",
    cls2: "QFN",
    name: "QFN 리드프레임",
    spec: "QFN-32 · 5×5mm",
    unit: "EA",
    leadTimeDays: 14,
    safetyStock: 10000,
    minLot: 5000,
    lotMultiple: 5000,
  },
  {
    ...sf,
    code: "SF-0001",
    cls1: "WIP",
    cls2: "SOP",
    cls3: "POWER",
    name: "다이 본딩 완료품",
    spec: "SOP-8 · 와이어 본딩 전",
    unit: "EA",
    leadTimeDays: 1,
  },
  {
    ...sf,
    code: "SF-0002",
    cls1: "WIP",
    cls2: "SOP",
    cls3: "POWER",
    name: "몰딩 완료품",
    spec: "SOP-8 · 도금 · 절단 전",
    unit: "EA",
    leadTimeDays: 1,
  },
  {
    ...fg,
    code: "FG-0001",
    cls1: "IC",
    cls2: "SOP",
    cls3: "POWER",
    note: "주력 제품",
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
    cls1: "IC",
    cls2: "QFN",
    cls3: "SENSOR",
    name: "센서 IC",
    spec: "QFN-32 패키지",
    unit: "EA",
    leadTimeDays: 3,
    safetyStock: 1000,
    minLot: 500,
    lotMultiple: 500,
    // 품목에서 다른 LOT 규칙을 고른다 — 숫자만인 꼴(ADR 0016, 저자 판정 2026-11-06).
    lotRuleCode: "LOT_NUM",
  },
  // 부자재 · 소모품(조각 「재고 수불」 PR B — 저자 판정 2026-11-06). 마이그레이션 0008 이 데이터가 있는 DB 에 같은 값을 넣는다.
  {
    ...sm,
    code: "SM-0001",
    cls1: "PACK",
    cls2: "SOP",
    name: "캐리어 테이프",
    spec: "폭 12mm · SOP-8 용",
    unit: "M",
    leadTimeDays: 7,
    safetyStock: 2000,
    minLot: 1000,
    lotMultiple: 500,
  },
  {
    ...sm,
    code: "SM-0002",
    cls1: "PACK",
    cls2: "COMMON",
    name: "방습백",
    spec: "알루미늄 · 건조제 동봉",
    unit: "EA",
    leadTimeDays: 7,
    safetyStock: 500,
    minLot: 500,
    lotMultiple: 100,
  },
  {
    ...cs,
    code: "CS-0001",
    cls1: "TOOL",
    cls2: "COMMON",
    name: "다이싱 블레이드",
    spec: "두께 30µm",
    unit: "EA",
    leadTimeDays: 14,
    safetyStock: 10,
    minLot: 5,
    lotMultiple: 5,
  },
  {
    ...cs,
    code: "CS-0002",
    cls1: "CHEM",
    cls2: "COMMON",
    name: "세정용 IPA",
    spec: "순도 99.9%",
    unit: "L",
    leadTimeDays: 5,
    safetyStock: 20,
    minLot: 20,
    lotMultiple: 20,
  },
];

/**
 * 샘플 수불(조각 「재고 수불」 PR C — 저자 판정 2026-11-09, 설계 「2026-11-09 — PR C 를 열기 전에 정한 것」). 날짜는 되돌린 날 D 에서 센다(daysAgo).
 * 오늘 날짜의 전표는 두지 않아 그날 첫 전표가 IV-<오늘>-001 이다. 거래처 LOT 는 지어낸 번호다(CLAUDE.md — 실제 거래처의 LOT 꼴을 쓰지 않는다).
 * 반제품 · 완제품은 LOT 를 비워 번호 규칙으로 받는다. 되돌림이 재고 계산의 저장(src/db/stock.ts)을 불러 넣는다 — 잔액 · 번호 · LOT 일련이 맞는다.
 * cancel 이면 같은 날 그 전표를 취소한다.
 */
export type SampleMove = {
  daysAgo: number;
  moveType: MoveType;
  reason?: string;
  note?: string;
  lines: MoveLineValues[];
  cancel?: true;
};

export const SAMPLE_MOVES: SampleMove[] = [
  {
    daysAgo: 7,
    moveType: "IN",
    note: "기초 재고",
    lines: [
      { item: "RM-0001", lot: "MW-A1021", warehouse: "WH-01", qty: "100" },
      { item: "RM-0002", lot: "GL-S8-5501", warehouse: "WH-01", qty: "30000" },
      { item: "RM-0003", lot: "NW-25-0701", warehouse: "WH-01", qty: "8000" },
      { item: "RM-0004", lot: "SR-K3108", warehouse: "WH-01", qty: "75" },
      { item: "RM-0005", lot: "DA-AG-1150", warehouse: "WH-01", qty: "1000" },
      { item: "RM-0006", lot: "GL-Q32-2207", warehouse: "WH-01", qty: "15000" },
      { item: "SF-0001", warehouse: "WH-02", qty: "2000" },
      { item: "SF-0002", warehouse: "WH-02", qty: "1500" },
      { item: "FG-0001", warehouse: "WH-03", qty: "3000" },
      { item: "FG-0002", warehouse: "WH-03", qty: "1500" },
      { item: "SM-0001", warehouse: "WH-01", qty: "3000" },
      { item: "SM-0002", warehouse: "WH-01", qty: "800" },
      { item: "CS-0001", warehouse: "WH-01", qty: "20" },
      { item: "CS-0002", warehouse: "WH-01", qty: "40" },
    ],
  },
  {
    daysAgo: 5,
    moveType: "XFER",
    note: "생산 불출",
    lines: [
      { item: "RM-0001", lot: "MW-A1021", warehouse: "WH-01", toWarehouse: "WH-02", qty: "25" },
      { item: "RM-0002", lot: "GL-S8-5501", warehouse: "WH-01", toWarehouse: "WH-02", qty: "10000" },
      { item: "RM-0003", lot: "NW-25-0701", warehouse: "WH-01", toWarehouse: "WH-02", qty: "2000" },
      { item: "RM-0004", lot: "SR-K3108", warehouse: "WH-01", toWarehouse: "WH-02", qty: "25" },
      { item: "RM-0005", lot: "DA-AG-1150", warehouse: "WH-01", toWarehouse: "WH-02", qty: "250" },
      { item: "SM-0001", warehouse: "WH-01", toWarehouse: "WH-02", qty: "1000" },
      { item: "CS-0001", warehouse: "WH-01", toWarehouse: "WH-02", qty: "4" },
      { item: "CS-0002", warehouse: "WH-01", toWarehouse: "WH-02", qty: "10" },
    ],
  },
  {
    daysAgo: 4,
    moveType: "IN",
    lines: [{ item: "RM-0003", lot: "NW-25-0702", warehouse: "WH-01", qty: "2000" }],
  },
  {
    daysAgo: 3,
    moveType: "OUT",
    note: "소모",
    lines: [
      { item: "CS-0001", warehouse: "WH-02", qty: "2" },
      { item: "CS-0002", warehouse: "WH-02", qty: "4" },
    ],
  },
  {
    daysAgo: 3,
    moveType: "OUT",
    note: "견본 출고",
    lines: [{ item: "FG-0001", lot: "@FG-0001", warehouse: "WH-03", qty: "500" }],
  },
  {
    daysAgo: 2,
    moveType: "ADJ",
    reason: "DAMAGE",
    lines: [{ item: "RM-0002", lot: "GL-S8-5501", warehouse: "WH-02", qty: "-50" }],
  },
  { daysAgo: 2, moveType: "ADJ", reason: "FOUND", lines: [{ item: "SM-0002", warehouse: "WH-01", qty: "20" }] },
  {
    daysAgo: 2,
    moveType: "XFER",
    note: "격리",
    lines: [{ item: "SF-0002", lot: "@SF-0002", warehouse: "WH-02", toWarehouse: "WH-04", qty: "30" }],
  },
  { daysAgo: 1, moveType: "IN", lines: [{ item: "CS-0002", warehouse: "WH-01", qty: "20" }], cancel: true },
];

/**
 * 샘플 재고 실사(조각 「재고 수불」 PR E — 저자 판정, 설계 「2026-11-09 — PR E 를 열기 전에 정한 것」). 날짜는 되돌린 날 D 에서 센다.
 * 샘플 수불 뒤에 그 창고의 장부를 불러 넣는다. counted 는 품목 코드(LOT 가 둘 이상이면 「품목|LOT」)마다의 실물 수량이고, 나머지 줄은
 * rest 가 「book」이면 장부 그대로, 「blank」이면 비운다. confirm 이면 같은 날 확정한다.
 */
export type SampleCount = {
  daysAgo: number;
  warehouse: string;
  counted: Record<string, string>;
  rest: "book" | "blank";
  confirm?: true;
};

export const SAMPLE_COUNTS: SampleCount[] = [
  // 생산현장 — 금 와이어만 5 M 모자라 「실사 차이」 −5 M 의 조정 전표 한 장(IV-<D-1>-003)이 생긴다.
  { daysAgo: 1, warehouse: "WH-02", counted: { "RM-0003|NW-25-0701": "1995" }, rest: "book", confirm: true },
  // 제품창고 — 작성 중. 전원 관리 IC 는 넣었고 센서 IC 는 비워 두어, 확정하려면 마저 넣어야 한다.
  { daysAgo: 1, warehouse: "WH-03", counted: { "FG-0001": "2500" }, rest: "blank" },
];
