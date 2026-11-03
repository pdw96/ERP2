import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, integer, numeric, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

// 조각 「기준정보」의 테이블 다섯(docs/schema.md · 설계도의 「이 조각의 테이블」).
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
    active: boolean("active").notNull().default(true),
    ...timestamps(),
  },
  (t) => [
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
    check("items_item_type_group_fixed", sql`${t.itemTypeGroup} = 'ITEM_TYPE'`),
    check("items_procurement_group_fixed", sql`${t.procurementGroup} = 'PROC_TYPE'`),
    check("items_unit_group_fixed", sql`${t.unitGroup} = 'UNIT'`),
    check("items_code_format", sql`${t.code} ~ '^(RM|SF|FG)-[0-9]{4,}$' and left(${t.code}, 2) = ${t.itemType}`),
    check("items_name_length", sql`char_length(${t.name}) between 1 and 100`),
    check("items_spec_length", sql`char_length(${t.spec}) <= 100`),
    check("items_lead_time_range", sql`${t.leadTimeDays} between 0 and 365`),
    check("items_quantities_not_negative", sql`${t.safetyStock} >= 0 and ${t.minLot} >= 0 and ${t.lotMultiple} >= 0`),
  ],
);

/** 창고. 위치(랙 · 선반)는 두지 않는다(ADR 0003). */
export const warehouses = pgTable(
  "warehouses",
  {
    id: id(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    check("warehouses_code_format", sql`${t.code} ~ '^WH-[0-9]{2,}$'`),
    check("warehouses_name_length", sql`char_length(${t.name}) between 1 and 50`),
  ],
);

/** 거래처. 한 거래처에 매입처 · 매출처 표시 — 하나 이상(ADR 0003). */
export const partners = pgTable(
  "partners",
  {
    id: id(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    isSupplier: boolean("is_supplier").notNull().default(false),
    isCustomer: boolean("is_customer").notNull().default(false),
    bizNo: text("biz_no"),
    active: boolean("active").notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    check("partners_code_format", sql`${t.code} ~ '^BP-[0-9]{4,}$'`),
    check("partners_name_length", sql`char_length(${t.name}) between 1 and 100`),
    check("partners_role_required", sql`${t.isSupplier} or ${t.isCustomer}`),
    check("partners_biz_no_format", sql`${t.bizNo} is null or ${t.bizNo} ~ '^[0-9]{3}-[0-9]{2}-[0-9]{5}$'`),
  ],
);
