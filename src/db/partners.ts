import { and, asc, count, eq, getTableColumns, ilike, inArray, ne, or, type SQL } from "drizzle-orm";
import {
  parseNewPartner,
  parsePartnerUpdate,
  type PartnerErrorKey,
  type PartnerErrors,
  type PartnerValues,
} from "@/lib/partner-input";
import {
  COLLIDED,
  DUPLICATE_ROW,
  REGISTER_LOCK,
  STALE,
  STALE_ROW,
  VERSION,
  constraintOf,
  first,
  likeLiteral,
  limitMessage,
  registerRowsWithCode,
  registerWithCode,
  savedCode,
  searchText,
  touched,
  updateRowsWithVersion,
  versionIs,
  versionOf,
  type Params,
  type RegisteredRow,
  type UpdatedRow,
} from "./master-shared";
import { nextCode } from "./numbering";
import { KOREA } from "@/lib/master-codes";
import {
  CODE_KEY,
  ROW_ERROR,
  SHEET_MAX_ROWS,
  VERSION_KEY,
  isBlankRow,
  isLoadedRow,
  type SheetErrors,
  type SheetResult,
  type SheetRow,
} from "@/lib/sheet";
import { partnerSheetRow, readPartnerEditRow, readPartnerRow } from "@/lib/sheet-input";
import { codes, partners } from "./schema";
import type { Db } from "./types";

// 거래처의 목록 · 등록 · 수정(조각 「기준정보」 PR D). 화면(src/app/master/partners/)은 이 함수만 부른다.
// 입력 검사는 src/lib/partner-input.ts, 국가가 「사용 안 함」이 아닌지 · 등록 상한 · 코드 번호는 여기서 본다(PR G 에서 국가를 더함).

/** 거래처의 등록 상한(설계 「PR B 를 열기 전에 정한 것」) — 매일 밤 되돌림이 샘플 수로 줄인다. */
export const PARTNER_LIMIT = 1000;

export type Partner = typeof partners.$inferSelect;
/** 거래처와 그 버전(마지막으로 고친 때) — 고치는 화면 · 시트가 들고 있다가 저장할 때 돌려준다(PR J). */
export type PartnerWithVersion = Partner & { version: string };
const WITH_VERSION = { ...getTableColumns(partners), version: versionOf(partners.updatedAt) };

/** 거래처 구분 — 한 거래처가 둘 다일 수 있다(ADR 0003). 주소의 거르기 값과 화면의 이름. */
export const PARTNER_ROLES = [
  { code: "supplier", name: "매입처" },
  { code: "customer", name: "매출처" },
] as const;
export type PartnerRole = (typeof PARTNER_ROLES)[number]["code"];

/** 「매입처 · 매출처」 — 거래처의 구분을 한 줄로. */
export const roleNames = (p: Pick<Partner, "isSupplier" | "isCustomer">) =>
  [p.isSupplier && "매입처", p.isCustomer && "매출처"].filter(Boolean).join(" · ");

// ── 목록 ─────────────────────────────────────────────

export type PartnerFilter = {
  q: string;
  role?: PartnerRole;
  /** 국가 — 조회에만 있다(저자 판정 2026-11-04). 「사용 안 함」 국가로도 거른다 — 이미 쓴 거래처를 찾을 수 있게. */
  country?: string;
  includeInactive: boolean;
};
export type PartnerFilterNotice = { field: "q" | "role" | "country"; message: string };

/**
 * 주소의 거르기 값을 읽는다. 닫힌 목록 밖의 값은 거르지 않고 알린다.
 * 국가는 공통코드의 값(countries)에 있는 것만 거른다 — 주지 않으면(등록의 목록) 국가는 거르지 않는다.
 */
export function parsePartnerFilter(
  params: Params,
  countries?: readonly CountryOption[],
): { filter: PartnerFilter; notices: PartnerFilterNotice[] } {
  const notices: PartnerFilterNotice[] = [];
  const search = searchText(params);
  if (search.notice) notices.push({ field: "q", message: search.notice });
  const filter: PartnerFilter = { q: search.q, includeInactive: first(params.inactive) === "1" };

  const role = first(params.role) ?? "";
  if (PARTNER_ROLES.some((r) => r.code === role)) filter.role = role as PartnerRole;
  else if (role) notices.push({ field: "role", message: "없는 구분이라 거르지 않았습니다" });

  const country = first(params.country) ?? "";
  if (country && countries) {
    if (countries.some((c) => c.code === country)) filter.country = country;
    else notices.push({ field: "country", message: "없는 국가라 거르지 않았습니다" });
  }

  return { filter, notices };
}

