import { parseItemUpdate, parseNewItem, type ItemUpdateInput, type NewItemInput } from "./item-input";
import { ITEM_CLASSES, type ItemClassField, type ItemValues } from "./item-fields";
import { warehouseCodeOf, type StockLists } from "./item-stock";
import { ITEM_TYPE_DEFAULTS, ITEM_TYPES, KOREA, PROC_TYPES, type ItemType } from "./master-codes";
import {
  PARTNER_TEXT_FIELDS,
  parseNewPartner,
  parsePartnerUpdate,
  type NewPartnerInput,
  type PartnerTextField,
  type PartnerUpdateInput,
  type PartnerValues,
} from "./partner-input";
import { CODE_KEY, VERSION_KEY, type SheetErrors, type SheetRow } from "./sheet";

// 시트형 등록의 한 줄을 한 건 등록의 입력으로 바꿔 같은 규칙으로 본다(성공 기준 11 — 칸의 규칙은 한 건 등록과 같다).
// 시트만의 것은 셋이다(저자 인터뷰 2026-11-03): 고르는 값을 이름 · 코드 둘 다 받고, 켬 · 끔을 Y/N · O/X · 예/아니오로 받고,
// 빈 칸을 한 건 등록의 기본값으로 채운다. 서버에서만 쓴다.
// 불러온 줄(PR J)은 한 건 수정의 검사로 본다 — 유형은 바꾸지 않고, 사용 여부를 받고, 지금 값인 「사용 안 함」 코드는 남는다.

export type CodeOption = { code: string; name: string; active: boolean };

type Picked = { code: string; active: boolean } | "blank" | "none" | "ambiguous";

/** 이름이나 코드로 고른다 — 코드는 대소문자를 가리지 않고, 코드가 먼저다. 같은 이름이 둘 이상이면 코드로 넣으라고 한다. */
export function pickOption(text: string, options: readonly { code: string; name: string; active?: boolean }[]): Picked {
  const t = text.trim();
  if (!t) return "blank";
  const byCode = options.find((o) => o.code === t.toUpperCase());
  if (byCode) return { code: byCode.code, active: byCode.active ?? true };
  const byName = options.filter((o) => o.name === t);
  if (byName.length > 1) return "ambiguous";
  if (byName.length === 1) return { code: byName[0].code, active: byName[0].active ?? true };
  return "none";
}

const YES = new Set(["Y", "O", "예"]);
const NO = new Set(["N", "X", "아니오"]);

/** 켬 · 끔 — Y/N · O/X · 예/아니오(영문은 대소문자를 가리지 않는다). 비면 "blank", 모르는 글이면 "bad". */
export function yesNo(text: string): "on" | "off" | "blank" | "bad" {
  const t = text.trim().toUpperCase();
  if (!t) return "blank";
  if (YES.has(t)) return "on";
  if (NO.has(t)) return "off";
  return "bad";
}

const names = (list: readonly { code: string; name: string }[]) => list.map((o) => `${o.name}(${o.code})`).join(" · ");
const YES_NO_BAD = "Y · N 가운데 하나로 넣으세요(O · X, 예 · 아니오도 됩니다)";
const AMBIGUOUS = (what: string) => `같은 이름의 ${what}가 둘 이상입니다 — 코드로 넣으세요`;

type ItemCurrent = { itemType: string; unit: string; cls1: string | null; cls2: string | null; cls3: string | null };
type Classes = Readonly<Record<ItemClassField, readonly CodeOption[]>>;
const NO_CLASSES: Classes = { cls1: [], cls2: [], cls3: [] };
const NO_STOCK: StockLists = { rules: [], warehouses: [] };

const NEW_ONLY_ACTIVE = "새 행은 사용(Y)으로만 등록합니다 — 비우거나 Y 를 넣으세요";

/**
 * 사용 여부 칸(PR J) — 비우면 Y. 새 줄은 한 건 등록처럼 「사용」으로만 등록한다.
 * 고침이면 "Y" · "N" 을, 새 줄이면 undefined 를 돌려준다(새 줄의 검사는 사용 여부를 받지 않는다).
 */
function readActive(text: string, editing: boolean, errors: SheetErrors): "Y" | "N" | undefined {
  const v = yesNo(text);
  if (v === "bad") errors.active = YES_NO_BAD;
  else if (!editing && v === "off") errors.active = NEW_ONLY_ACTIVE;
  return editing ? (v === "off" ? "N" : "Y") : undefined;
}

/**
 * 품목 한 줄의 글자를 한 건 등록 · 수정의 값으로 — 이름 · 코드 · Y/N · 빈 칸의 기본값. current 가 있으면 불러온 줄의 고침이다:
 * 유형은 그 품목의 것(시트의 유형 칸은 보지 않는다), 「사용 안 함」 단위 · 분류도 그 품목의 지금 값이면 남는다(한 건 수정과 같다).
 */
