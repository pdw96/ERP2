import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

// 조각 「기준정보」의 테이블 다섯과 조각 「재고 수불」의 테이블(docs/schema.md · 설계도의 「이 조각의 테이블」).
// 코드의 꼴은 앵커볼트(ADR 0003 · 0009)라 DB 의 제약으로도 막는다 — 화면 · 서버를 건너뛴 값도 들어오지 않는다.
// 이 파일을 바꾸면 `npx drizzle-kit generate` 로 drizzle/ 의 마이그레이션을 만들어 함께 올린다.

const id = () => integer("id").primaryKey().generatedAlwaysAsIdentity();
const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
// 품목의 수량 — 품목의 단위로 소수 셋째 자리까지.
const qty = (name: string) => numeric(name, { precision: 12, scale: 3, mode: "number" }).notNull().default(0);

/** 공통코드 묶음(Major). 화면에서 만들지 않고, 그것을 쓰는 조각의 PR 이 더한다. */
export const codeGroups = pgTable(
  "code_groups",
  {
    id: id(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    isSystem: boolean("is_system").notNull().default(false),
    ...timestamps(),
  },
  (t) => [
    check("code_groups_code_format", sql`${t.code} ~ '^[A-Z][A-Z0-9_]{1,19}$'`),
    check("code_groups_name_length", sql`char_length(${t.name}) between 1 and 50`),
  ],
);

/** 공통코드 값(Minor). 묶음 + 코드가 겹치지 않는다. */
export const codes = pgTable(
  "codes",
  {
    id: id(),
    groupCode: text("group_code")
      .notNull()
      .references(() => codeGroups.code),
    code: text("code").notNull(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    unique("codes_group_code_code_unique").on(t.groupCode, t.code),
    check("codes_code_format", sql`${t.code} ~ '^[A-Z0-9][A-Z0-9_]{0,19}$'`),
    check("codes_name_length", sql`char_length(${t.name}) between 1 and 50`),
    check("codes_sort_order_range", sql`${t.sortOrder} between 0 and 999`),
  ],
);

/**
 * 단위 사양(조각 「재고 수불」 PR A, ADR 0017) — 공통코드 UNIT 의 값마다 기준 단위 · 배수 · 소수 자릿수.
 * 같은 기준의 단위 사이는 배수로 바꿔 넣는다(1 KG = 1000 G). 기준 단위는 그 자신이 기준인 단위(배수 1)여야 한다 —
 * (기준 단위, 기준 단위)가 이 표의 (단위, 기준 단위)를 가리키게 해 DB 가 막는다. 기준 · 배수는 등록 뒤 바꾸지 않는다(서버가 막는다).
 */
export const unitSpecs = pgTable(
  "unit_specs",
  {
    id: id(),
    unitGroup: text("unit_group").notNull().default("UNIT"),
    unit: text("unit").notNull(),
    baseUnit: text("base_unit").notNull(),
    factor: numeric("factor", { precision: 18, scale: 6, mode: "number" }).notNull(),
    decimals: smallint("decimals").notNull(),
    ...timestamps(),
  },
  (t) => [
    unique("unit_specs_unit_unique").on(t.unit),
    unique("unit_specs_unit_base_unique").on(t.unit, t.baseUnit),
    foreignKey({
      name: "unit_specs_unit_fk",
      columns: [t.unitGroup, t.unit],
      foreignColumns: [codes.groupCode, codes.code],
    }),
    foreignKey({
      name: "unit_specs_base_fk",
      columns: [t.baseUnit, t.baseUnit],
      foreignColumns: [t.unit, t.baseUnit],
    }),
    check("unit_specs_unit_group_fixed", sql`${t.unitGroup} = 'UNIT'`),
    check("unit_specs_factor_positive", sql`${t.factor} > 0`),
    check("unit_specs_base_factor_one", sql`${t.unit} <> ${t.baseUnit} or ${t.factor} = 1`),
    check("unit_specs_decimals_range", sql`${t.decimals} between 0 and 3`),
  ],
);

/**
 * 창고. 위치(랙 · 선반)는 두지 않는다(ADR 0003).
 * 불량창고(`is_defect`, 조각 「재고 수불」 PR B · ADR 0015) — 그 창고의 재고는 불량이라 가용에 들지 않고, 품목의 기본 창고로 고르지 못한다.
 */
export const warehouses = pgTable(
  "warehouses",
  {
    id: id(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    isDefect: boolean("is_defect").notNull().default(false),
    active: boolean("active").notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    // 품목의 기본 창고가 (번호, 불량창고 아님)을 가리키는 열쇠 — 불량창고를 기본 창고로 두는 것을 DB 가 막는다(ADR 0015).
    unique("warehouses_id_defect_unique").on(t.id, t.isDefect),
    check("warehouses_code_format", sql`${t.code} ~ '^WH-[0-9]{2,}$'`),
    check("warehouses_name_length", sql`char_length(${t.name}) between 1 and 50`),
  ],
);

/**
 * LOT 번호 규칙(조각 「재고 수불」 PR B, ADR 0016) — 머리 · 구분자 · 날짜 꼴 · 일련 자릿수. 번호는 늘 머리 → 날짜 → 일련이고,
 * 있는 조각 사이에 구분자를 넣는다(src/lib/number-rule.ts). 만드는 품목(반제품 · 완제품)에만 쓴다.
 * 유형마다 기본 규칙이 하나다(`default_for`) — 기본 규칙은 「사용 안 함」이 아니다. 규칙은 지우지 않는다.
 */
export const numberRules = pgTable(
  "number_rules",
  {
    id: id(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    prefix: text("prefix").notNull().default(""),
    separator: text("separator").notNull().default(""),
    dateFormat: text("date_format").notNull().default(""),
    seqDigits: smallint("seq_digits").notNull(),
    defaultFor: text("default_for").unique(),
    active: boolean("active").notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    check("number_rules_code_format", sql`${t.code} ~ '^[A-Z][A-Z0-9_]{1,19}$'`),
    check("number_rules_name_length", sql`char_length(${t.name}) between 1 and 50`),
    check("number_rules_prefix_format", sql`${t.prefix} ~ '^[A-Z0-9]{0,6}$'`),
    check("number_rules_separator_values", sql`${t.separator} in ('', '-', '_', '.')`),
    check("number_rules_date_format_values", sql`${t.dateFormat} in ('', 'YYMMDD', 'YYYYMMDD', 'YYMM')`),
    check("number_rules_seq_digits_range", sql`${t.seqDigits} between 2 and 6`),
    check("number_rules_default_for_values", sql`${t.defaultFor} in ('SF', 'FG')`),
    check("number_rules_default_active", sql`${t.defaultFor} is null or ${t.active}`),
  ],
);

/**
 * 번호 규칙의 일련 — 규칙 · 기간마다 마지막으로 낸 일련. 기간은 날짜 꼴로 쓴 날짜(`261105` · `20261105` · `2611`, 날짜 꼴이 없으면 빈 글자)라
 * 날짜 꼴의 단위로 다시 센다. LOT 번호를 저절로 붙일 때만 행이 생긴다 — 사람이 넣는 입구가 없다.
 */
export const numberRuleSeqs = pgTable(
  "number_rule_seqs",
  {
    id: id(),
    ruleCode: text("rule_code")
      .notNull()
      .references(() => numberRules.code),
    period: text("period").notNull().default(""),
    lastSeq: integer("last_seq").notNull(),
    ...timestamps(),
  },
  (t) => [
    unique("number_rule_seqs_rule_period_unique").on(t.ruleCode, t.period),
    check("number_rule_seqs_period_format", sql`${t.period} ~ '^([0-9]{4}|[0-9]{6}|[0-9]{8})?$'`),
    check("number_rule_seqs_last_seq_positive", sql`${t.lastSeq} >= 1`),
  ],
);

/**
 * 품목. 유형 · 조달구분 · 단위는 공통코드의 값만 받는다 — 묶음 칸(`*_group`)은 늘 같은 값이고, 묶음 + 코드로 공통코드를 가리킨다.
 * 코드는 유형 머리 + 네 자리 이상의 일련번호이고, 머리는 유형과 같다.
 */
export const items = pgTable(
  "items",
  {
    id: id(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    spec: text("spec").notNull().default(""),
    itemTypeGroup: text("item_type_group").notNull().default("ITEM_TYPE"),
    itemType: text("item_type").notNull(),
    procurementGroup: text("procurement_group").notNull().default("PROC_TYPE"),
    procurement: text("procurement").notNull(),
    unitGroup: text("unit_group").notNull().default("UNIT"),
    unit: text("unit").notNull(),
    inspectIn: boolean("inspect_in").notNull().default(false),
    inspectOut: boolean("inspect_out").notNull().default(false),
    leadTimeDays: integer("lead_time_days").notNull().default(0),
    safetyStock: qty("safety_stock"),
    minLot: qty("min_lot"),
    lotMultiple: qty("lot_multiple"),
    // 분류(PR H, ADR 0012) — 대 · 중 · 소 를 따로 고른다. 비우면 없음(null)이고, 그때는 참조를 보지 않는다.
    cls1Group: text("cls1_group").notNull().default("ITEM_CLS1"),
    cls1: text("cls1"),
    cls2Group: text("cls2_group").notNull().default("ITEM_CLS2"),
    cls2: text("cls2"),
    cls3Group: text("cls3_group").notNull().default("ITEM_CLS3"),
    cls3: text("cls3"),
    note: text("note").notNull().default(""),
    // 재고 수불(PR B, ADR 0015 · 0016) — LOT 관리 여부, LOT 번호 규칙(반제품 · 완제품만, 비우면 유형의 기본 규칙),
    // 기본 입고 · 출고 창고(비우면 없음, 수불 등록이 창고 칸을 미리 채운다).
    lotManaged: boolean("lot_managed").notNull().default(true),
    lotRuleCode: text("lot_rule_code"),
    defaultInWarehouseId: integer("default_in_warehouse_id"),
    defaultOutWarehouseId: integer("default_out_warehouse_id"),
    // 늘 false — 기본 창고의 참조가 (창고 번호, 이 칸)으로 창고의 (번호, 불량창고)를 가리킨다. 불량창고는 가리킬 수 없고,
    // 기본 창고인 창고를 불량창고로 바꾸는 쓰기도 DB 가 거절한다 — 동시에 저장해도 깨지지 않는다(리뷰 1회차).
    defaultWarehouseDefect: boolean("default_warehouse_defect").notNull().default(false),
    active: boolean("active").notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      name: "items_lot_rule_fk",
      columns: [t.lotRuleCode],
      foreignColumns: [numberRules.code],
    }),
    foreignKey({
      name: "items_default_in_warehouse_fk",
      columns: [t.defaultInWarehouseId, t.defaultWarehouseDefect],
      foreignColumns: [warehouses.id, warehouses.isDefect],
    }),
    foreignKey({
      name: "items_default_out_warehouse_fk",
      columns: [t.defaultOutWarehouseId, t.defaultWarehouseDefect],
      foreignColumns: [warehouses.id, warehouses.isDefect],
    }),
    check("items_default_warehouse_defect_fixed", sql`${t.defaultWarehouseDefect} = false`),
    check("items_lot_rule_made_only", sql`${t.lotRuleCode} is null or ${t.itemType} in ('SF', 'FG')`),
    foreignKey({
      name: "items_item_type_fk",
      columns: [t.itemTypeGroup, t.itemType],
      foreignColumns: [codes.groupCode, codes.code],
    }),
    foreignKey({
      name: "items_procurement_fk",
      columns: [t.procurementGroup, t.procurement],
      foreignColumns: [codes.groupCode, codes.code],
    }),
    foreignKey({
      name: "items_unit_fk",
      columns: [t.unitGroup, t.unit],
      foreignColumns: [codes.groupCode, codes.code],
    }),
    foreignKey({
      name: "items_cls1_fk",
      columns: [t.cls1Group, t.cls1],
      foreignColumns: [codes.groupCode, codes.code],
    }),
    foreignKey({
      name: "items_cls2_fk",
      columns: [t.cls2Group, t.cls2],
      foreignColumns: [codes.groupCode, codes.code],
    }),
    foreignKey({
      name: "items_cls3_fk",
      columns: [t.cls3Group, t.cls3],
      foreignColumns: [codes.groupCode, codes.code],
    }),
    check("items_item_type_group_fixed", sql`${t.itemTypeGroup} = 'ITEM_TYPE'`),
    check("items_procurement_group_fixed", sql`${t.procurementGroup} = 'PROC_TYPE'`),
    check("items_unit_group_fixed", sql`${t.unitGroup} = 'UNIT'`),
    check("items_cls1_group_fixed", sql`${t.cls1Group} = 'ITEM_CLS1'`),
    check("items_cls2_group_fixed", sql`${t.cls2Group} = 'ITEM_CLS2'`),
    check("items_cls3_group_fixed", sql`${t.cls3Group} = 'ITEM_CLS3'`),
    check("items_code_format", sql`${t.code} ~ '^(RM|SF|FG|SM|CS)-[0-9]{4,}$' and left(${t.code}, 2) = ${t.itemType}`),
    check("items_name_length", sql`char_length(${t.name}) between 1 and 100`),
    check("items_spec_length", sql`char_length(${t.spec}) <= 100`),
    check("items_lead_time_range", sql`${t.leadTimeDays} between 0 and 365`),
    check("items_quantities_not_negative", sql`${t.safetyStock} >= 0 and ${t.minLot} >= 0 and ${t.lotMultiple} >= 0`),
    check("items_note_length", sql`char_length(${t.note}) <= 500`),
  ],
);

/**
 * 거래처. 한 거래처에 매입처 · 매출처 표시 — 하나 이상(ADR 0003).
 * 국가는 공통코드 COUNTRY 의 값이다(ADR 0011). 한국(KR)이면 사업자등록번호(000-00-00000)를, 아니면 해외 사업자번호(글자 그대로)를 둔다 —
 * 다른 쪽 칸은 비어 있다.
 */
export const partners = pgTable(
  "partners",
  {
    id: id(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    isSupplier: boolean("is_supplier").notNull().default(false),
    isCustomer: boolean("is_customer").notNull().default(false),
    countryGroup: text("country_group").notNull().default("COUNTRY"),
    country: text("country").notNull().default("KR"),
    bizNo: text("biz_no"),
    foreignBizNo: text("foreign_biz_no"),
    // 설명용 칸(PR H, ADR 0012) — 비우면 빈 글자. 계산이 읽지 않는다.
    ceo: text("ceo").notNull().default(""),
    bizType: text("biz_type").notNull().default(""),
    bizItem: text("biz_item").notNull().default(""),
    address: text("address").notNull().default(""),
    phone: text("phone").notNull().default(""),
    email: text("email").notNull().default(""),
    contactName: text("contact_name").notNull().default(""),
    contactPhone: text("contact_phone").notNull().default(""),
    note: text("note").notNull().default(""),
    active: boolean("active").notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      name: "partners_country_fk",
      columns: [t.countryGroup, t.country],
      foreignColumns: [codes.groupCode, codes.code],
    }),
    check("partners_country_group_fixed", sql`${t.countryGroup} = 'COUNTRY'`),
    check("partners_code_format", sql`${t.code} ~ '^BP-[0-9]{4,}$'`),
    check("partners_name_length", sql`char_length(${t.name}) between 1 and 100`),
    check("partners_role_required", sql`${t.isSupplier} or ${t.isCustomer}`),
    check("partners_biz_no_format", sql`${t.bizNo} is null or ${t.bizNo} ~ '^[0-9]{3}-[0-9]{2}-[0-9]{5}$'`),
    check(
      "partners_foreign_biz_no_length",
      sql`${t.foreignBizNo} is null or char_length(${t.foreignBizNo}) between 1 and 30`,
    ),
    check(
      "partners_biz_no_by_country",
      sql`(${t.country} = 'KR' and ${t.foreignBizNo} is null) or (${t.country} <> 'KR' and ${t.bizNo} is null)`,
    ),
    check("partners_ceo_length", sql`char_length(${t.ceo}) <= 50`),
    check("partners_biz_type_length", sql`char_length(${t.bizType}) <= 50`),
    check("partners_biz_item_length", sql`char_length(${t.bizItem}) <= 50`),
    check("partners_address_length", sql`char_length(${t.address}) <= 200`),
    check("partners_contact_name_length", sql`char_length(${t.contactName}) <= 50`),
    check("partners_note_length", sql`char_length(${t.note}) <= 500`),
    // 전화 — 숫자 · 붙임표 · + · 괄호 · 빈칸만 20자까지, 숫자가 하나 이상(src/lib/partner-fields.ts 의 PHONE 과 같다).
    check(
      "partners_phone_format",
      sql`${t.phone} = '' or (${t.phone} ~ '^[0-9+() -]{1,20}$' and ${t.phone} ~ '[0-9]')`,
    ),
    check(
      "partners_contact_phone_format",
      sql`${t.contactPhone} = '' or (${t.contactPhone} ~ '^[0-9+() -]{1,20}$' and ${t.contactPhone} ~ '[0-9]')`,
    ),
    // 이메일 — @ 하나를 사이에 두고 앞뒤가 비지 않고 뒤에 점이 있으며 빈칸이 없다, 100자까지(EMAIL 과 같다).
    check(
      "partners_email_format",
      sql`${t.email} = '' or (char_length(${t.email}) <= 100 and ${t.email} ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')`,
    ),
  ],
);

// ── 재고 수불(조각 「재고 수불」 PR C, ADR 0015 · 0016 · 0018) ─────────────────────────

/** 재고 수량 — 품목의 단위로 소수 셋째 자리까지(ADR 0018). 자릿수는 단위가 정하고(ADR 0017) 서버가 본다. */
const stockQty = (name: string) => numeric(name, { precision: 14, scale: 3, mode: "number" });

/**
 * 수불 전표 — 수불 등록 한 번(여러 줄). 번호는 `IV-YYYYMMDD-NNN`(수불 일자 · 그날의 일련, ADR 0016).
 * 유형은 공통코드 MOVE_TYPE, 사유는 조정(ADJ)일 때만 ADJ_REASON. 고치거나 지우는 길이 없다 — 취소는 새 전표다.
 * 취소 전표(`cancels_move_id`)는 원래 전표를 가리키고, 한 전표는 한 번만 취소된다(유일). 취소 전표는 취소되지 않는다 —
 * 참조가 (원래 전표, 늘 false)로 (번호, 취소 전표인가)를 가리켜 DB 가 막는다(기본 창고의 참조와 같은 꼴).
 */
export const stockMoves = pgTable(
  "stock_moves",
  {
    id: id(),
    code: text("code").notNull().unique(),
    moveDate: date("move_date", { mode: "string" }).notNull(),
    moveTypeGroup: text("move_type_group").notNull().default("MOVE_TYPE"),
    moveType: text("move_type").notNull(),
    reasonGroup: text("reason_group").notNull().default("ADJ_REASON"),
    reason: text("reason"),
    note: text("note").notNull().default(""),
    cancelsMoveId: integer("cancels_move_id").unique(),
    // 이 전표가 취소 전표인가 — `cancels_move_id` 에서 저절로. 취소 전표를 가리키는 취소를 막는 열쇠다.
    isCancel: boolean("is_cancel")
      .notNull()
      .generatedAlwaysAs(sql`cancels_move_id is not null`),
    // 늘 false — 취소가 가리키는 전표는 취소 전표가 아니다.
    cancelsCancel: boolean("cancels_cancel").notNull().default(false),
    ...timestamps(),
  },
  (t) => [
    unique("stock_moves_id_cancel_unique").on(t.id, t.isCancel),
    foreignKey({
      name: "stock_moves_cancels_fk",
      columns: [t.cancelsMoveId, t.cancelsCancel],
      foreignColumns: [t.id, t.isCancel],
    }),
    foreignKey({
      name: "stock_moves_move_type_fk",
      columns: [t.moveTypeGroup, t.moveType],
      foreignColumns: [codes.groupCode, codes.code],
    }),
    foreignKey({
      name: "stock_moves_reason_fk",
      columns: [t.reasonGroup, t.reason],
      foreignColumns: [codes.groupCode, codes.code],
    }),
    check("stock_moves_code_format", sql`${t.code} ~ '^IV-[0-9]{8}-[0-9]{3,}$'`),
    check("stock_moves_code_date", sql`substring(${t.code} from 4 for 8) = to_char(${t.moveDate}, 'YYYYMMDD')`),
    check("stock_moves_move_type_group_fixed", sql`${t.moveTypeGroup} = 'MOVE_TYPE'`),
    check("stock_moves_reason_group_fixed", sql`${t.reasonGroup} = 'ADJ_REASON'`),
    check("stock_moves_reason_adjust_only", sql`(${t.moveType} = 'ADJ') = (${t.reason} is not null)`),
    check("stock_moves_note_length", sql`char_length(${t.note}) <= 200`),
    check("stock_moves_cancels_cancel_fixed", sql`${t.cancelsCancel} = false`),
    check("stock_moves_cancel_not_self", sql`${t.cancelsMoveId} is null or ${t.cancelsMoveId} <> ${t.id}`),
  ],
);

/**
 * 수불 줄 — 품목 하나가 보내는 창고에서 나가고(`from`) 받는 창고로 든다(`to`). 입고는 받는 창고만, 출고는 보내는 창고만, 이동은 둘 다,
 * 조정은 늘리면 받는 창고 · 줄이면 보내는 창고다. 수량은 늘 0 보다 크다 — 취소는 보내는 · 받는 창고를 바꾼 줄이다.
 * 잔액(품목 · 창고 · LOT · 상태) = 그 키로 든 수량 − 나간 수량(ADR 0018). 일자는 전표의 일자를 옮겨 둔다 — 지난 날짜 음수 검사가
 * (일자, 줄 번호) 차례로 누계를 세운다(설계 「2026-11-09 — PR C 를 열기 전에 정한 것」).
 * LOT 를 끈 품목의 LOT 는 빈 글자다. 넣은 단위가 품목 단위와 다르면 넣은 수량 · 단위를 함께 남긴다(성공 기준 8).
 */
export const stockMoveLines = pgTable(
  "stock_move_lines",
  {
    id: id(),
    moveId: integer("move_id")
      .notNull()
      .references(() => stockMoves.id),
    lineNo: smallint("line_no").notNull(),
    moveDate: date("move_date", { mode: "string" }).notNull(),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id),
    lot: text("lot").notNull().default(""),
    status: text("status").notNull().default("AVAILABLE"),
    fromWarehouseId: integer("from_warehouse_id").references(() => warehouses.id),
    toWarehouseId: integer("to_warehouse_id").references(() => warehouses.id),
    qty: stockQty("qty").notNull(),
    enteredQty: stockQty("entered_qty").notNull(),
    enteredUnitGroup: text("entered_unit_group").notNull().default("UNIT"),
    enteredUnit: text("entered_unit").notNull(),
    ...timestamps(),
  },
  (t) => [
    unique("stock_move_lines_move_line_unique").on(t.moveId, t.lineNo),
    foreignKey({
      name: "stock_move_lines_entered_unit_fk",
      columns: [t.enteredUnitGroup, t.enteredUnit],
      foreignColumns: [codes.groupCode, codes.code],
    }),
    index("stock_move_lines_to_key_idx").on(t.itemId, t.toWarehouseId, t.lot, t.status, t.moveDate, t.id),
    index("stock_move_lines_from_key_idx").on(t.itemId, t.fromWarehouseId, t.lot, t.status, t.moveDate, t.id),
    check("stock_move_lines_line_no_range", sql`${t.lineNo} between 1 and 100`),
    check("stock_move_lines_lot_format", sql`${t.lot} ~ '^[A-Za-z0-9._-]{0,30}$'`),
    check("stock_move_lines_status_values", sql`${t.status} in ('AVAILABLE', 'QC')`),
    check(
      "stock_move_lines_warehouse_required",
      sql`${t.fromWarehouseId} is not null or ${t.toWarehouseId} is not null`,
    ),
    check("stock_move_lines_warehouses_differ", sql`${t.fromWarehouseId} is distinct from ${t.toWarehouseId}`),
    check("stock_move_lines_qty_positive", sql`${t.qty} > 0 and ${t.enteredQty} > 0`),
    check("stock_move_lines_entered_unit_group_fixed", sql`${t.enteredUnitGroup} = 'UNIT'`),
  ],
);

/**
 * 잔액 — 품목 · 창고 · LOT · 상태마다 지금 수량(ADR 0018). 수불 줄을 쓰는 같은 트랜잭션에서 고치고, 0 밑으로 가지 못한다.
 * 불량은 창고(불량창고)가, 검사대기는 상태 칸이 정한다(ADR 0015). 재고 계산(src/db/stock.ts) 말고는 고치지 않는다.
 */
export const stockBalances = pgTable(
  "stock_balances",
  {
    id: id(),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id),
    warehouseId: integer("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    lot: text("lot").notNull().default(""),
    status: text("status").notNull().default("AVAILABLE"),
    qty: stockQty("qty").notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    unique("stock_balances_key_unique").on(t.itemId, t.warehouseId, t.lot, t.status),
    index("stock_balances_warehouse_idx").on(t.warehouseId),
    check("stock_balances_qty_not_negative", sql`${t.qty} >= 0`),
    check("stock_balances_lot_format", sql`${t.lot} ~ '^[A-Za-z0-9._-]{0,30}$'`),
    check("stock_balances_status_values", sql`${t.status} in ('AVAILABLE', 'QC')`),
  ],
);
