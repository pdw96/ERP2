import { BOM_MAX_LINES, codeOf, ITEM_CODE } from "./bom-input";
import { PROCESS_CODE } from "./process-input";
import { WORK_CENTER_CODE } from "./work-center-input";

// 라우팅 등록의 칸과 꼴 검사(메뉴 「라우팅」). 화면(브라우저)과 서버가 함께 쓴다.
// 여기서는 DB 를 보지 않고 꼴만 본다. 품목의 유형 · 「사용」 여부 · 공정과 작업장의 짝 · 투입 자재가 BOM 의 자품목인지는
// src/db/routings.ts 가 라우팅의 잠금 아래 이어서 본다.

export const ROUTING_STEP_FIELDS = ["process", "workCenter", "setupMin", "runSec", "note"] as const;
export type RoutingStepField = (typeof ROUTING_STEP_FIELDS)[number];
/** origSeq — 화면을 연 때의 순번(고친 이력에서 「공정 고침」을 가른다, 칸이 아님). */
export type RoutingStepValues = Partial<Record<RoutingStepField | "origSeq", string>>;
/** step — 붙일 공정 줄의 차례(보낸 steps 의 0 부터 차례), 빈 글자면 붙이지 않음(첫 공정). */
export type RoutingMaterialValues = { item?: string; step?: string };
/** 화면이 보낸 그대로의 글자 — 품목 · 버전(새 라우팅은 빈 글자) · 공정 줄 · 투입 자재. */
export type RoutingValues = {
  item?: string;
  version?: string;
  steps: RoutingStepValues[];
  materials: RoutingMaterialValues[];
};

export type RoutingStepErrors = Partial<Record<RoutingStepField | "row", string>>;
export type RoutingErrors = {
  item?: string;
  steps: Record<number, RoutingStepErrors>;
  materials: Record<number, string>;
};

/** 한 라우팅의 공정 줄 상한. */
export const ROUTING_MAX_STEPS = 50;
export const ROUTING_NOTE_MAX = 200;
/** 한 라우팅에 붙이는 투입 자재의 상한 — BOM 한 장의 줄 상한과 같다(붙일 자재는 BOM 의 자품목이라 보통 이것을 넘지 못한다). */
export const ROUTING_MAX_MATERIALS = BOM_MAX_LINES;
/**
 * 화면이 보내는 자재 줄의 차례 상한 — 화면은 BOM 의 자품목(많아야 BOM 줄 상한) 모두와, 이미 붙어 있던 BOM 밖의 자재(붙인 자재 상한 안)를 보낸다.
 * 붙인 자재를 ROUTING_MAX_MATERIALS 로 막으니 이 둘의 합을 넘지 않는다. 공정 줄의 차례 상한과는 따로다.
 */
export const ROUTING_MATERIAL_ROWS = BOM_MAX_LINES + ROUTING_MAX_MATERIALS;
/** 준비시간의 상한(분). */
export const SETUP_MAX_MIN = 1440;
/** 개당 작업시간의 상한(밀리초) — 3,600 초. */
export const RUN_MAX_MS = 3_600_000;

export type ParsedRoutingStep = {
  /** 보낸 줄의 차례(0 부터) — 까닭을 그 줄에 붙인다. */
  index: number;
  processCode: string;
  workCenterCode: string;
  setupMin: number;
  /** 개당 작업시간 — 정수 밀리초. */
  runMs: number;
  note: string;
  /** 화면을 연 때 그 줄의 순번 — 새 줄 · 틀린 값이면 null. */
  origSeq: number | null;
};
/** stepPos — 붙일 줄의 parsed steps 안 차례(0 부터). */
export type ParsedRoutingMaterial = { index: number; itemCode: string; stepPos: number };
export type ParsedRouting = {
  itemCode: string;
  /** 화면을 연 때의 버전 — 새 라우팅은 빈 글자. */
  version: string;
  steps: ParsedRoutingStep[];
  materials: ParsedRoutingMaterial[];
};