/** 찾기가 보는 칸 — 등록의 목록은 코드 · 거래처명, 조회는 글 칸 전체(저자 판정 2026-11-04, 설계 「PR I 를 열기 전에 정한 것」). */
const SEARCHED = {
  codeName: [partners.code, partners.name],
  allText: [
    partners.code,
    partners.name,
    partners.bizNo,
    partners.foreignBizNo,
    partners.ceo,
    partners.bizType,
    partners.bizItem,
    partners.address,
    partners.phone,
    partners.email,
    partners.contactName,
    partners.contactPhone,
    partners.note,
  ],
} as const;
export type SearchScope = keyof typeof SEARCHED;

/**
 * 코드 순으로. 찾기는 그 칸들에 글자가 들어 있는지 본다(대소문자 무시) — 등록의 목록은 코드 · 거래처명, 조회는 글 칸 전체.
 * 둘 다인 거래처는 어느 쪽으로 걸러도 보인다.
 */
export async function listPartners(db: Db, filter: PartnerFilter, scope: SearchScope = "codeName"): Promise<Partner[]> {
  return db.select().from(partners).where(partnerWhere(filter, scope)).orderBy(asc(partners.code));
}

function partnerWhere(filter: PartnerFilter, scope: SearchScope) {
  const where: SQL[] = [];
  if (filter.q) where.push(or(...SEARCHED[scope].map((c) => ilike(c, likeLiteral(filter.q))))!);
  if (filter.role === "supplier") where.push(eq(partners.isSupplier, true));
  if (filter.role === "customer") where.push(eq(partners.isCustomer, true));
  if (filter.country) where.push(eq(partners.country, filter.country));
  if (!filter.includeInactive) where.push(eq(partners.active, true));
  return and(...where);
}

/**
 * 시트에 불러오기(PR J) — 등록의 목록과 같은 찾기 · 거르기(국가 거르기도 받는다)로, 코드 순 앞 100건을 시트의 줄로.
 * 찾은 건수(total)도 돌려준다 — 100건을 넘으면 화면이 「앞 100건만」을 알린다.
 */
export async function loadPartnersForSheet(
  db: Db,
  filter: PartnerFilter,
): Promise<{ rows: SheetRow[]; total: number }> {
  const where = partnerWhere(filter, "codeName");
  const [found, [{ n }]] = await Promise.all([
    db.select(WITH_VERSION).from(partners).where(where).orderBy(asc(partners.code)).limit(SHEET_MAX_ROWS),
    db.select({ n: count() }).from(partners).where(where),
  ]);
  return { rows: found.map(partnerSheetRow), total: n };
}

export const PARTNER_CODE = /^BP-[0-9]{4,}$/;

/** 거래처 하나와 그 버전 — 한 쿼리로 읽어, 보인 값과 버전이 어긋나지 않는다. */
export async function getPartner(db: Db, code: string): Promise<PartnerWithVersion | undefined> {
  if (!PARTNER_CODE.test(code)) return undefined;
  const [row] = await db.select(WITH_VERSION).from(partners).where(eq(partners.code, code));
  return row;
}

/**
 * 같은 번호를 쓰는 다른 거래처(「사용 안 함」 포함) — 막지 않고 경고만 한다(저자 판정 2026-11-03).
 * 한국은 사업자등록번호가 같은 것, 해외는 국가와 해외 사업자번호가 함께 같은 것이다 — 나라가 다르면 같은 글자여도 다른 번호다.
 */
export type SharedBizNo = Pick<Partner, "code" | "name" | "active">;

export async function partnersSharingBizNo(
  db: Db,
  partner: Pick<Partner, "code" | "country" | "bizNo" | "foreignBizNo">,
): Promise<SharedBizNo[]> {
  const same = partner.bizNo
    ? eq(partners.bizNo, partner.bizNo)
    : partner.foreignBizNo
      ? and(eq(partners.country, partner.country), eq(partners.foreignBizNo, partner.foreignBizNo))
      : undefined;
  if (!same) return [];
  return db
    .select({ code: partners.code, name: partners.name, active: partners.active })
    .from(partners)
    .where(and(same, ne(partners.code, partner.code)))
    .orderBy(asc(partners.code));
}

/** 거래처의 번호 — 한국이면 사업자등록번호, 아니면 해외 사업자번호. */
export const bizNoOf = (p: Pick<Partner, "bizNo" | "foreignBizNo">) => p.bizNo ?? p.foreignBizNo;

// ── 입력 화면이 고르는 값 ────────────────────────────────

