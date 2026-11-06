import { and, asc, count, eq, getTableColumns, ne, sql } from "drizzle-orm";
import { isMadeType, itemTypeName, type MadeItemType } from "@/lib/master-codes";
import { formatLotNumber, periodOf, RULE_CODE, type RuleShape } from "@/lib/number-rule-fields";
import {
  parseNewNumberRule,
  parseNumberRuleUpdate,
  type NumberRuleErrors,
  type NumberRuleField,
  type NumberRuleValues,
} from "@/lib/number-rule-input";
import {
  REGISTER_LOCK,
  STALE,
  VERSION,
  constraintOf,
  limitMessage,
  touched,
  versionIs,
  versionOf,
} from "./master-shared";
import { numberRuleSeqs, numberRules } from "./schema";
import type { Db } from "./types";

// 시스템 관리 › 번호 규칙(조각 「재고 수불」 PR B, ADR 0016)의 목록 · 등록 · 수정과 LOT 번호를 내는 함수.
// 화면(src/app/system/number-rules/)은 이 함수만 부른다. 입력 검사는 src/lib/number-rule-input.ts, 겹침 · 기본 규칙 · 등록 상한은 여기서 본다.

/** 번호 규칙의 등록 상한(설계 「2026-11-06 — PR B 를 열기 전에 정한 것」) — 「사용 안 함」도 센다. 매일 밤 되돌림이 샘플 수로 줄인다. */
export const NUMBER_RULE_LIMIT = 50;

export type NumberRule = typeof numberRules.$inferSelect;
export type NumberRuleWithVersion = NumberRule & { version: string };

// ── 목록 ─────────────────────────────────────────────

/** 규칙 전부 — 코드 순으로(50개 안이라 거르지 않는다). */
export async function listNumberRules(db: Db): Promise<NumberRule[]> {
  return db.select().from(numberRules).orderBy(asc(numberRules.code));
}

export async function getNumberRule(db: Db, code: string): Promise<NumberRuleWithVersion | undefined> {
  if (!RULE_CODE.test(code)) return undefined;
  const [row] = await db
    .select({ ...getTableColumns(numberRules), version: versionOf(numberRules.updatedAt) })
    .from(numberRules)
    .where(eq(numberRules.code, code));
  return row;
}

/** 품목 화면이 고르는 규칙 — 코드 · 이름 · 번호의 예 · 사용 여부 · 기본으로 쓰는 유형. */
export type RuleOption = { code: string; name: string; example: string; active: boolean; defaultFor: string | null };

/** 번호의 예 — 오늘 날짜의 첫 번호. */
export const exampleOf = (rule: RuleShape, today: string) => formatLotNumber(rule, today, 1);

/** 품목 화면의 규칙 목록 — 「사용 안 함」까지(이미 고른 품목은 그 규칙을 보인다). 고르는 목록은 화면이 「사용」만 남긴다. */
export async function ruleOptions(db: Db, today: string): Promise<RuleOption[]> {
  const rows = await listNumberRules(db);
  return rows.map((r) => ({
    code: r.code,
    name: r.name,
    example: exampleOf(r, today),
    active: r.active,
    defaultFor: r.defaultFor,
  }));
}

// ── 등록 · 수정 ─────────────────────────────────────────

export type NumberRuleSaveResult =
  { ok: true; code: string } | { ok: false; errors: NumberRuleErrors; formError?: string; values: NumberRuleValues };
export type NumberRuleNotFound = { ok: false; notFound: true };

const DUPLICATE = "같은 코드의 규칙이 있습니다 — 다른 코드를 넣으세요";
const DEFAULT_STAYS = (type: string) =>
  `${itemTypeName(type)}의 기본 규칙입니다 — 다른 규칙을 ${itemTypeName(type)}의 기본으로 고르면 바뀝니다`;
const DEFAULT_ACTIVE = "유형의 기본 규칙은 「사용 안 함」으로 바꾸지 못합니다";