export type RoutingParseResult =
  { ok: true; value: ParsedRouting } | { ok: false; errors: RoutingErrors; formError?: string };

const t = (v: string | undefined) => (v ?? "").trim();
const isBlankStep = (s: RoutingStepValues) => ROUTING_STEP_FIELDS.every((f) => t(s[f]) === "");
const RUN_SEC = /^([0-9]{1,4})(?:\.([0-9]{1,3}))?$/;

/** 개당 작업시간 글자(초)를 정수 밀리초로 — 0 ~ 3,600 초, 소수 셋째 자리까지. 틀리면 null. 부동소수 곱셈은 쓰지 않는다. */
export function parseRunSec(text: string): number | null {
  const m = RUN_SEC.exec(text);
  if (!m) return null;
  const ms = Number(m[1]) * 1000 + Number((m[2] ?? "").padEnd(3, "0"));
  return ms <= RUN_MAX_MS ? ms : null;
}

/** 밀리초를 보이는 초 글자로 — 늘 소수 셋째 자리까지(2400 → 「2.400」). */
export function formatRunMs(ms: number): string {
  return `${Math.trunc(ms / 1000)}.${String(ms % 1000).padStart(3, "0")}`;
}

/** 줄의 차례(0 부터)에 매기는 순번 — 10 · 20 · 30 …. */
export function seqOf(pos: number): number {
  return (pos + 1) * 10;
}

/** 원래 순번 — 10 단위의 10 ~ 500 만, 아니면 null(새 줄로 친다). */
function seqFrom(text: string): number | null {
  if (!/^[0-9]{1,3}$/.test(text)) return null;
  const n = Number(text);
  return n >= 10 && n <= seqOf(ROUTING_MAX_STEPS - 1) && n % 10 === 0 ? n : null;
}

/**
 * 라우팅의 꼴을 본다. 칸이 모두 빈 공정 줄 · 품목이 빈 자재 줄은 없는 줄로 친다(화면의 빈 더한 줄). 틀린 곳이 하나라도 있으면
 * 저장하지 않는다(한 저장은 통째로). 같은 공정을 두 번 넣어도 막지 않는다.
 */
