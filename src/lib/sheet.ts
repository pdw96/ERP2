// 시트형 등록(설계 「PR F 를 열기 전에 정한 것」)의 규칙 가운데 화면(브라우저)과 서버가 같이 쓰는 것 — 칸 정의,
// 엑셀에서 복사한 글 읽기, 머리글 줄 건너뛰기, 한 번에 받는 줄 수, 서버가 받은 글 읽기. 검사 도구(zod)는 쓰지 않는다.

/** 한 번에 받는 줄 수(저자 판정 2026-11-03). 넘으면 나눠 붙여넣는다. */
export const SHEET_MAX_ROWS = 100;

/** 시트의 칸 하나 — 칸 순서는 한 건 등록 화면과 같다. */
export type SheetColumn = {
  key: string;
  label: string;
  /** 칸에 넣는 값의 규칙 — 화면에서 칸 이름에 마우스를 올리면 보인다. */
  rule: string;
  /** 꼭 넣는 칸 — 화면이 칸 머리를 필수 입력의 색으로 보인다(새 줄 기준). */
  required?: boolean;
  /** 거절을 묶어 보이는 자리 — 예: 매입처 · 매출처는 「구분」 한 자리. 없으면 key. */
  errorKey?: string;
  /** 칸의 넓이(글자 수) — 화면이 칸을 그릴 때만 쓴다. */
  width?: number;
  /** 불러온 줄(기존 데이터)에서는 고칠 수 없는 칸 — 품목 유형(ADR 0003 · 0013). 새 줄에서는 넣는다. */
  fixed?: boolean;
};

/**
 * 불러온 줄의 숨은 칸(PR J) — 코드와 불러온 때의 버전. 칸(column)이 아니라 붙여넣기 · 머리글 · 칸 순서에 들지 않는다.
 * 코드가 있는 줄은 고침, 없는 줄은 새 등록이다(저자 판정 2026-11-05 — 한 시트에 같이 둔다).
 */
export const CODE_KEY = "_code";
export const VERSION_KEY = "_version";

/** 기존 데이터를 불러온 줄인가. */
export const isLoadedRow = (row: SheetRow) => !!row[CODE_KEY];

/** 불러온 줄이 불러온 때와 달라졌나 — 칸만 견준다. 바뀐 줄만 저장한다(성공 기준 15). */
export const rowChanged = (columns: readonly SheetColumn[], original: SheetRow, row: SheetRow) =>
  columns.some((c) => (original[c.key] ?? "") !== (row[c.key] ?? ""));

/** 한 줄 — 칸 key → 넣은 글자 그대로. */
export type SheetRow = Record<string, string>;
/** 한 줄의 거절 — 자리(칸의 errorKey 또는 key, 줄 전체는 ROW_ERROR) → 까닭. */
export type SheetErrors = Record<string, string>;
/** 줄 전체의 거절(등록 상한 따위)을 두는 자리. */
export const ROW_ERROR = "_row";

export type SheetSaved = {
  code: string;
  name: string;
  /** 불러온 줄을 고쳐 저장했다(PR J). 없으면 새로 등록한 줄. */
  updated?: boolean;
  /** 같은 사업자번호를 쓰는 다른 거래처 — 막지 않고 경고만 한다(저자 판정 2026-11-03). */
  sharedBizNo?: { code: string; name: string; active: boolean }[];
};

/** 저장의 결과 — 맞는 줄은 저장되고(saved), 틀린 줄은 넣은 글자 그대로 까닭과 함께 시트에 남는다(rejected). */
export type SheetResult = {
  saved: SheetSaved[];
  rejected: { row: SheetRow; errors: SheetErrors }[];
  /** 아무것도 저장하지 못한 까닭 — 이때 saved 는 비고 rejected 에 모든 줄이 남는다. */
  formError?: string;
};

/** 기존 데이터 불러오기(PR J)의 결과 — 찾은 것을 코드 순으로 앞 100건까지(저자 판정 2026-11-05). */
export type SheetLoad = {
  rows: SheetRow[];
  /** 찾은 건수 — rows 보다 많으면 앞 100건만 온 것이다. */
  total: number;
  /** 거르지 않은 값의 알림(없는 유형 따위). */
  notices: string[];
  formError?: string;
};

export const blankRow = (columns: readonly SheetColumn[]): SheetRow =>
  Object.fromEntries(columns.map((c) => [c.key, ""]));

