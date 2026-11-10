import { LOT, parseQty, WAREHOUSE_CODE, ZERO, type Milli } from "./move-input";

// 재고 실사의 칸과 꼴 검사(조각 「재고 수불」 설계 ③ 「실사」, 「2026-11-09 — PR E 를 열기 전에 정한 것」). 화면(브라우저)과 서버가 함께 쓴다.
// 여기서는 DB 를 보지 않고 꼴만 본다. 품목 · LOT · 상태가 DB 에 맞는지와 확정은 src/db/stock-counts.ts 가 이어서 본다.

export const COUNT_LINE_FIELDS = ["item", "lot", "status", "counted", "added"] as const;
export type CountLineField = (typeof COUNT_LINE_FIELDS)[number];
export type CountLineValues = Partial<Record<CountLineField, string>>;
/** 화면이 보낸 그대로의 글자 — 실사 번호(새 실사는 빈 글자) · 창고 · 장부를 불러온 때의 줄 번호 · 버전과 줄. */
export type CountValues = {
  code?: string;
  warehouse?: string;
  baseline?: string;
  version?: string;
  lines: CountLineValues[];
};

export type CountLineErrors = Partial<Record<"item" | "lot" | "counted" | "row", string>>;
export type CountErrors = { lines: Record<number, CountLineErrors> };

/** 실사 한 건의 줄 상한 — 차이가 조정 전표 한 장(100줄)에 다 들어간다(저자 판정). */
export const COUNT_MAX_LINES = 100;
/** 실사 번호 — `PI-YYYYMMDD-NNN`(ADR 0016). */
export const COUNT_CODE = /^PI-[0-9]{8}-[0-9]{3,}$/;
const ITEM_CODE = /^(RM|SF|FG|SM|CS)-[0-9]{4,}$/;
const BASELINE = /^[0-9]{1,10}$/;

export type CountStatus = "DRAFT" | "CONFIRMED" | "CANCELED";
export const COUNT_STATUS_NAME: Record<CountStatus, string> = { DRAFT: "작성 중", CONFIRMED: "확정", CANCELED: "취소" };
export const countStatusName = (s: string) => COUNT_STATUS_NAME[s as CountStatus] ?? s;
export const stockStatusName = (s: string) => (s === "QC" ? "검사대기" : "가용");

export type ParsedCountLine = {
  /** 보낸 줄의 차례(0 부터) — 까닭을 그 줄에 붙인다. */
  index: number;
  itemCode: string;
  lot: string;
  status: "AVAILABLE" | "QC";
  /** 장부에 없어 더한 줄 — 늘 가용(저자 판정). */
  added: boolean;
  /** 실물 수량(천분의 일 단위) — 비우면 null(작성 중에만). */
  counted: Milli | null;
  countedDecimals: number;
};

export type ParsedCount = {
  code: string | null;
  warehouse: string;
  baseline: number;
  version: string;
  lines: ParsedCountLine[];
};

export type CountParseResult =
  { ok: true; value: ParsedCount } | { ok: false; errors: CountErrors; formError?: string };

const t = (v: string | undefined) => (v ?? "").trim();
const isBlankLine = (l: CountLineValues) => t(l.item) === "" && t(l.lot) === "" && t(l.counted) === "";

/**
 * 실사의 꼴을 본다. 품목 · LOT · 실물 수량이 모두 빈 줄은 없는 줄로 친다(화면의 빈 더한 줄). 실물 수량은 비워도 된다 — 작성 중 저장이다.
 * 같은 품목 · LOT · 상태의 줄이 둘이면 뒤 줄을 거절한다. 틀린 줄이 하나라도 있으면 저장하지 않는다.
 */
export function parseCount(values: CountValues): CountParseResult {
  const errors: CountErrors = { lines: {} };
  const code = t(values.code);
  let formError: string | undefined;
  if (code && !COUNT_CODE.test(code)) formError = "없는 실사입니다 — 화면을 새로 여세요";
  const warehouse = t(values.warehouse);
  if (!WAREHOUSE_CODE.test(warehouse)) formError = "창고를 고르세요";
  const baselineText = t(values.baseline);
  const baseline = BASELINE.test(baselineText) ? Number(baselineText) : 0;

  const lines: ParsedCountLine[] = [];
  const seen = new Set<string>();
  let count = 0;
  (values.lines ?? []).forEach((line, index) => {
    if (isBlankLine(line)) return;
    count++;
    const e: CountLineErrors = {};
    const itemCode = t(line.item).split(/\s+/)[0] ?? "";
    if (!itemCode) e.item = "품목을 고르세요";
    else if (!ITEM_CODE.test(itemCode)) e.item = "목록에서 품목을 고르세요";

    const lot = t(line.lot);
    if (lot && !LOT.test(lot)) e.lot = "LOT 는 영문 · 숫자 · - · _ · . 30자까지입니다";

    const added = t(line.added) === "1";
    const status = t(line.status) === "QC" && !added ? "QC" : "AVAILABLE";

    const countedText = t(line.counted);
    let counted: Milli | null = null;
    let countedDecimals = 0;
    if (countedText) {
      const q = parseQty(countedText);
      if (!q || /^[+-]/.test(countedText))
        e.counted = "실물 수량은 0 이상의 수입니다 — 정수 아홉 자리 · 소수 셋째 자리까지";
      else if (q.qty < ZERO) e.counted = "실물 수량은 0 이상의 수입니다";
      else {
        counted = q.qty;
        countedDecimals = q.decimals;
      }
    }

    const key = `${itemCode}|${lot}|${status}`;
    if (!e.item && seen.has(key)) e.row = "같은 품목 · LOT 의 줄이 위에 있습니다 — 한 줄만 남기세요";
    seen.add(key);

    if (Object.keys(e).length) errors.lines[index] = e;
    else lines.push({ index, itemCode, lot, status, added, counted, countedDecimals });
  });

  if (!formError && count === 0) formError = "줄을 하나 이상 넣으세요";
  else if (!formError && count > COUNT_MAX_LINES) formError = `실사 한 건은 ${COUNT_MAX_LINES}줄까지입니다`;

  if (formError || Object.keys(errors.lines).length) return { ok: false, errors, formError };
  return { ok: true, value: { code: code || null, warehouse, baseline, version: t(values.version), lines } };
}

/** 화면이 보낸 칸을 모은다 — 머리 칸과 `lines.<차례>.<칸>`. */
export function countValues(form: FormData): CountValues {
  const values: CountValues = { lines: [] };
  for (const f of ["code", "warehouse", "baseline", "version"] as const) {
    const v = form.get(f);
    if (typeof v === "string") values[f] = v;
  }
  for (const [key, v] of form.entries()) {
    const m = /^lines\.([0-9]{1,3})\.([a-zA-Z]+)$/.exec(key);
    if (!m || typeof v !== "string") continue;
    const index = Number(m[1]);
    const field = m[2] as CountLineField;
    if (index > COUNT_MAX_LINES * 2 || !(COUNT_LINE_FIELDS as readonly string[]).includes(field)) continue;
    while (values.lines.length <= index) values.lines.push({});
    values.lines[index][field] = v;
  }
  return values;
}
