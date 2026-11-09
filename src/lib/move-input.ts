import { isMoveType, type MoveType } from "./master-codes";

// 수불 전표의 칸과 꼴 검사(조각 「재고 수불」 설계 ③ 「수불 전표」). 화면(브라우저)과 서버가 함께 쓴다 — 검사 도구(zod)를 쓰지 않는다.
// 여기서는 DB 를 보지 않고 꼴만 본다. 품목 · 창고 · 단위 · LOT 가 DB 에 맞는지와 음수 검사는 src/db/stock.ts 가 이어서 본다.

export const MOVE_HEADER_FIELDS = ["moveDate", "moveType", "reason", "note"] as const;
export const MOVE_LINE_FIELDS = ["item", "lot", "warehouse", "toWarehouse", "qty", "unit"] as const;

export type MoveHeaderField = (typeof MOVE_HEADER_FIELDS)[number];
export type MoveLineField = (typeof MOVE_LINE_FIELDS)[number];
export type MoveLineValues = Partial<Record<MoveLineField, string>>;
/** 화면이 보낸 그대로의 글자 — 거절하면 이 값으로 칸을 다시 채운다. */
export type MoveValues = Partial<Record<MoveHeaderField, string>> & { lines: MoveLineValues[] };

/** 줄의 까닭 — 칸마다 하나, 그리고 줄 전체의 까닭(`row` — 모자란 수량 따위). */
export type MoveLineErrors = Partial<Record<MoveLineField | "row", string>>;
/** 거절한 까닭 — 머리 칸마다 하나와, 보낸 줄의 차례(0 부터)마다. */
export type MoveErrors = { header: Partial<Record<MoveHeaderField, string>>; lines: Record<number, MoveLineErrors> };

/** 한 전표의 줄 상한(설계 ③). */
export const MOVE_MAX_LINES = 100;
/** 비고의 길이(설계 ③). */
export const MOVE_NOTE_MAX = 200;
/** 넣는 수량의 정수 자리 — 아홉 자리까지(999,999,999.999). 쌓는 수량은 DB 의 numeric(14,3) 안이다. */
const QTY = /^([+-]?)([0-9]{1,9})(?:\.([0-9]{1,3}))?$/;
const DATE = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;
/** 품목 코드 — 화면은 「코드 이름」으로 보내기도 해서 첫 마디만 읽는다. */
const ITEM_CODE = /^(RM|SF|FG|SM|CS)-[0-9]{4,}$/;
export const WAREHOUSE_CODE = /^WH-[0-9]{2,}$/;
const MINOR_CODE = /^[A-Z0-9][A-Z0-9_]{0,19}$/;
/** LOT 번호 — 영문 · 숫자 · `-` · `_` · `.` 1 ~ 30자(ADR 0016). DB 도 막는다. */
export const LOT = /^[A-Za-z0-9._-]{1,30}$/;

/** 수량 — 천분의 일 단위의 정수(1.5 → 1500). 단위의 자릿수가 셋째 자리까지라 넘지 않는다(ADR 0017 · 0018). */
export type Milli = bigint;
export const ZERO: Milli = BigInt(0);
export const THOUSAND: Milli = BigInt(1000);

export type ParsedLine = {
  /** 보낸 줄의 차례(0 부터) — 까닭을 그 줄에 붙인다. */
  index: number;
  itemCode: string;
  lot: string;
  warehouse: string;
  /** 이동의 받는 창고. 다른 유형은 null. */
  toWarehouse: string | null;
  /** 넣은 수량(조정은 + · −) — 천분의 일 단위. */
  qty: Milli;
  /** 넣은 수량의 소수 자리 수 — 넣은 단위의 자릿수와 견준다. */
  qtyDecimals: number;
  /** 넣은 단위. 비우면 null(품목 단위). */
  unit: string | null;
};

export type ParsedMove = {
  moveDate: string;
  moveType: MoveType;
  reason: string | null;
  note: string;
  lines: ParsedLine[];
};

export type ParseResult = { ok: true; value: ParsedMove } | { ok: false; errors: MoveErrors; formError?: string };

const length = (s: string) => Array.from(s).length;
const t = (v: string | undefined) => (v ?? "").trim();

/** 수량 글자를 읽는다 — 맞지 않으면 null. */
export function parseQty(text: string): { qty: Milli; decimals: number } | null {
  const m = QTY.exec(text.replaceAll(",", ""));
  if (!m) return null;
  const [, sign, int, frac = ""] = m;
  const milli = BigInt(int) * THOUSAND + BigInt(frac.padEnd(3, "0"));
  return { qty: sign === "-" ? -milli : milli, decimals: frac.length };
}

/** 천분의 일 단위의 수량을 보이는 글자로 — 1500 → 「1.5」, 1234567000 → 「1,234,567」. */
export function formatMilli(qty: Milli): string {
  const neg = qty < ZERO;
  const abs = neg ? -qty : qty;
  const int = (abs / THOUSAND).toLocaleString("ko-KR");
  const frac = String(abs % THOUSAND)
    .padStart(3, "0")
    .replace(/0+$/, "");
  return `${neg ? "−" : ""}${int}${frac ? `.${frac}` : ""}`;
}

