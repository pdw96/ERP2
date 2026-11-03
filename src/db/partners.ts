import { and, asc, eq, ilike, ne, or, type SQL } from "drizzle-orm";
import {
  parseNewPartner,
  parsePartnerUpdate,
  type PartnerErrorKey,
  type PartnerErrors,
  type PartnerValues,
} from "@/lib/partner-input";
import {
  COLLIDED,
  REGISTER_LOCK,
  constraintOf,
  first,
  likeLiteral,
  limitMessage,
  registerWithCode,
  searchText,
  type Params,
} from "./master-shared";
import { nextCode } from "./numbering";
import { partners } from "./schema";
import type { Db } from "./types";

// 거래처의 목록 · 등록 · 수정(조각 「기준정보」 PR D). 화면(src/app/master/partners/)은 이 함수만 부른다.
// 입력 검사는 src/lib/partner-input.ts, 등록 상한 · 코드 번호는 여기서 본다.

/** 거래처의 등록 상한(설계 「PR B 를 열기 전에 정한 것」) — 매일 밤 되돌림이 샘플 수로 줄인다. */
export const PARTNER_LIMIT = 1000;

export type Partner = typeof partners.$inferSelect;

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

export type PartnerFilter = { q: string; role?: PartnerRole; includeInactive: boolean };
export type PartnerFilterNotice = { field: "q" | "role"; message: string };

/** 주소의 거르기 값을 읽는다. 닫힌 목록 밖의 값은 거르지 않고 알린다. */
export function parsePartnerFilter(params: Params): { filter: PartnerFilter; notices: PartnerFilterNotice[] } {
  const notices: PartnerFilterNotice[] = [];
  const search = searchText(params);
  if (search.notice) notices.push({ field: "q", message: search.notice });
  const filter: PartnerFilter = { q: search.q, includeInactive: first(params.inactive) === "1" };

  const role = first(params.role) ?? "";
  if (PARTNER_ROLES.some((r) => r.code === role)) filter.role = role as PartnerRole;
  else if (role) notices.push({ field: "role", message: "없는 구분이라 거르지 않았습니다" });

  return { filter, notices };
}

/** 코드 순으로. 찾기는 코드 · 거래처명에 글자가 들어 있는지만 본다(대소문자 무시). 둘 다인 거래처는 어느 쪽으로 걸러도 보인다. */
export async function listPartners(db: Db, filter: PartnerFilter): Promise<Partner[]> {
  const where: SQL[] = [];
  if (filter.q)
    where.push(or(ilike(partners.code, likeLiteral(filter.q)), ilike(partners.name, likeLiteral(filter.q)))!);
  if (filter.role === "supplier") where.push(eq(partners.isSupplier, true));
  if (filter.role === "customer") where.push(eq(partners.isCustomer, true));
  if (!filter.includeInactive) where.push(eq(partners.active, true));
  return db
    .select()
    .from(partners)
    .where(and(...where))
    .orderBy(asc(partners.code));
}

export const PARTNER_CODE = /^BP-[0-9]{4,}$/;

export async function getPartner(db: Db, code: string): Promise<Partner | undefined> {
  if (!PARTNER_CODE.test(code)) return undefined;
  const [row] = await db.select().from(partners).where(eq(partners.code, code));
  return row;
}

/** 같은 사업자등록번호를 쓰는 다른 거래처(「사용 안 함」 포함) — 막지 않고 경고만 한다(저자 판정 2026-11-03). */
export type SharedBizNo = Pick<Partner, "code" | "name" | "active">;

export async function partnersSharingBizNo(db: Db, partner: Pick<Partner, "code" | "bizNo">): Promise<SharedBizNo[]> {
  if (!partner.bizNo) return [];
  return db
    .select({ code: partners.code, name: partners.name, active: partners.active })
    .from(partners)
    .where(and(eq(partners.bizNo, partner.bizNo), ne(partners.code, partner.code)))
    .orderBy(asc(partners.code));
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
};

/** 제약 위반이면 칸의 거절로 바꾸고, 아니면 그대로 던진다(부르는 쪽이 코드만 남기고 알린다). */
function asRejection(error: unknown, values: PartnerValues): PartnerSaveResult {
  const field = CONSTRAINT_FIELD[constraintOf(error) ?? ""];
  if (field) return { ok: false, errors: { [field]: "받을 수 없는 값입니다" }, values };
  throw error;
}

/** 등록 — BP 의 다음 번호를 붙인다. 등록 상한 · 번호는 잠금 안에서 센다(src/db/master-shared.ts). */
export async function createPartner(db: Db, values: PartnerValues): Promise<PartnerSaveResult> {
  const parsed = parseNewPartner(values);
  if (!parsed.ok) return { ok: false, errors: parsed.errors, values };
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

/** 수정 — 코드는 바꾸지 않는다. 거래처명 · 구분 · 사업자등록번호 · 사용 여부. */
export async function updatePartner(
  db: Db,
  code: string,
  values: PartnerValues,
): Promise<PartnerSaveResult | { ok: false; notFound: true }> {
  const current = await getPartner(db, code);
  if (!current) return { ok: false, notFound: true };
  const parsed = parsePartnerUpdate(values);
  if (!parsed.ok) return { ok: false, errors: parsed.errors, values };
  try {
    await db.update(partners).set(parsed.value).where(eq(partners.id, current.id));
    return { ok: true, code };
  } catch (error) {
    return asRejection(error, values);
  }
}