const CONSTRAINT_FIELD: Record<string, NumberRuleField> = {
  number_rules_code_format: "code",
  number_rules_name_length: "name",
  number_rules_prefix_format: "prefix",
  number_rules_separator_values: "separator",
  number_rules_date_format_values: "dateFormat",
  number_rules_seq_digits_range: "seqDigits",
  number_rules_default_for_values: "defaultFor",
  number_rules_default_active: "active",
};

function asRejection(error: unknown, values: NumberRuleValues): NumberRuleSaveResult {
  const field = CONSTRAINT_FIELD[constraintOf(error) ?? ""];
  if (field) return { ok: false, errors: { [field]: "받을 수 없는 값입니다" }, values };
  throw error;
}

/** 유형의 기본을 이 규칙으로 옮긴다 — 앞의 기본 규칙에서 떼고 이 규칙에 붙인다(같은 트랜잭션). */
async function takeDefault(tx: Db, code: string, type: MadeItemType) {
  await tx
    .update(numberRules)
    .set({ defaultFor: null, updatedAt: touched() })
    .where(and(eq(numberRules.defaultFor, type), ne(numberRules.code, code)));
}

/**
 * 등록 — 세기 · 넣기를 한 트랜잭션에서 잠금을 쥐고 한다(공통코드와 같다) — 동시에 더해도 상한을 넘지 않는다.
 * 유형의 기본으로 고르면 앞의 기본 규칙에서 기본이 옮겨 온다. 코드의 겹침은 DB 의 유일 제약이 막는다.
 */
export async function createNumberRule(db: Db, values: NumberRuleValues): Promise<NumberRuleSaveResult> {
  const parsed = parseNewNumberRule(values);
  if (!parsed.ok) return { ok: false, errors: parsed.errors, values };
  const { defaultFor, ...rest } = parsed.value;
  try {
    return await db.transaction(async (tx): Promise<NumberRuleSaveResult> => {
      await tx.execute(sql`select pg_advisory_xact_lock(${REGISTER_LOCK.numberRules})`);
      const [{ n }] = await tx.select({ n: count() }).from(numberRules);
      if (n >= NUMBER_RULE_LIMIT)
        return { ok: false, errors: {}, formError: limitMessage("번호 규칙", NUMBER_RULE_LIMIT), values };
      if (defaultFor) await takeDefault(tx, rest.code, defaultFor);
      await tx.insert(numberRules).values({ ...rest, defaultFor });
      return { ok: true, code: rest.code };
    });
  } catch (error) {
    if (constraintOf(error) === "number_rules_code_unique") return { ok: false, errors: { code: DUPLICATE }, values };
    return asRejection(error, values);
  }
}

/**
 * 수정 — 코드는 바꾸지 않는다. 머리 · 날짜 꼴 · 자릿수를 고치면 그 뒤에 붙는 번호부터 바뀐다(ADR 0016).
 * 유형의 기본 규칙은 「사용 안 함」으로 바꾸지 못하고, 기본을 떼지 못한다 — 다른 규칙을 기본으로 고르면 옮겨 간다.
 * version 은 화면을 연 때의 버전이다 — 그 사이 다른 사람이 고쳤으면 저장하지 않는다. 주지 않으면 버전을 보지 않는다(서버 안의 시험용).
 */