/** 날짜 글자가 달력에 있는 날인가. */
function isCalendarDate(text: string): boolean {
  const m = DATE.exec(text);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

const isBlankLine = (line: MoveLineValues) => MOVE_LINE_FIELDS.every((f) => t(line[f]) === "");

/**
 * 전표의 꼴을 본다. 칸이 모두 빈 줄은 없는 줄로 친다(화면이 빈 줄을 보낸다). today 는 한국 시각의 오늘(YYYY-MM-DD) — 미래 일자를 거절한다.
 * 틀린 칸이 하나라도 있으면 저장하지 않는다(전표 단위 — 설계 ②).
 */
export function parseMove(values: MoveValues, today: string): ParseResult {
  const errors: MoveErrors = { header: {}, lines: {} };

  const moveDate = t(values.moveDate);
  if (!moveDate) errors.header.moveDate = "일자를 넣으세요";
  else if (!isCalendarDate(moveDate)) errors.header.moveDate = "일자는 YYYY-MM-DD 꼴의 날짜입니다";
  else if (moveDate > today) errors.header.moveDate = "미래 일자는 넣지 못합니다 — 오늘이나 지난 날을 넣으세요";

  const typeText = t(values.moveType);
  const moveType = isMoveType(typeText) ? typeText : undefined;
  if (!moveType) errors.header.moveType = "유형을 고르세요";

  const reasonText = t(values.reason);
  let reason: string | null = null;
  if (moveType === "ADJ") {
    if (!reasonText) errors.header.reason = "조정은 사유를 고르세요";
    else if (!MINOR_CODE.test(reasonText)) errors.header.reason = "목록에서 사유를 고르세요";
    else reason = reasonText;
  } else if (reasonText && moveType) errors.header.reason = "사유는 조정에만 넣습니다";

  const note = t(values.note);
  if (length(note) > MOVE_NOTE_MAX) errors.header.note = `비고는 ${MOVE_NOTE_MAX}자까지입니다`;

  const lines: ParsedLine[] = [];
  let count = 0;
  (values.lines ?? []).forEach((line, index) => {
    if (isBlankLine(line)) return;
    count++;
    const e: MoveLineErrors = {};
    const itemCode = t(line.item).split(/\s+/)[0] ?? "";
    if (!itemCode) e.item = "품목을 고르세요";
    else if (!ITEM_CODE.test(itemCode)) e.item = "목록에서 품목을 고르세요";

    const lot = t(line.lot);
    if (lot && !LOT.test(lot)) e.lot = "LOT 는 영문 · 숫자 · - · _ · . 30자까지입니다";

    const warehouse = t(line.warehouse);
    const isXfer = moveType === "XFER";
    if (!warehouse) e.warehouse = isXfer ? "보내는 창고를 고르세요" : "창고를 고르세요";
    else if (!WAREHOUSE_CODE.test(warehouse)) e.warehouse = "목록에서 창고를 고르세요";

    const toText = t(line.toWarehouse);
    let toWarehouse: string | null = null;
    if (isXfer) {
      if (!toText) e.toWarehouse = "받는 창고를 고르세요";
      else if (!WAREHOUSE_CODE.test(toText)) e.toWarehouse = "목록에서 창고를 고르세요";
      else if (toText === warehouse) e.toWarehouse = "보내는 창고와 다른 창고를 고르세요";
      else toWarehouse = toText;
    } else if (toText && moveType) e.toWarehouse = "받는 창고는 이동에만 넣습니다";

    const qtyText = t(line.qty);
    const q = qtyText ? parseQty(qtyText) : null;
    if (!qtyText) e.qty = "수량을 넣으세요";
    else if (!q) e.qty = "수량은 정수 아홉 자리 · 소수 셋째 자리까지의 수입니다";
    else if (q.qty === ZERO) e.qty = "0 이 아닌 수량을 넣으세요";
    else if (moveType && moveType !== "ADJ" && (q.qty < ZERO || qtyText.startsWith("+")))
      e.qty = "수량은 0 보다 큰 수입니다 — + · − 는 조정에만 붙입니다";

    const unit = t(line.unit);
    if (unit && !MINOR_CODE.test(unit)) e.unit = "목록에서 단위를 고르세요";

    if (Object.keys(e).length) errors.lines[index] = e;
    else
      lines.push({
        index,
        itemCode,
        lot,
        warehouse,
        toWarehouse,
        qty: q!.qty,
        qtyDecimals: q!.decimals,
        unit: unit || null,
      });
  });

  let formError: string | undefined;
  if (count === 0) formError = "줄을 하나 이상 넣으세요";
  else if (count > MOVE_MAX_LINES) formError = `한 전표는 ${MOVE_MAX_LINES}줄까지입니다`;

  const failed = formError || Object.keys(errors.header).length || Object.keys(errors.lines).length;
  if (failed || !moveType) return { ok: false, errors, formError };
  return { ok: true, value: { moveDate, moveType, reason, note, lines } };
}

/** 화면이 보낸 칸을 모은다 — 머리 칸과 `lines.<차례>.<칸>`. 줄은 차례대로, 빈 차례는 빈 줄이다. */
export function moveValues(form: FormData): MoveValues {
  const values: MoveValues = { lines: [] };
  for (const f of MOVE_HEADER_FIELDS) {
    const v = form.get(f);
    if (typeof v === "string") values[f] = v;
  }
  for (const [key, v] of form.entries()) {
    const m = /^lines\.([0-9]{1,3})\.([a-zA-Z]+)$/.exec(key);
    if (!m || typeof v !== "string") continue;
    const index = Number(m[1]);
    const field = m[2] as MoveLineField;
    if (index > MOVE_MAX_LINES * 2 || !(MOVE_LINE_FIELDS as readonly string[]).includes(field)) continue;
    while (values.lines.length <= index) values.lines.push({});
    values.lines[index][field] = v;
  }
  return values;
}
