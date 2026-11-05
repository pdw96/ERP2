import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
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
    check("items_code_format", sql`${t.code} ~ '^(RM|SF|FG)-[0-9]{4,}$' and left(${t.code}, 2) = ${t.itemType}`),
    check("items_name_length", sql`char_length(${t.name}) between 1 and 100`),
    check("items_spec_length", sql`char_length(${t.spec}) <= 100`),
    check("items_lead_time_range", sql`${t.leadTimeDays} between 0 and 365`),
    check("items_quantities_not_negative", sql`${t.safetyStock} >= 0 and ${t.minLot} >= 0 and ${t.lotMultiple} >= 0`),
    check("items_note_length", sql`char_length(${t.note}) <= 500`),
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