export async function updateNumberRule(
  db: Db,
  code: string,
  values: NumberRuleValues,
  version?: string,
): Promise<NumberRuleSaveResult | NumberRuleNotFound> {
  const current = await getNumberRule(db, code);
  if (!current) return { ok: false, notFound: true };
  const parsed = parseNumberRuleUpdate(values);
  const errors: NumberRuleErrors = parsed.ok ? {} : { ...parsed.errors };
  if (parsed.ok) {
    const { defaultFor, active } = parsed.value;
    if (current.defaultFor && defaultFor !== current.defaultFor) errors.defaultFor = DEFAULT_STAYS(current.defaultFor);
    else if (defaultFor && !active) errors.active = DEFAULT_ACTIVE;
  }
  if (!parsed.ok || Object.keys(errors).length) return { ok: false, errors, values };
  if (version !== undefined && !VERSION.test(version)) return { ok: false, errors: {}, formError: STALE, values };
  try {
    return await db.transaction(async (tx): Promise<NumberRuleSaveResult> => {
      const done = await tx
        .update(numberRules)
        .set({ ...parsed.value, defaultFor: current.defaultFor, updatedAt: touched() })
        .where(
          version === undefined
            ? eq(numberRules.id, current.id)
            : and(eq(numberRules.id, current.id), versionIs(numberRules.updatedAt, version)),
        )
        .returning({ id: numberRules.id });
      if (done.length === 0) return { ok: false, errors: {}, formError: STALE, values };
      // 기본을 새로 맡으면 앞의 기본 규칙에서 떼고 붙인다 — 버전을 본 뒤라 그 사이 고친 것을 덮지 않는다.
      const { defaultFor } = parsed.value;
      if (defaultFor && defaultFor !== current.defaultFor) {
        await takeDefault(tx, code, defaultFor);
        await tx.update(numberRules).set({ defaultFor }).where(eq(numberRules.id, current.id));
      }
      return { ok: true, code };
    });
  } catch (error) {
    return asRejection(error, values);
  }
}

// ── LOT 번호를 낸다 ─────────────────────────────────────

/**
 * 품목이 쓰는 규칙 — 품목에서 고른 규칙, 없으면 그 유형의 기본 규칙. 만드는 품목(반제품 · 완제품)이 아니면 없다(ADR 0016).
 * 「사용 안 함」 규칙도 이미 고른 품목은 그 규칙으로 계속 받는다.
 */
export async function ruleForItem(
  db: Db,
  item: { itemType: string; lotRuleCode: string | null },
): Promise<NumberRule | undefined> {
  if (!isMadeType(item.itemType)) return undefined;
  const [row] = await db
    .select()
    .from(numberRules)
    .where(item.lotRuleCode ? eq(numberRules.code, item.lotRuleCode) : eq(numberRules.defaultFor, item.itemType));
  return row;
}

/** 한 번에 건너뛸 수 있는 겹친 번호의 수 — 넘으면 멈춘다(규칙을 고치라는 뜻이다). */
const MAX_SKIPS = 1000;

/**
 * LOT 번호 하나를 낸다 — 규칙 · 기간(날짜 꼴로 쓴 수불 일자)의 다음 일련으로 번호를 만들고, 그 품목에 이미 있는 번호(isTaken)면 다음
 * 일련으로 넘어간다(ADR 0016). 부르는 쪽의 트랜잭션 안에서 부른다 — 일련의 행을 잠그므로 동시에 내도 겹치지 않고, 부르는 쪽이 되돌리면
 * 일련도 되돌아간다(설계 ② 「전표 단위」). 수불 등록(PR C)이 부른다.
 */
export async function issueLotNumber(
  tx: Db,
  rule: Pick<NumberRule, "code"> & RuleShape,
  date: string,
  isTaken: (lot: string) => Promise<boolean>,
): Promise<string> {
  const period = periodOf(rule.dateFormat, date);
  for (let skip = 0; skip <= MAX_SKIPS; skip++) {
    const [row] = await tx
      .insert(numberRuleSeqs)
      .values({ ruleCode: rule.code, period, lastSeq: 1 })
      .onConflictDoUpdate({
        target: [numberRuleSeqs.ruleCode, numberRuleSeqs.period],
        set: { lastSeq: sql`${numberRuleSeqs.lastSeq} + 1`, updatedAt: touched() },
      })
      .returning({ seq: numberRuleSeqs.lastSeq });
    const lot = formatLotNumber(rule, date, row.seq);
    if (!(await isTaken(lot))) return lot;
  }
  throw new Error(`LOT 번호 규칙 ${rule.code}: 겹친 번호를 ${MAX_SKIPS}개 넘게 건너뛰었다`);
}