function itemRowValues(
  row: SheetRow,
  units: readonly CodeOption[],
  classes: Classes,
  lists: StockLists,
  current?: ItemCurrent,
) {
  const errors: SheetErrors = {};
  const values: ItemValues = {
    name: row.name ?? "",
    spec: row.spec ?? "",
    leadTimeDays: (row.leadTimeDays ?? "").trim() || "0",
    safetyStock: (row.safetyStock ?? "").trim() || "0",
    minLot: (row.minLot ?? "").trim() || "0",
    lotMultiple: (row.lotMultiple ?? "").trim() || "0",
    note: row.note ?? "",
  };
  const keeps = (picked: { code: string; active: boolean }, now: string | null | undefined) =>
    picked.active || (current !== undefined && picked.code === now);

  if (current) values.itemType = current.itemType;
  else {
    const type = pickOption(row.itemType ?? "", ITEM_TYPES);
    if (type === "blank") errors.itemType = `유형을 넣으세요 — ${names(ITEM_TYPES)}`;
    else if (typeof type === "string") errors.itemType = `유형은 ${names(ITEM_TYPES)} 가운데 하나입니다`;
    else values.itemType = type.code;
  }
  const defaults = values.itemType ? ITEM_TYPE_DEFAULTS[values.itemType as ItemType] : undefined;

  const proc = pickOption(row.procurement ?? "", PROC_TYPES);
  if (proc === "blank") values.procurement = defaults?.procurement ?? "";
  else if (typeof proc === "string") errors.procurement = `조달구분은 ${names(PROC_TYPES)} 가운데 하나입니다`;
  else values.procurement = proc.code;

  const unit = pickOption(row.unit ?? "", units);
  if (unit === "blank") errors.unit = "단위를 넣으세요";
  else if (unit === "ambiguous") errors.unit = AMBIGUOUS("단위");
  else if (unit === "none") errors.unit = "공통코드의 단위(UNIT)에 없는 단위입니다";
  else if (!keeps(unit, current?.unit)) errors.unit = "「사용 안 함」인 단위입니다 — 다른 단위를 넣으세요";
  else values.unit = unit.code;

  // 분류 — 단위처럼 이름 · 코드 둘 다 받고, 비우면 없음(PR H). 「사용 안 함」 값은 새로 쓰지 않는다(한 건 등록 · 수정과 같다).
  for (const { field, group, label } of ITEM_CLASSES) {
    const picked = pickOption(row[field] ?? "", classes[field]);
    if (picked === "blank") values[field] = "";
    else if (picked === "ambiguous") errors[field] = AMBIGUOUS(label);
    else if (picked === "none") errors[field] = `공통코드의 ${label}(${group})에 없는 값입니다`;
    else if (!keeps(picked, current?.[field])) errors[field] = `「사용 안 함」인 ${label}입니다 — 다른 값을 넣으세요`;
    else values[field] = picked.code;
  }

  // 재고 칸(조각 「재고 수불」 PR B) — 규칙 · 창고는 이름 · 코드 둘 다 받고, 비우면 규칙은 유형의 기본 · 창고는 없음.
  // 「사용 안 함」 · 불량창고 · 만드는 품목인지는 한 건 등록과 같은 검사(src/lib/item-stock.ts)가 본다.
  const rule = pickOption(row.lotRuleCode ?? "", lists.rules);
  if (rule === "blank") values.lotRuleCode = "";
  else if (rule === "ambiguous") errors.lotRuleCode = AMBIGUOUS("LOT 번호 규칙");
  else if (rule === "none")
    errors.lotRuleCode = "번호 규칙에 없는 규칙입니다 — 「시스템 관리 › 번호 규칙」의 코드를 넣으세요";
  else values.lotRuleCode = rule.code;
  for (const [key, label] of [
    ["defaultInWarehouse", "기본 입고 창고"],
    ["defaultOutWarehouse", "기본 출고 창고"],
  ] as const) {
    const picked = pickOption(row[key] ?? "", lists.warehouses);
    if (picked === "blank") values[key] = "";
    else if (picked === "ambiguous") errors[key] = AMBIGUOUS(label);
    else if (picked === "none") errors[key] = "없는 창고입니다 — 창고 코드(WH-01 꼴)나 이름을 넣으세요";
    else values[key] = picked.code;
  }

  for (const key of ["inspectIn", "inspectOut", "lotManaged"] as const) {
    const v = yesNo(row[key] ?? "");
    if (v === "bad") errors[key] = YES_NO_BAD;
    else if (v === "blank") values[key] = defaults?.[key] ? "on" : "off";
    else values[key] = v;
  }

  const active = readActive(row.active ?? "", current !== undefined, errors);
  if (active) values.active = active;
  return { values, errors, procBlank: proc === "blank" };
}

