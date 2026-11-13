import { parseQty, THOUSAND, ZERO, type Milli } from "./move-input";

// BOM 등록의 칸과 꼴 검사(조각 「BOM」 설계 ③ 「BOM 등록의 저장」, ADR 0026). 화면(브라우저)과 서버가 함께 쓴다.
// 여기서는 DB 를 보지 않고 꼴만 본다. 품목의 유형 · 「사용」 여부 · 단위의 자릿수 · 적용 기간 겹침 · 돌고 도는 BOM 은
// src/db/boms.ts 가 BOM 의 잠금 아래 이어서 본다.

export const BOM_LINE_FIELDS = ["child", "qty", "lossRate", "validFrom", "validTo", "note"] as const;
export type BomLineField = (typeof BOM_LINE_FIELDS)[number];
/** 줄의 칸과 원래 줄 번호(`lineNo` — 화면을 연 때 그 BOM 에 있던 줄, PR C). 원래 번호는 고친 이력에서 「줄 고침」과 「뺌 · 더함」을 가를 뿐 칸이 아니다. */
export type BomLineValues = Partial<Record<BomLineField | "lineNo", string>>;
/** 화면이 보낸 그대로의 글자 — 부모 품목 · 기준수량 · 버전(새 BOM 은 빈 글자)과 줄. */
export type BomValues = { parent?: string; baseQty?: string; version?: string; lines: BomLineValues[] };

export type BomHeaderErrors = Partial<Record<"parent" | "baseQty", string>>;
export type BomLineErrors = Partial<Record<BomLineField | "row", string>>;
export type BomErrors = { header: BomHeaderErrors; lines: Record<number, BomLineErrors> };

/** 한 BOM 의 줄 상한(설계 ③). */
export const BOM_MAX_LINES = 200;
/** 비고의 글자 수 상한. */
export const BOM_NOTE_MAX = 200;
export const ITEM_CODE = /^(RM|SF|FG|SM|CS)-[0-9]{4,}$/;
const DATE = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;
const LOSS = /^([0-9]{1,2})(?:\.([0-9]{1,2}))?$/;

export type ParsedBomLine = {
  /** 보낸 줄의 차례(0 부터) — 까닭을 그 줄에 붙인다. */
  index: number;
  childCode: string;
  /** 소요량(천분의 일 단위)과 넣은 소수 자릿수 — 자품목 단위의 자릿수는 서버가 본다. */
  qty: Milli;
  qtyDecimals: number;
  /** 로스율(백분의 일 퍼센트 단위) — 5.25% → 525. */
  lossRate: number;
  validFrom: string;
  /** 적용 종료일 — 비우면 null(계속). 그날까지 쓴다(ADR 0026 의 9). */
  validTo: string | null;
  note: string;
  /** 화면을 연 때 그 BOM 에 있던 줄의 번호 — 새 줄 · 틀린 값이면 null(PR C). */
  origLineNo: number | null;
};

export type ParsedBom = {
  parentCode: string;
  baseQty: Milli;
  baseQtyDecimals: number;
  /** 화면을 연 때의 버전 — 새 BOM 은 빈 글자. */
  version: string;
  lines: ParsedBomLine[];
};

export type BomParseResult = { ok: true; value: ParsedBom } | { ok: false; errors: BomErrors; formError?: string };

const t = (v: string | undefined) => (v ?? "").trim();
const isBlankLine = (l: BomLineValues) => BOM_LINE_FIELDS.every((f) => t(l[f]) === "");
/** 「RM-0001 웨이퍼」처럼 이름이 붙어 와도 코드만 읽는다. */
export const codeOf = (text: string) => text.trim().split(/\s+/)[0] ?? "";