export type CountryOption = { code: string; name: string; active: boolean };

/** 국가 목록 — 사용 중인 것을 정렬 순서대로. 수정 화면은 그 거래처의 국가가 「사용 안 함」이어도 넣어 보인다. */
export async function countryOptions(db: Db, current?: string): Promise<CountryOption[]> {
  const rows = await db
    .select({ code: codes.code, name: codes.name, active: codes.active })
    .from(codes)
    .where(eq(codes.groupCode, "COUNTRY"))
    .orderBy(asc(codes.sortOrder), asc(codes.code));
  return rows.filter((r) => r.active || r.code === current);
}

/**
 * 국가 목록 — 「사용 안 함」까지, 정렬 순서대로. 조회의 국가 거르기 · 이름이 쓰고, 시트형 등록은 이름 · 코드 둘 다 받으며
 * 「사용 안 함」 국가는 거절한다.
 */
export async function allCountries(db: Db): Promise<CountryOption[]> {
  return db
    .select({ code: codes.code, name: codes.name, active: codes.active })
    .from(codes)
    .where(eq(codes.groupCode, "COUNTRY"))
    .orderBy(asc(codes.sortOrder), asc(codes.code));
}

/** 국가 코드 → 이름(「사용 안 함」 포함) — 목록이 국가를 이름으로 보인다. */
export async function countryNames(db: Db): Promise<Record<string, string>> {
  const rows = await db
    .select({ code: codes.code, name: codes.name })
    .from(codes)
    .where(eq(codes.groupCode, "COUNTRY"));
  return Object.fromEntries(rows.map((r) => [r.code, r.name]));
}

/** 지금 등록하면 붙을 코드 — 화면의 안내용이고, 저장할 때 다시 센다. */
export const previewPartnerCode = (db: Db) => nextCode(db, "BP");

// ── 등록 · 수정 ─────────────────────────────────────────

export type PartnerSaveResult =
  { ok: true; code: string } | { ok: false; errors: PartnerErrors; formError?: string; values: PartnerValues };

// DB 제약에 걸린 것(서버의 검사를 빠뜨렸을 때)을 칸으로 가른다.
const CONSTRAINT_FIELD: Record<string, PartnerErrorKey> = {
  partners_name_length: "name",
  partners_role_required: "role",
  partners_biz_no_format: "bizNo",
  partners_country_fk: "country",
  partners_foreign_biz_no_length: "foreignBizNo",
  partners_biz_no_by_country: "country",
  partners_ceo_length: "ceo",
  partners_biz_type_length: "bizType",
  partners_biz_item_length: "bizItem",
  partners_address_length: "address",
  partners_phone_format: "phone",
  partners_email_format: "email",
  partners_contact_name_length: "contactName",
  partners_contact_phone_format: "contactPhone",
  partners_note_length: "note",
};

const INACTIVE_COUNTRY = "「사용 안 함」인 국가입니다 — 다른 국가를 고르세요";
const NO_COUNTRY = "국가를 고르세요";

async function countryState(db: Db, country: string): Promise<"active" | "inactive" | "missing"> {
  const [row] = await db
    .select({ active: codes.active })
    .from(codes)
    .where(and(eq(codes.groupCode, "COUNTRY"), eq(codes.code, country)));
  return !row ? "missing" : row.active ? "active" : "inactive";
}

/** 입력 검사 뒤 국가를 본다 — 새로 고르는 국가는 사용 중인 것만, 그대로 두면 「사용 안 함」 국가도 남는다(단위와 같다). */
async function checkCountry(db: Db, values: PartnerValues, errors: PartnerErrors, current?: string) {
  const country = (values.country ?? KOREA).trim();
  if (errors.country || country === current) return;
  const state = await countryState(db, country);
  if (state === "inactive") errors.country = INACTIVE_COUNTRY;
  if (state === "missing") errors.country = NO_COUNTRY;
}

/** 제약 위반이면 칸의 거절로 바꾸고, 아니면 그대로 던진다(부르는 쪽이 코드만 남기고 알린다). */
function asRejection(error: unknown, values: PartnerValues): PartnerSaveResult {
  const field = CONSTRAINT_FIELD[constraintOf(error) ?? ""];
  if (field) return { ok: false, errors: { [field]: "받을 수 없는 값입니다" }, values };
  throw error;
}

