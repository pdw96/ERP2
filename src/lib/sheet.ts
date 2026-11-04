// 시트형 등록(설계 「PR F 를 열기 전에 정한 것」)의 규칙 가운데 화면(브라우저)과 서버가 같이 쓰는 것 — 칸 정의,
// 엑셀에서 복사한 글 읽기, 머리글 줄 건너뛰기, 한 번에 받는 줄 수, 서버가 받은 글 읽기. 검사 도구(zod)는 쓰지 않는다.

/** 한 번에 받는 줄 수(저자 판정 2026-11-03). 넘으면 나눠 붙여넣는다. */
export const SHEET_MAX_ROWS = 100;

/** 시트의 칸 하나 — 칸 순서는 한 건 등록 화면과 같다. */
export type SheetColumn = {
  key: string;
  label: string;
  /** 칸에 넣는 값의 규칙 — 화면의 「칸 순서」 안내에 보인다. */
  rule: string;
  /** 거절을 묶어 보이는 자리 — 예: 매입처 · 매출처는 「구분」 한 자리. 없으면 key. */
  errorKey?: string;
  /** 칸의 넓이(글자 수) — 화면이 칸을 그릴 때만 쓴다. */
  width?: number;
};

/** 한 줄 — 칸 key → 넣은 글자 그대로. */
export type SheetRow = Record<string, string>;
/** 한 줄의 거절 — 자리(칸의 errorKey 또는 key, 줄 전체는 ROW_ERROR) → 까닭. */
export type SheetErrors = Record<string, string>;
/** 줄 전체의 거절(등록 상한 따위)을 두는 자리. */
export const ROW_ERROR = "_row";

export type SheetSaved = {
  code: string;
  name: string;
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

/** 붙여넣은 글이 여러 칸 · 여러 줄인가 — 한 칸짜리 글은 칸에 그대로 붙인다(브라우저의 붙여넣기). */
export const isMultiCell = (text: string) => /[\t\n]/.test(text.replace(/\r?\n$/, ""));

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
  /** 100줄을 넘어 받지 않은 줄 수. */
  droppedRows: number;
  /** 시트의 칸보다 많아 버린 칸이 있었나. */
  droppedColumns: boolean;
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
  grid.forEach((cells, k) => {
    const r = startRow + k;
    while (next.length <= r) next.push(blankRow(columns));
    cells.forEach((value, m) => {
      const column = columns[startCol + m];
      if (column) next[r][column.key] = value;
      else if (value.trim()) droppedColumns = true;
    });
  });
  return { rows: next, skippedHeader, droppedRows, droppedColumns };
}

/** 줄 하나의 칸 하나에 받는 글자의 위 — 칸의 검사(100자 따위)보다 넉넉하다. 넘으면 그 줄을 거절한다. */
const CELL_MAX = 1000;

/**
 * 서버가 받은 시트(JSON 글)를 읽는다 — 누구나 부를 수 있는 POST 라 화면을 믿지 않는다.
 * 줄마다 아는 칸만 글자로 남긴다. 줄이 100을 넘거나 꼴이 틀리면 거절한다.
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
    return { ok: false, formError: `한 번에 ${SHEET_MAX_ROWS}줄까지 받습니다 — 나눠서 저장하세요` };
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
    rows.push(row);
  }
  return { ok: true, rows };
}