/** 모든 칸이 비었거나 빈칸뿐인 줄 — 저장할 때 건너뛴다(틀린 줄이 아니다). */
export const isBlankRow = (row: SheetRow) => Object.values(row).every((v) => v.trim() === "");

/** 머리글 줄 — 칸 이름을 탭으로 이은 것. 「머리글 줄 복사」 단추가 클립보드에 넣는다. */
export const headerLine = (columns: readonly SheetColumn[]) => columns.map((c) => c.label).join("\t");

/**
 * 엑셀 · 구글 시트에서 복사한 글(칸은 탭, 줄은 줄바꿈)을 칸의 2차원 배열로 읽는다.
 * 칸 안에 줄바꿈 · 탭 · 따옴표가 있으면 엑셀은 그 칸을 따옴표로 감싸고 안의 따옴표를 두 번 쓴다 — 그대로 푼다.
 * 끝의 줄바꿈 하나(엑셀이 붙인다)는 빈 줄로 치지 않는다.
 */
export function parseClipboard(text: string): string[][] {
  const s = text.replace(/\r\n?/g, "\n").replace(/\n$/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let i = 0;
  let atCellStart = true;
  while (i < s.length) {
    const ch = s[i];
    if (atCellStart && ch === '"') {
      // 따옴표로 감싼 칸 — 닫는 따옴표 뒤가 탭 · 줄바꿈 · 끝일 때만 감싼 칸으로 읽는다. 아니면 글자 그대로.
      let j = i + 1;
      let quoted = "";
      let closed = false;
      while (j < s.length) {
        if (s[j] === '"') {
          if (s[j + 1] === '"') {
            quoted += '"';
            j += 2;
            continue;
          }
          closed = true;
          j++;
          break;
        }
        quoted += s[j++];
      }
      if (closed && (j === s.length || s[j] === "\t" || s[j] === "\n")) {
        cell = quoted;
        i = j;
        atCellStart = false;
        continue;
      }
    }
    atCellStart = false;
    if (ch === "\t") {
      row.push(cell);
      cell = "";
      atCellStart = true;
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      atCellStart = true;
    } else {
      cell += ch;
    }
    i++;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

/** 붙여넣은 글이 여러 칸 · 여러 줄인가. */
export const isMultiCell = (text: string) => /[\t\n]/.test(text.replace(/\r?\n$/, ""));

/**
 * 시트가 붙여넣기를 가로챌 글인가 — 여러 칸 · 여러 줄이거나, 엑셀이 따옴표로 감싼 한 칸(풀면 글이 달라진다, 리뷰 1회차).
 * 그 밖의 한 칸짜리 글은 브라우저가 그 칸에 그대로 붙인다.
 */
export function takesPaste(text: string): boolean {
  if (isMultiCell(text)) return true;
  const grid = parseClipboard(text);
  return grid.length === 1 && grid[0].length === 1 && grid[0][0] !== text.replace(/\r?\n$/, "");
}

const bare = (s: string) => s.replace(/\s/g, "");

/** 첫 줄이 머리글인가 — 빈칸이 아닌 칸이 하나 이상이고, 그 칸이 모두 붙여넣는 자리의 칸 이름과 같다(빈칸은 무시). */
export function isHeaderRow(cells: readonly string[], columns: readonly SheetColumn[], startCol: number): boolean {
  let seen = false;
  for (let k = 0; k < cells.length; k++) {
    const text = bare(cells[k]);
    if (!text) continue;
    const column = columns[startCol + k];
    if (!column || text !== bare(column.label)) return false;
    seen = true;
  }
  return seen;
}

export type Pasted = {
  rows: SheetRow[];
  skippedHeader: boolean;
  /** 붙여넣은 줄 수 — 머리글과 100줄을 넘어 버린 줄은 세지 않는다. */
  pastedRows: number;
  /** 100줄을 넘어 받지 않은 줄 수. */
  droppedRows: number;
  /** 시트의 칸보다 많아 버린 칸이 있었나. */
  droppedColumns: boolean;
  /** 불러온 줄의 고칠 수 없는 칸(유형)에 온 값을 버렸나. */
  skippedFixed: boolean;
};

/**
 * 붙여넣기 — 고른 칸(startRow, startCol)부터 오른쪽 · 아래로 채운다. 모자란 줄은 더하고, 100줄을 넘는 줄과
 * 시트의 칸을 넘는 칸은 버린다. 첫 줄이 머리글이면 건너뛴다.
 */
export function pasteInto(
  rows: readonly SheetRow[],
  columns: readonly SheetColumn[],
  startRow: number,
  startCol: number,
  text: string,
): Pasted {
  let grid = parseClipboard(text);
  const skippedHeader = grid.length > 0 && isHeaderRow(grid[0], columns, startCol);
  if (skippedHeader) grid = grid.slice(1);

  const room = Math.max(0, SHEET_MAX_ROWS - startRow);
  const droppedRows = Math.max(0, grid.length - room);
  grid = grid.slice(0, room);

  const next = rows.map((r) => ({ ...r }));
  let droppedColumns = false;
  let skippedFixed = false;
  grid.forEach((cells, k) => {
    const r = startRow + k;
    while (next.length <= r) next.push(blankRow(columns));
    cells.forEach((value, m) => {
      const column = columns[startCol + m];
      if (!column) {
        if (value.trim()) droppedColumns = true;
      } else if (column.fixed && isLoadedRow(next[r])) {
        if (value !== next[r][column.key]) skippedFixed = true;
      } else next[r][column.key] = value;
    });
  });
  return { rows: next, skippedHeader, pastedRows: grid.length, droppedRows, droppedColumns, skippedFixed };
}

/**
 * 빨간 표시를 지우는 규칙 — 칸 고치기와 붙여넣기가 같이 쓴다(설계 「경계를 정했다 (2026-11-04, PR F 2회차)」).
 * 값이 바뀐 칸의 자리(errorKey 또는 key)만 지우고, 칸이 하나라도 바뀌면 줄 전체의 거절도 지운다. 받은 거절은 바꾸지 않는다.
 */
export function clearChangedErrors(
  columns: readonly SheetColumn[],
  before: SheetRow,
  after: SheetRow,
  errors: SheetErrors,
): SheetErrors {
  const changed = columns.filter((c) => (before[c.key] ?? "") !== (after[c.key] ?? ""));
  if (changed.length === 0) return errors;
  const next = { ...errors };
  for (const c of changed) delete next[c.errorKey ?? c.key];
  delete next[ROW_ERROR];
  return next;
}

/** 줄 하나의 칸 하나에 받는 글자의 위 — 칸의 검사(100자 따위)보다 넉넉하다. 넘으면 그 줄을 거절한다. */
const CELL_MAX = 1000;
/** 숨은 칸(코드 · 버전)의 글자 위. */
const HIDDEN_MAX = 30;

/**
 * 서버가 받은 시트(JSON 글)를 읽는다 — 누구나 부를 수 있는 POST 라 화면을 믿지 않는다.
 * 줄마다 아는 칸과 불러온 줄의 숨은 칸(코드 · 버전)만 글자로 남긴다. 줄이 100을 넘거나 꼴이 틀리면 거절한다.
 * 코드 · 버전의 꼴은 DB 쪽이 본다 — 없는 코드 · 다른 버전은 그 줄의 거절이다.
 */
export function readSheetPayload(
  text: unknown,
  columns: readonly SheetColumn[],
): { ok: true; rows: SheetRow[] } | { ok: false; formError: string } {
  const broken = { ok: false, formError: "시트를 읽지 못했습니다 — 화면을 새로 열어 다시 넣으세요" } as const;
  if (typeof text !== "string") return broken;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return broken;
  }
  if (!Array.isArray(data)) return broken;
  if (data.length > SHEET_MAX_ROWS)
    return { ok: false, formError: `한 번에 ${SHEET_MAX_ROWS}행까지 받습니다 — 나눠서 저장하세요` };
  const rows: SheetRow[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return broken;
    const row = blankRow(columns);
    for (const c of columns) {
      const v = (item as Record<string, unknown>)[c.key];
      if (v === undefined || v === null) continue;
      if (typeof v !== "string" || v.length > CELL_MAX) return broken;
      row[c.key] = v;
    }
    for (const key of [CODE_KEY, VERSION_KEY]) {
      const v = (item as Record<string, unknown>)[key];
      if (v === undefined || v === null || v === "") continue;
      if (typeof v !== "string" || v.length > HIDDEN_MAX) return broken;
      row[key] = v;
    }
    rows.push(row);
  }
  return { ok: true, rows };
}