/** 등록 — BP 의 다음 번호를 붙인다. 등록 상한 · 번호는 잠금 안에서 센다(src/db/master-shared.ts). */
export async function createPartner(db: Db, values: PartnerValues): Promise<PartnerSaveResult> {
  const parsed = parseNewPartner(values);
  const errors: PartnerErrors = parsed.ok ? {} : { ...parsed.errors };
  await checkCountry(db, values, errors);
  if (!parsed.ok || Object.keys(errors).length) return { ok: false, errors, values };
  try {
    const r = await registerWithCode(db, {
      table: partners,
      lock: REGISTER_LOCK.partners,
      limit: PARTNER_LIMIT,
      prefix: "BP",
      uniqueConstraint: "partners_code_unique",
      insert: (tx, code) => tx.insert(partners).values({ ...parsed.value, code }),
    });
    if (r.ok) return r;
    return {
      ok: false,
      errors: {},
      formError: r.reason === "limit" ? limitMessage("거래처", PARTNER_LIMIT) : COLLIDED,
      values,
    };
  } catch (error) {
    return asRejection(error, values);
  }
}

/**
 * 수정 — 코드는 바꾸지 않는다. 거래처명 · 구분 · 국가 · 번호 · 설명용 칸 · 사용 여부.
 * version 은 화면을 연 때의 버전이다 — 그 사이 다른 사람이 고쳤으면 저장하지 않는다(저자 판정 2026-11-05).
 * 주지 않으면 버전을 보지 않는다(서버 안의 시험용 — 화면의 입구는 늘 준다).
 */
export async function updatePartner(
  db: Db,
  code: string,
  values: PartnerValues,
  version?: string,
): Promise<PartnerSaveResult | { ok: false; notFound: true }> {
  const current = await getPartner(db, code);
  if (!current) return { ok: false, notFound: true };
  const parsed = parsePartnerUpdate(values);
  const errors: PartnerErrors = parsed.ok ? {} : { ...parsed.errors };
  await checkCountry(db, values, errors, current.country);
  if (!parsed.ok || Object.keys(errors).length) return { ok: false, errors, values };
  if (version !== undefined && !VERSION.test(version)) return { ok: false, errors: {}, formError: STALE, values };
  try {
    const done = await db
      .update(partners)
      .set({ ...parsed.value, updatedAt: touched() })
      .where(
        version === undefined
          ? eq(partners.id, current.id)
          : and(eq(partners.id, current.id), versionIs(partners.updatedAt, version)),
      )
      .returning({ id: partners.id });
    if (done.length === 0) return { ok: false, errors: {}, formError: STALE, values };
    return { ok: true, code };
  } catch (error) {
    return asRejection(error, values);
  }
}

// ── 시트형 등록(PR F) ────────────────────────────────────

// 시트의 거절 자리 — 사업자등록번호 · 해외 사업자번호는 한 칸(「사업자번호」)이다.
const SHEET_PLACE: Partial<Record<PartnerErrorKey, string>> = { foreignBizNo: "bizNo" };

/** 저장하지 못한 줄의 까닭 — 등록 상한 · 겹침 · 버전 · DB 제약. */
function rowRejection(r: RegisteredRow | UpdatedRow): SheetErrors {
  if (r.ok) return {};
  if (r.reason === "limit") return { [ROW_ERROR]: limitMessage("거래처", PARTNER_LIMIT) };
  if (r.reason === "collided") return { [ROW_ERROR]: COLLIDED };
  if (r.reason === "stale") return { [ROW_ERROR]: STALE_ROW };
  const field = CONSTRAINT_FIELD[constraintOf(r.error) ?? ""];
  return { [field ? (SHEET_PLACE[field] ?? field) : ROW_ERROR]: "받을 수 없는 값입니다" };
}

/** 시트가 고치려는 거래처들 — 코드의 꼴이 맞는 것만 DB 에 묻는다. */
async function partnersByCode(db: Db, rows: readonly SheetRow[]): Promise<Map<string, Partner>> {
  const wanted = [...new Set(rows.map((r) => r[CODE_KEY]).filter((c) => PARTNER_CODE.test(c)))];
  if (wanted.length === 0) return new Map();
  const found = await db.select().from(partners).where(inArray(partners.code, wanted));
  return new Map(found.map((p) => [p.code, p]));
}

/**
 * 시트형 등록 · 고침(성공 기준 11 · 15) — 맞는 줄만 저장한다. 틀린 줄은 넣은 글자 그대로 까닭과 함께 돌려준다.
 * 코드가 없는 줄은 새 등록이다 — 코드를 줄 차례로 붙이고, 등록 상한(1,000)을 넘는 줄은 남는다.
 * 코드가 있는 줄(불러온 줄)은 고침이다 — 한 건 수정의 규칙으로 보고, 불러온 뒤 다른 사람이 고쳤으면 그 줄만 남는다.
 * 저장한 줄마다 같은 사업자번호를 쓰는 다른 거래처를 함께 돌려준다 — 막지 않고 경고만 한다(한 건 등록과 같다, 같은 시트의
 * 줄끼리도). 고침 · 등록 · 그 확인은 한 트랜잭션이다 — 제약 위반이 아닌 실패면 아무것도 저장되지 않는다.
 */