/** 날짜 글자가 달력에 있는 날인가. */
export function isCalendarDate(text: string): boolean {
  const m = DATE.exec(text);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** 로스율 글자를 백분의 일 단위로 — 비우면 0, 틀리면 null. */
export function parseLossRate(text: string): number | null {
  if (text === "") return 0;
  const m = LOSS.exec(text);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

/** 백분의 일 단위의 로스율을 보이는 글자로 — 525 → 「5.25」, 300 → 「3」. */
export function formatLossRate(hundredths: number): string {
  const int = Math.trunc(hundredths / 100);
  const frac = String(hundredths % 100)
    .padStart(2, "0")
    .replace(/0+$/, "");
  return frac ? `${int}.${frac}` : String(int);
}

/** 양의 수량을 읽는다 — 0 보다 크고 소수 셋째 자리까지. 틀리면 null. */
function positiveQty(text: string): { qty: Milli; decimals: number } | null {
  if (/^[+-]/.test(text)) return null;
  const q = parseQty(text);
  return q && q.qty > ZERO ? q : null;
}

/**
 * BOM 의 꼴을 본다. 칸이 모두 빈 줄은 없는 줄로 친다(화면의 빈 더한 줄). 틀린 칸이 하나라도 있으면 저장하지 않는다(한 저장은 통째로 — 설계 ②).
 * 같은 자품목의 줄이 여럿이어도 꼴로는 막지 않는다 — 적용 기간이 겹치는지는 서버가 본다.
 */
export function parseBom(values: BomValues): BomParseResult {
  const errors: BomErrors = { header: {}, lines: {} };
  let formError: string | undefined;

  const parentCode = codeOf(t(values.parent));
  if (!parentCode) errors.header.parent = "부모 품목을 고르세요";
  else if (!ITEM_CODE.test(parentCode)) errors.header.parent = "목록에서 부모 품목을 고르세요";

  const baseText = t(values.baseQty);
  const base = positiveQty(baseText);
  if (!baseText) errors.header.baseQty = "기준수량을 넣으세요";
  else if (!base) errors.header.baseQty = "기준수량은 0 보다 큰 수입니다 — 정수 아홉 자리 · 소수 셋째 자리까지";

  const lines: ParsedBomLine[] = [];
  let count = 0;
  (values.lines ?? []).forEach((line, index) => {
    if (isBlankLine(line)) return;
    count++;
    const e: BomLineErrors = {};
    const childCode = codeOf(t(line.child));
    if (!childCode) e.child = "자품목을 고르세요";
    else if (!ITEM_CODE.test(childCode)) e.child = "목록에서 자품목을 고르세요";
    else if (childCode === parentCode) e.child = "부모 품목을 자기 자품목으로 넣지 못합니다";

    const qtyText = t(line.qty);
    const q = positiveQty(qtyText);
    if (!qtyText) e.qty = "소요량을 넣으세요";
    else if (!q) e.qty = "소요량은 0 보다 큰 수입니다 — 정수 아홉 자리 · 소수 셋째 자리까지";

    const lossRate = parseLossRate(t(line.lossRate));
    if (lossRate === null) e.lossRate = "로스율은 0 이상 100 미만입니다 — 소수 둘째 자리까지";

    const validFrom = t(line.validFrom);
    if (!validFrom) e.validFrom = "적용 시작일을 넣으세요";
    else if (!isCalendarDate(validFrom)) e.validFrom = "적용 시작일은 YYYY-MM-DD 꼴의 날짜입니다";

    const toText = t(line.validTo);
    if (toText && !isCalendarDate(toText)) e.validTo = "적용 종료일은 YYYY-MM-DD 꼴의 날짜입니다 — 계속 쓰면 비우세요";
    else if (toText && !e.validFrom && toText < validFrom)
      e.validTo = "적용 종료일이 시작일보다 앞섭니다 — 종료일은 그날까지 씁니다";

    const note = t(line.note);
    if (Array.from(note).length > BOM_NOTE_MAX) e.note = `비고는 ${BOM_NOTE_MAX}자까지입니다`;

    if (Object.keys(e).length) errors.lines[index] = e;
    else
      lines.push({
        index,
        childCode,
        qty: q!.qty,
        qtyDecimals: q!.decimals,
        lossRate: lossRate!,
        validFrom,
        validTo: toText || null,
        note,
        origLineNo: lineNoOf(t(line.lineNo)),
      });
  });

  if (count === 0) formError = "자품목 줄을 하나 이상 넣으세요";
  else if (count > BOM_MAX_LINES) formError = `BOM 하나는 ${BOM_MAX_LINES}줄까지입니다`;

  if (formError || Object.keys(errors.header).length || Object.keys(errors.lines).length)
    return { ok: false, errors, formError };
  return {
    ok: true,
    value: { parentCode, baseQty: base!.qty, baseQtyDecimals: base!.decimals, version: t(values.version), lines },
  };
}

/** 원래 줄 번호 — 1 ~ 200 의 정수만, 아니면 null(새 줄로 친다). */
function lineNoOf(text: string): number | null {
  if (!/^[0-9]{1,3}$/.test(text)) return null;
  const n = Number(text);
  return n >= 1 && n <= BOM_MAX_LINES ? n : null;
}

const LINE_KEYS: readonly string[] = [...BOM_LINE_FIELDS, "lineNo"];

/** 화면이 보낸 칸을 모은다 — 머리 칸과 `lines.<차례>.<칸>`. prefix 는 펼친 반제품 BOM 의 `boms.<차례>.`(PR C). */
export function bomValues(form: FormData, prefix = ""): BomValues {
  const values: BomValues = { lines: [] };
  for (const f of ["parent", "baseQty", "version"] as const) {
    const v = form.get(prefix + f);
    if (typeof v === "string") values[f] = v;
  }
  const escaped = prefix.replaceAll(".", "\\.");
  const pattern = new RegExp(`^${escaped}lines\\.([0-9]{1,3})\\.([a-zA-Z]+)$`);
  for (const [key, v] of form.entries()) {
    const m = pattern.exec(key);
    if (!m || typeof v !== "string") continue;
    const index = Number(m[1]);
    const field = m[2] as BomLineField | "lineNo";
    if (index > BOM_MAX_LINES * 2 || !LINE_KEYS.includes(field)) continue;
    while (values.lines.length <= index) values.lines.push({});
    values.lines[index][field] = v;
  }
  return values;
}

// ── 한 화면 다단계 등록(조각 「BOM」 PR C, ADR 0028 의 1 · 2) ─────────────────────

/** 한 번에 저장하는 펼친 반제품 BOM 의 상한(설계 「2026-11-13 — 범위에 더한 것」 ③). */
export const BOM_SUBS_MAX = 50;

/** 맨 위 BOM 과 펼친 반제품 BOM 들 — 화면이 보낸 그대로. */
export type BomTreeValues = { root: BomValues; subs: BomValues[] };

/** 화면이 보낸 칸을 모은다 — 맨 위 BOM 은 머리 칸 그대로, 펼친 반제품 BOM 은 `boms.<차례>.` 아래. 차례는 0 ~ 상한의 두 배까지만 읽는다. */
export function bomTreeValues(form: FormData): BomTreeValues {
  const indexes = new Set<number>();
  for (const key of form.keys()) {
    const m = /^boms\.([0-9]{1,3})\./.exec(key);
    if (m && Number(m[1]) < BOM_SUBS_MAX * 2) indexes.add(Number(m[1]));
  }
  return {
    root: bomValues(form),
    subs: [...indexes].sort((a, b) => a - b).map((k) => bomValues(form, `boms.${k}.`)),
  };
}

/** 펼쳤지만 아무것도 넣지 않은 새 반제품 BOM 인가 — 저장하지 않고 건너뛴다(BOM 이 없는 반제품을 펼쳐 보기만 했을 때). */
export function isUntouchedNewBom(values: BomValues): boolean {
  return t(values.version) === "" && t(values.baseQty) === "" && (values.lines ?? []).every(isBlankLine);
}

// ── BOM 조회의 주소(조각 「BOM」 PR B, 설계 ③ 「BOM 조회의 주소」) ─────────────────────
// 거르기 값(품목 · 기준일 · 수량)이 틀리면 버리고 알림을 낸다 — 화면은 멈추지 않는다. 품목이 버려지면 펼치지 않고 고르라는 안내가 보인다.
// 여기서는 꼴만 본다. 품목이 있는지 · BOM 이 있는지 · 수량이 부모 단위의 자릿수 안인지는 src/db/boms.ts 가 이어서 본다.

/** 정전개(제품에서 자재로) · 역전개(자재에서 그것을 쓰는 제품으로). */
export type BomMode = "down" | "up";
/** 정전개 수량의 상한(설계 ③) — 천분의 일 단위. */
export const EXPLODE_QTY_MAX: Milli = BigInt(1_000_000_000) * BigInt(1000);

export type BomInquiryNotice = { field: "item" | "date" | "qty"; message: string };
export type BomInquiryQuery = {
  mode: BomMode;
  /** 꼴이 맞는 품목코드 — 비었거나 꼴이 틀리면 없다. */
  item?: string;
  /** 기준일(YYYY-MM-DD) — 비거나 틀리면 오늘. */
  date: string;
  /** 정전개의 수량과 넣은 소수 자릿수 — 비거나 틀리면 없다(그 BOM 의 기준수량). 역전개는 읽지 않는다. */
  qty?: { qty: Milli; decimals: number };
};

type Params = Record<string, string | string[] | undefined>;
const param = (params: Params, key: string) => {
  const v = params[key];
  return ((Array.isArray(v) ? v[0] : v) ?? "").trim();
};

/** BOM 조회 화면의 주소를 읽는다 — 아래 밖의 이름(mode · item · date · qty 밖)은 읽지 않는다. today 는 한국 시각의 오늘. */
export function parseBomInquiry(
  params: Params,
  today: string,
): { query: BomInquiryQuery; notices: BomInquiryNotice[] } {
  const notices: BomInquiryNotice[] = [];
  const mode: BomMode = param(params, "mode") === "up" ? "up" : "down";

  const itemText = param(params, "item");
  let item: string | undefined;
  if (ITEM_CODE.test(itemText)) item = itemText;
  else if (itemText)
    notices.push({ field: "item", message: "품목코드의 꼴이 아니라 펼치지 않았습니다 — 품목을 고르세요" });

  const dateText = param(params, "date");
  let date = today;
  if (isCalendarDate(dateText)) date = dateText;
  else if (dateText) notices.push({ field: "date", message: "달력에 없는 날짜라 기준일을 오늘로 두었습니다" });

  let qty: BomInquiryQuery["qty"];
  const qtyText = param(params, "qty");
  if (mode === "down" && qtyText) {
    // 저장하는 수량(정수 아홉 자리)과 달리 상한 1,000,000,000 은 열 자리다 — 여기서 따로 읽는다.
    const m = /^([0-9]{1,10})(?:\.([0-9]{1,3}))?$/.exec(qtyText.replaceAll(",", ""));
    const q = m && {
      qty: BigInt(m[1]) * THOUSAND + BigInt((m[2] ?? "").padEnd(3, "0")),
      decimals: (m[2] ?? "").length,
    };
    if (q && q.qty > ZERO && q.qty <= EXPLODE_QTY_MAX) qty = q;
    else
      notices.push({
        field: "qty",
        message: "수량은 0 보다 크고 1,000,000,000 까지(소수 셋째 자리까지)라 기준수량으로 펼쳤습니다",
      });
  }
  return { query: { mode, item, date, qty }, notices };
}