/** 검사의 까닭을 시트의 자리로 더한다 — 이미 까닭이 있는 자리는 두고, 유형을 못 읽어 조달구분의 기본값이 없으면 유형의 까닭 하나만. */
function mergeItemErrors(errors: SheetErrors, parsed: Record<string, string | undefined>, procBlank: boolean) {
  for (const [field, message] of Object.entries(parsed)) {
    if (field === "procurement" && procBlank && errors.itemType) continue;
    if (!errors[field]) errors[field] = message!;
  }
}

/** 품목 한 줄(새 등록) — 맞으면 등록할 값을, 틀리면 칸마다의 까닭을. 단위의 「사용 안 함」도 여기서 본다(한 건 등록과 같은 말). */
export function readItemRow(
  row: SheetRow,
  units: readonly CodeOption[],
  classes: Classes = NO_CLASSES,
  lists: StockLists = NO_STOCK,
): { ok: true; value: NewItemInput } | { ok: false; errors: SheetErrors } {
  const { values, errors, procBlank } = itemRowValues(row, units, classes, lists);
  const parsed = parseNewItem(values);
  if (!parsed.ok) mergeItemErrors(errors, parsed.errors, procBlank);
  if (parsed.ok && Object.keys(errors).length === 0) return { ok: true, value: parsed.value };
  return { ok: false, errors };
}

/** 품목 한 줄(불러온 줄의 고침, PR J) — 한 건 수정과 같은 규칙. 코드 · 유형은 바꾸지 않는다. */
export function readItemEditRow(
  row: SheetRow,
  units: readonly CodeOption[],
  classes: Classes,
  current: ItemCurrent,
  lists: StockLists = NO_STOCK,
): { ok: true; value: ItemUpdateInput } | { ok: false; errors: SheetErrors } {
  const { values, errors, procBlank } = itemRowValues(row, units, classes, lists, current);
  const parsed = parseItemUpdate(values);
  if (!parsed.ok) mergeItemErrors(errors, parsed.errors, procBlank);
  if (parsed.ok && Object.keys(errors).length === 0) return { ok: true, value: parsed.value };
  return { ok: false, errors };
}

type PartnerCurrent = { country: string };

/** 거래처 한 줄의 글자를 한 건 등록 · 수정의 값으로. current 가 있으면 불러온 줄의 고침이다 — 「사용 안 함」 국가도 지금 값이면 남는다. */
function partnerRowValues(row: SheetRow, countries: readonly CodeOption[], current?: PartnerCurrent) {
  const errors: SheetErrors = {};
  const values: PartnerValues = { name: row.name ?? "" };
  // 설명용 칸(PR H) — 글자 그대로, 비워도 된다. 길이 · 전화 · 이메일의 꼴은 한 건 등록의 검사가 본다.
  for (const { field } of PARTNER_TEXT_FIELDS) values[field] = row[field] ?? "";

  // 매입처 · 매출처의 거절은 「구분」 한 자리에 보인다(한 건 등록과 같다).
  for (const [key, label] of [
    ["isSupplier", "매입처"],
    ["isCustomer", "매출처"],
  ] as const) {
    const v = yesNo(row[key] ?? "");
    if (v === "bad") errors.role ??= `${label} 셀은 ${YES_NO_BAD}`;
    else values[key] = v === "on" ? "on" : "off";
  }

  const country = pickOption(row.country ?? "", countries);
  if (country === "blank") values.country = KOREA;
  else if (country === "ambiguous") errors.country = AMBIGUOUS("국가");
  else if (country === "none") errors.country = "공통코드의 국가(COUNTRY)에 없는 국가입니다";
  else if (!country.active && country.code !== current?.country)
    errors.country = "「사용 안 함」인 국가입니다 — 다른 국가를 넣으세요";
  else values.country = country.code;

  // 국가를 못 읽었으면 번호는 한국 꼴로 보지 않는다 — 국가의 까닭 하나만 알린다.
  const korean = (values.country ?? "") === KOREA;
  if (values.country) values[korean ? "bizNo" : "foreignBizNo"] = row.bizNo ?? "";

  const active = readActive(row.active ?? "", current !== undefined, errors);
  if (active) values.active = active;
  return { values: { ...values, country: values.country ?? KOREA }, errors };
}