export async function savePartnerRows(db: Db, rows: readonly SheetRow[]): Promise<SheetResult> {
  const filled = rows.filter((r) => !isBlankRow(r));
  const [countries, currents] = await Promise.all([allCountries(db), partnersByCode(db, filled)]);
  const seen = new Map<string, number>();
  for (const r of filled) if (isLoadedRow(r)) seen.set(r[CODE_KEY], (seen.get(r[CODE_KEY]) ?? 0) + 1);

  type Read =
    | { row: SheetRow; kind: "rejected"; errors: SheetErrors }
    | { row: SheetRow; kind: "new"; value: ReturnType<typeof readPartnerRow> & { ok: true } }
    | { row: SheetRow; kind: "edit"; current: Partner; value: ReturnType<typeof readPartnerEditRow> & { ok: true } };
  const read: Read[] = filled.map((row) => {
    if (!isLoadedRow(row)) {
      const r = readPartnerRow(row, countries);
      return r.ok ? { row, kind: "new", value: r } : { row, kind: "rejected", errors: r.errors };
    }
    const current = currents.get(row[CODE_KEY]);
    if (!current) return { row, kind: "rejected", errors: { [ROW_ERROR]: "없는 거래처입니다 — 이 줄을 지우세요" } };
    if (seen.get(row[CODE_KEY])! > 1) return { row, kind: "rejected", errors: { [ROW_ERROR]: DUPLICATE_ROW } };
    if (!VERSION.test(row[VERSION_KEY] ?? "")) return { row, kind: "rejected", errors: { [ROW_ERROR]: STALE_ROW } };
    const r = readPartnerEditRow(row, countries, current);
    return r.ok ? { row, kind: "edit", current, value: r } : { row, kind: "rejected", errors: r.errors };
  });
  const edits = read.flatMap((r) => (r.kind === "edit" ? [r] : []));
  const news = read.flatMap((r) => (r.kind === "new" ? [r] : []));

  // 같은 번호 확인은 저장과 같은 트랜잭션에서 — 같은 시트의 줄끼리도 보이고, 실패하면 아무것도 저장되지 않는다.
  const shared = new Map<string, SharedBizNo[]>();
  const outcome = await db.transaction(async (tx) => {
    const updated = await updateRowsWithVersion(
      tx,
      edits.map((r) => ({
        update: async (sp: Db) =>
          (
            await sp
              .update(partners)
              .set({ ...r.value.value, updatedAt: touched() })
              .where(and(eq(partners.id, r.current.id), versionIs(partners.updatedAt, r.row[VERSION_KEY])))
              .returning({ id: partners.id })
          ).length,
      })),
    );
    const registered = news.length
      ? await registerRowsWithCode(tx, {
          table: partners,
          lock: REGISTER_LOCK.partners,
          limit: PARTNER_LIMIT,
          uniqueConstraint: "partners_code_unique",
          rows: news.map((r) => ({
            prefix: "BP" as const,
            insert: (sp: Db, code: string) => sp.insert(partners).values({ ...r.value.value, code }),
          })),
        })
      : [];
    for (const [i, u] of updated.entries())
      if (u.ok) {
        const code = edits[i].current.code;
        shared.set(code, await partnersSharingBizNo(tx, { code, ...edits[i].value.value }));
      }
    for (const [i, s] of registered.entries())
      if (s.ok) shared.set(s.code, await partnersSharingBizNo(tx, { code: s.code, ...news[i].value.value }));
    return { updated, registered };
  });

  const result: SheetResult = { saved: [], rejected: [] };
  for (const r of read) {
    if (r.kind === "rejected") {
      result.rejected.push({ row: r.row, errors: r.errors });
      continue;
    }
    const done = r.kind === "edit" ? outcome.updated[edits.indexOf(r)] : outcome.registered[news.indexOf(r)];
    if (!done.ok) {
      result.rejected.push({ row: r.row, errors: rowRejection(done) });
      continue;
    }
    const saved = savedCode(r, done);
    const sharedBizNo = shared.get(saved.code) ?? [];
    result.saved.push({ ...saved, name: r.value.value.name, ...(sharedBizNo.length ? { sharedBizNo } : {}) });
  }
  return result;
}