export function parseRouting(values: RoutingValues): RoutingParseResult {
  const errors: RoutingErrors = { steps: {}, materials: {} };
  let formError: string | undefined;

  const itemCode = codeOf(t(values.item));
  if (!itemCode) errors.item = "품목을 고르세요";
  else if (!ITEM_CODE.test(itemCode)) errors.item = "목록에서 품목을 고르세요";

  const steps: ParsedRoutingStep[] = [];
  /** 보낸 줄의 차례 → 담긴 줄 안의 차례(틀린 줄 · 빈 줄은 없다). */
  const posOf = new Map<number, number>();
  /** 틀린 칸이 있어 까닭이 붙은 줄 — 자재가 가리켜도 따로 까닭을 붙이지 않는다. */
  const wrongRows = new Set<number>();
  let count = 0;
  (values.steps ?? []).forEach((row, index) => {
    if (isBlankStep(row)) return;
    count++;
    const e: RoutingStepErrors = {};

    const processCode = codeOf(t(row.process));
    if (!processCode) e.process = "공정을 고르세요";
    else if (!PROCESS_CODE.test(processCode)) e.process = "목록에서 공정을 고르세요";

    const workCenterCode = codeOf(t(row.workCenter));
    if (!workCenterCode) e.workCenter = "작업장을 고르세요";
    else if (!WORK_CENTER_CODE.test(workCenterCode)) e.workCenter = "목록에서 작업장을 고르세요";

    const setupText = t(row.setupMin);
    const setupMin = /^[0-9]{1,4}$/.test(setupText) ? Number(setupText) : null;
    if (setupMin === null || setupMin > SETUP_MAX_MIN) e.setupMin = "준비시간은 0 ~ 1,440 분의 정수입니다";

    const runMs = parseRunSec(t(row.runSec));
    if (runMs === null) e.runSec = "개당 작업시간은 0 ~ 3,600 초입니다 — 소수 셋째 자리까지";

    const note = t(row.note);
    if (Array.from(note).length > ROUTING_NOTE_MAX) e.note = `비고는 ${ROUTING_NOTE_MAX}자까지입니다`;

    if (Object.keys(e).length) {
      errors.steps[index] = e;
      wrongRows.add(index);
    } else {
      posOf.set(index, steps.length);
      steps.push({
        index,
        processCode,
        workCenterCode,
        setupMin: setupMin!,
        runMs: runMs!,
        note,
        origSeq: seqFrom(t(row.origSeq)),
      });
    }
  });

  if (count === 0) formError = "공정 줄을 하나 이상 넣으세요";
  else if (count > ROUTING_MAX_STEPS) formError = `라우팅 하나는 ${ROUTING_MAX_STEPS}줄까지입니다`;

  const materials: ParsedRoutingMaterial[] = [];
  const seen = new Set<string>();
  (values.materials ?? []).forEach((row, index) => {
    const code = codeOf(t(row.item));
    if (!code) return;
    if (!ITEM_CODE.test(code)) {
      errors.materials[index] = "목록에서 자재를 고르세요";
      return;
    }
    if (seen.has(code)) {
      errors.materials[index] = "같은 자재가 두 번 있습니다";
      return;
    }
    seen.add(code);

    const stepText = t(row.step);
    if (stepText === "") return; // 붙이지 않음 — 첫 공정에서 든다.
    const target = /^[0-9]{1,3}$/.test(stepText) ? Number(stepText) : -1;
    const pos = posOf.get(target);
    if (pos !== undefined) materials.push({ index, itemCode: code, stepPos: pos });
    else if (!wrongRows.has(target)) errors.materials[index] = "투입 공정을 다시 고르세요";
  });

  if (!formError && materials.length > ROUTING_MAX_MATERIALS)
    formError = `투입 자재는 ${ROUTING_MAX_MATERIALS}개까지 붙입니다`;

  if (formError || errors.item || Object.keys(errors.steps).length || Object.keys(errors.materials).length)
    return { ok: false, errors, formError };
  return { ok: true, value: { itemCode, version: t(values.version), steps, materials } };
}

/**
 * 화면이 보낸 칸을 모은다 — 머리 칸과 `steps.<차례>.<칸>` · `materials.<차례>.item|step`. 공정 줄의 차례는 줄 상한의 두 배까지,
 * 자재 줄의 차례는 ROUTING_MATERIAL_ROWS 앞까지만 읽는다.
 */
export function routingValues(form: FormData): RoutingValues {
  const values: RoutingValues = { steps: [], materials: [] };
  for (const f of ["item", "version"] as const) {
    const v = form.get(f);
    if (typeof v === "string") values[f] = v;
  }
  const stepKeys: readonly string[] = [...ROUTING_STEP_FIELDS, "origSeq"];
  const materialKeys: readonly string[] = ["item", "step"];
  for (const [key, v] of form.entries()) {
    const m = /^(steps|materials)\.([0-9]{1,3})\.([a-zA-Z]+)$/.exec(key);
    if (!m || typeof v !== "string") continue;
    const index = Number(m[2]);
    if (m[1] === "steps") {
      if (index > ROUTING_MAX_STEPS * 2) continue;
      if (!stepKeys.includes(m[3])) continue;
      while (values.steps.length <= index) values.steps.push({});
      values.steps[index][m[3] as RoutingStepField | "origSeq"] = v;
    } else {
      if (index >= ROUTING_MATERIAL_ROWS) continue;
      if (!materialKeys.includes(m[3])) continue;
      while (values.materials.length <= index) values.materials.push({});
      values.materials[index][m[3] as "item" | "step"] = v;
    }
  }
  return values;
}