/** 검사의 까닭을 시트의 자리로 — 해외 사업자번호는 「사업자번호」 칸, 국가를 못 읽었으면 번호의 까닭은 두지 않는다. */
function mergePartnerErrors(errors: SheetErrors, parsed: Record<string, string | undefined>) {
  for (const [key, message] of Object.entries(parsed)) {
    const at = key === "foreignBizNo" ? "bizNo" : key;
    if (at === "bizNo" && errors.country) continue;
    if (!errors[at]) errors[at] = message!;
  }
}

/** 거래처 한 줄(새 등록) — 사업자번호 칸은 국가가 한국이면 사업자등록번호, 아니면 해외 사업자번호로 읽는다. */
export function readPartnerRow(
  row: SheetRow,
  countries: readonly CodeOption[],
): { ok: true; value: NewPartnerInput } | { ok: false; errors: SheetErrors } {
  const { values, errors } = partnerRowValues(row, countries);
  const parsed = parseNewPartner(values);
  if (!parsed.ok) mergePartnerErrors(errors, parsed.errors);
  if (parsed.ok && Object.keys(errors).length === 0) return { ok: true, value: parsed.value };
  return { ok: false, errors };
}

/** 거래처 한 줄(불러온 줄의 고침, PR J) — 한 건 수정과 같은 규칙. 코드는 바꾸지 않는다. */
export function readPartnerEditRow(
  row: SheetRow,
  countries: readonly CodeOption[],
  current: PartnerCurrent,
): { ok: true; value: PartnerUpdateInput } | { ok: false; errors: SheetErrors } {
  const { values, errors } = partnerRowValues(row, countries, current);
  const parsed = parsePartnerUpdate(values);
  if (!parsed.ok) mergePartnerErrors(errors, parsed.errors);
  if (parsed.ok && Object.keys(errors).length === 0) return { ok: true, value: parsed.value };
  return { ok: false, errors };
}

// ── 불러오기(PR J) ──────────────────────────────────────

const yn = (b: boolean) => (b ? "Y" : "N");

/**
 * 기존 품목을 시트의 한 줄로 — 고르는 값은 코드로 둔다(이름은 겹칠 수 있어 그대로 저장하면 거절될 수 있다).
 * 숨은 칸에 코드와 불러온 때의 버전을 둔다.
 */
export function itemSheetRow(
  item: {
    code: string;
    version: string;
    itemType: string;
    name: string;
    spec: string;
    unit: string;
    procurement: string;
    inspectIn: boolean;
    inspectOut: boolean;
    leadTimeDays: number;
    safetyStock: number;
    minLot: number;
    lotMultiple: number;
    cls1: string | null;
    cls2: string | null;
    cls3: string | null;
    note: string;
    active: boolean;
    lotManaged: boolean;
    lotRuleCode: string | null;
    defaultInWarehouseId: number | null;
    defaultOutWarehouseId: number | null;
  },
  lists: Pick<StockLists, "warehouses"> = NO_STOCK,
): SheetRow {
  return {
    [CODE_KEY]: item.code,
    [VERSION_KEY]: item.version,
    itemType: item.itemType,
    name: item.name,
    spec: item.spec,
    unit: item.unit,
    procurement: item.procurement,
    inspectIn: yn(item.inspectIn),
    inspectOut: yn(item.inspectOut),
    leadTimeDays: String(item.leadTimeDays),
    safetyStock: String(item.safetyStock),
    minLot: String(item.minLot),
    lotMultiple: String(item.lotMultiple),
    cls1: item.cls1 ?? "",
    cls2: item.cls2 ?? "",
    cls3: item.cls3 ?? "",
    note: item.note,
    active: yn(item.active),
    lotManaged: yn(item.lotManaged),
    lotRuleCode: item.lotRuleCode ?? "",
    defaultInWarehouse: warehouseCodeOf(lists, item.defaultInWarehouseId),
    defaultOutWarehouse: warehouseCodeOf(lists, item.defaultOutWarehouseId),
  };
}

/** 기존 거래처를 시트의 한 줄로 — 사업자번호는 한국 · 해외 가운데 있는 것, 국가는 코드. */
export function partnerSheetRow(
  p: { code: string; version: string; name: string; isSupplier: boolean; isCustomer: boolean; country: string } & {
    bizNo: string | null;
    foreignBizNo: string | null;
    active: boolean;
  } & Record<PartnerTextField, string>,
): SheetRow {
  return {
    [CODE_KEY]: p.code,
    [VERSION_KEY]: p.version,
    name: p.name,
    isSupplier: yn(p.isSupplier),
    isCustomer: yn(p.isCustomer),
    country: p.country,
    bizNo: p.bizNo ?? p.foreignBizNo ?? "",
    ...Object.fromEntries(PARTNER_TEXT_FIELDS.map(({ field }) => [field, p[field]])),
    active: yn(p.active),
  };
}
