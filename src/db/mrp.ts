import { count, desc, eq, sql } from "drizzle-orm";
import { limitMessage, REGISTER_LOCK } from "./master-shared";
import { mrpSettingChanges, mrpSettings as mrpSettingsTable } from "./schema";
import type { Db } from "./types";

// MRP 의 완성일 기준 요일 설정과 그 이력(메뉴 「MRP」). 실행 · 계획오더는 뒤의 조각이 이 파일에 더한다.

/** 완성일 기준 요일을 바꾼 이력 전체의 등록 상한 — 매일 밤 되돌림이 비운다. */
export const MRP_SETTING_CHANGE_LIMIT = 1000;
/** 화면에서 보이는 이력의 줄 수 상한. */
export const MRP_SETTING_HISTORY_SHOWN = 20;

const BAD_WEEKDAY = "완성일 기준 요일을 고르세요";

/** MRP 를 고치는 저장이 쥐는 잠금 — 트랜잭션이 끝나면 저절로 풀린다. */
export async function lockMrp(tx: Db): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(${REGISTER_LOCK.mrp})`);
}

export type MrpSettingChange = { changedAt: Date; before: number; after: number };

/** 지금의 완성일 기준 요일(줄이 없으면 1 = 월)과 가장 새 이력 20줄, 이력 전체 줄 수. */
export async function mrpSettings(db: Db): Promise<{ dueWeekday: number; changes: MrpSettingChange[]; total: number }> {
  const [row] = await db
    .select({ dueWeekday: mrpSettingsTable.dueWeekday })
    .from(mrpSettingsTable)
    .where(eq(mrpSettingsTable.id, 1));
  const changes = await db
    .select({
      changedAt: mrpSettingChanges.changedAt,
      before: mrpSettingChanges.before,
      after: mrpSettingChanges.after,
    })
    .from(mrpSettingChanges)
    .orderBy(desc(mrpSettingChanges.changedAt), desc(mrpSettingChanges.id))
    .limit(MRP_SETTING_HISTORY_SHOWN);
  const [{ n }] = await db.select({ n: count() }).from(mrpSettingChanges);
  return { dueWeekday: row?.dueWeekday ?? 1, changes, total: n };
}

/** 1 ~ 7 의 정수(또는 그 글자)만 받는다 — 앞뒤 공백 · 소수 · 빈 글자는 받지 않는다. */
function weekdayOf(input: unknown): number | null {
  const n = typeof input === "string" && /^[1-7]$/.test(input) ? Number(input) : input;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 7 ? n : null;
}

/** 완성일 기준 요일을 저장한다 — 같은 값이면 쓰지 않고, 바뀌면 이력 한 줄을 남긴다. */
export async function saveMrpSettings(
  db: Db,
  dueWeekday: unknown,
): Promise<{ ok: true; changed: boolean } | { ok: false; formError: string }> {
  const next = weekdayOf(dueWeekday);
  if (next === null) return { ok: false, formError: BAD_WEEKDAY };

  return db.transaction(async (tx) => {
    await lockMrp(tx);
    // 잠금을 쥔 뒤 지금 값을 읽는다 — 앞에서 본 뒤 남이 바꿨을 수 있다.
    const [row] = await tx
      .select({ dueWeekday: mrpSettingsTable.dueWeekday })
      .from(mrpSettingsTable)
      .where(eq(mrpSettingsTable.id, 1));
    const before = row?.dueWeekday ?? 1;
    if (before === next) return { ok: true as const, changed: false };

    const [{ n }] = await tx.select({ n: count() }).from(mrpSettingChanges);
    if (n + 1 > MRP_SETTING_CHANGE_LIMIT)
      return { ok: false as const, formError: limitMessage("완성일 기준 요일의 고친 이력", MRP_SETTING_CHANGE_LIMIT) };

    await tx
      .insert(mrpSettingsTable)
      .values({ id: 1, dueWeekday: next })
      .onConflictDoUpdate({ target: mrpSettingsTable.id, set: { dueWeekday: next, updatedAt: new Date() } });
    await tx.insert(mrpSettingChanges).values({ before, after: next });
    return { ok: true as const, changed: true };
  });
}
