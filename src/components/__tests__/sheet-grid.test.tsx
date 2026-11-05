import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SheetGrid } from "../sheet-grid";
import {
  CODE_KEY,
  ROW_ERROR,
  VERSION_KEY,
  blankRow,
  type SheetLoad,
  type SheetResult,
  type SheetRow,
} from "@/lib/sheet";
import { PARTNER_SHEET_ERROR_LABELS, itemSheetColumns, partnerSheetColumns } from "@/lib/sheet-columns";

// 시트형 등록 화면 — 붙여넣기 · 머리글 · 100줄 · 저장 결과(맞는 줄은 빠지고 틀린 줄은 빨간 칸과 까닭으로 남음).

const units = [
  { code: "EA", name: "개" },
  { code: "KG", name: "킬로그램" },
];
const columns = itemSheetColumns(units);

function renderItems(action = vi.fn<(s: SheetResult | null, f: FormData) => Promise<SheetResult>>()) {
  render(<SheetGrid columns={columns} action={action} what="품목" listHref="/master/items" />);
  return action;
}
const cell = (row: number, label: string) => screen.getByLabelText(`${row}행 ${label}`) as HTMLInputElement;
const paste = (el: HTMLElement, text: string) => fireEvent.paste(el, { clipboardData: { getData: () => text } });
const dataRows = () => screen.getAllByRole("row").filter((r) => within(r).queryAllByRole("textbox").length > 0);
const save = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
  });
};

afterEach(() => vi.restoreAllMocks());

describe("시트", () => {
  it("칸은 한 건 등록 화면의 순서이고(PR H 의 분류 · 비고, PR J 의 사용 여부는 지금 칸의 뒤), 처음에 다섯 줄이다", () => {
    renderItems();
    const heads = screen.getAllByRole("columnheader").map((th) => th.textContent);
    // 코드는 붙여넣는 칸이 아니라 줄 번호 옆에 보이기만 한다(PR J).
    expect(heads[1]).toBe("코드");
    expect(heads.slice(2, -1)).toEqual([
      "유형",
      "품명",
      "규격",
      "단위",
      "조달구분",
      "수입검사",
      "출하검사",
      "리드타임(일)",
      "안전재고",
      "최소 발주 · 생산량",
      "발주 · 생산 배수",
      "대분류",
      "중분류",
      "소분류",
      "비고",
      "사용 여부",
    ]);
    expect(dataRows()).toHaveLength(5);
  });

  it("셀마다 색으로 필수 입력 · 선택 입력 · 수정 불가를 가르고, 받는 값은 열 이름에 올리면 보인다(저자 판정 2026-11-05)", () => {
    renderItems();
    for (const name of ["유형", "품명", "단위"]) {
      expect(cell(1, name)).toHaveAttribute("data-kind", "required");
      expect(cell(1, name)).toHaveAttribute("aria-required", "true");
      expect(cell(1, name)).toHaveClass("bg-safety/25");
    }
    for (const name of ["규격", "조달구분", "비고", "사용 여부"]) {
      expect(cell(2, name)).toHaveAttribute("data-kind", "optional");
      expect(cell(2, name)).not.toHaveAttribute("aria-required");
    }
    // 코드 셀은 늘 수정 불가의 색이다. 열 머리에는 색이 없다.
    expect(screen.getByTestId("code-0")).toHaveClass("bg-rule");
    expect(screen.getByRole("columnheader", { name: "단위" })).not.toHaveClass("bg-safety/25");
    expect(screen.getByRole("columnheader", { name: "단위" })).toHaveAttribute(
      "title",
      "개(EA) · 킬로그램(KG) — 이름이나 코드, 꼭 넣습니다",
    );
    // 열마다 받는 값을 늘어놓은 긴 목록은 없다.
    expect(screen.queryByText("칸 순서와 넣는 값")).toBeNull();
    expect(
      within(screen.getByRole("list", { name: "셀의 색" }))
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["필수 입력", "선택 입력", "수정 불가"]);
  });

  it("거래처는 거래처명 · 매입처 · 매출처 셀이 필수 입력이다", () => {
    render(<SheetGrid columns={partnerSheetColumns([])} action={vi.fn()} what="거래처" listHref="/master/partners" />);
    const required = partnerSheetColumns([])
      .map((c) => c.label)
      .filter((label) => cell(1, label).dataset.kind === "required");
    expect(required).toEqual(["거래처명", "매입처", "매출처"]);
  });

  it("엑셀에서 복사한 여러 줄을 붙여넣으면 고른 칸부터 채워지고, 모자란 줄은 더해진다", () => {
    renderItems();
    const rows = Array.from({ length: 7 }, (_, i) => `원자재\t품목 ${i + 1}\t\tEA`).join("\r\n");
    const notPrevented = paste(cell(1, "유형"), `${rows}\r\n`);
    expect(notPrevented).toBe(false);
    expect(dataRows()).toHaveLength(7);
    expect(cell(1, "유형")).toHaveValue("원자재");
    expect(cell(7, "품명")).toHaveValue("품목 7");
    expect(cell(7, "단위")).toHaveValue("EA");
  });

  it("첫 줄이 머리글이면 건너뛰고 알린다", () => {
    renderItems();
    paste(cell(1, "유형"), "유형\t품명\n원자재\t솔더 볼");
    expect(cell(1, "유형")).toHaveValue("원자재");
    expect(cell(1, "품명")).toHaveValue("솔더 볼");
    expect(screen.getByText("첫 행은 머리글이라 건너뛰었습니다.")).toBeInTheDocument();
  });

  it("100줄까지만 받고 남은 줄 수를 알린다", () => {
    renderItems();
    paste(cell(1, "유형"), Array.from({ length: 103 }, (_, i) => `원자재\t${i}`).join("\n"));
    expect(dataRows()).toHaveLength(100);
    expect(screen.getByText(/남은 3행은 저장한 뒤 나눠 붙여넣으세요/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "행 추가" })).toBeDisabled();
  });

  it("한 칸짜리 글은 가로채지 않는다 — 브라우저가 그 칸에 붙인다", () => {
    renderItems();
    expect(paste(cell(1, "품명"), "솔더 볼")).toBe(true);
  });

  it("줄을 더하고 지운다", () => {
    renderItems();
    fireEvent.click(screen.getByRole("button", { name: "행 추가" }));
    expect(dataRows()).toHaveLength(10);
    fireEvent.change(cell(2, "품명"), { target: { value: "둘째" } });
    fireEvent.click(screen.getByRole("button", { name: "1행 지우기" }));
    expect(dataRows()).toHaveLength(9);
    expect(cell(1, "품명")).toHaveValue("둘째");
  });

  it("머리글 줄 복사 — 칸 이름을 탭으로 이어 클립보드에 넣는다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderItems();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "머리글 행 복사" }));
    });
    expect(writeText).toHaveBeenCalledWith(columns.map((c) => c.label).join("\t"));
    expect(screen.getByText(/머리글 행을 복사했습니다/)).toBeInTheDocument();
  });

  it("클립보드를 쓸 수 없으면 그렇게 알린다", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("no")) },
      configurable: true,
    });
    renderItems();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "머리글 행 복사" }));
    });
    expect(screen.getByText(/복사하지 못했습니다/)).toBeInTheDocument();
  });
});

describe("저장", () => {
  it("시트의 줄을 칸 key → 글자로 보낸다", async () => {
    const action = renderItems();
    action.mockResolvedValue({ saved: [], rejected: [] });
    fireEvent.change(cell(1, "품명"), { target: { value: "솔더 볼" } });
    await save();
    const sent = JSON.parse(action.mock.calls[0][1].get("rows") as string);
    expect(sent).toHaveLength(5);
    expect(sent[0]).toMatchObject({ itemType: "", name: "솔더 볼", unit: "" });
  });

  it("맞는 줄은 저장 알림에 코드(수정 화면 링크)로 보이고, 틀린 줄만 빨간 칸과 까닭으로 남는다", async () => {
    const action = renderItems();
    action.mockResolvedValue({
      saved: [
        { code: "RM-0007", name: "솔더 볼" },
        { code: "RM-0008", name: "와이어" },
      ],
      rejected: [
        {
          row: { itemType: "원자재", name: "몰딩", unit: "BOX" },
          errors: { unit: "공통코드의 단위(UNIT)에 없는 단위입니다" },
        },
      ],
    });
    await save();
    await waitFor(() => expect(screen.getByText("품목 2행을 등록했습니다.")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "RM-0007" })).toHaveAttribute("href", "/master/items/RM-0007");

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("1행은 저장하지 않았습니다");
    expect(within(alert).getByRole("link", { name: "1행 · 단위" })).toHaveAttribute("href", "#c-0-unit");
    expect(cell(1, "단위")).toHaveValue("BOX");
    expect(cell(1, "단위")).toHaveAttribute("aria-invalid", "true");
    expect(cell(1, "품명")).not.toHaveAttribute("aria-invalid");
    expect(cell(1, "단위")).toHaveAccessibleDescription("단위 — 공통코드의 단위(UNIT)에 없는 단위입니다");
    // 틀린 줄 하나 + 빈 줄 넷.
    expect(dataRows()).toHaveLength(5);
  });

  it("빨간 칸을 고치면 그 칸의 표시가 지워진다", async () => {
    const action = renderItems();
    action.mockResolvedValue({
      saved: [],
      rejected: [{ row: { name: "", unit: "BOX" }, errors: { name: "품명을 넣으세요", unit: "없는 단위" } }],
    });
    await save();
    await waitFor(() => expect(cell(1, "단위")).toHaveAttribute("aria-invalid", "true"));
    fireEvent.change(cell(1, "단위"), { target: { value: "EA" } });
    expect(cell(1, "단위")).not.toHaveAttribute("aria-invalid");
    expect(cell(1, "품명")).toHaveAttribute("aria-invalid", "true");
  });

  it("줄 전체의 거절(등록 상한)은 그 줄의 모든 칸을 빨갛게 한다", async () => {
    const action = renderItems();
    action.mockResolvedValue({
      saved: [],
      rejected: [
        { row: { itemType: "RM", name: "가", unit: "EA" }, errors: { _row: "품목은 2,000개까지 등록됩니다" } },
      ],
    });
    await save();
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("1행 · 행 전체 — 품목은 2,000개까지 등록됩니다"),
    );
    expect(cell(1, "유형")).toHaveAttribute("aria-invalid", "true");
    expect(cell(1, "발주 · 생산 배수")).toHaveAttribute("aria-invalid", "true");
  });

  it("아무것도 저장하지 못하면 까닭을 보이고 시트를 그대로 둔다", async () => {
    const action = renderItems();
    action.mockResolvedValue({ saved: [], rejected: [], formError: "저장하지 못했습니다 — 잠시 뒤 다시 저장하세요" });
    fireEvent.change(cell(3, "품명"), { target: { value: "남아야 함" } });
    await save();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("잠시 뒤 다시 저장하세요"));
    expect(cell(3, "품명")).toHaveValue("남아야 함");
  });

  it("넣은 줄이 없으면 그렇게 알린다", async () => {
    const action = renderItems();
    action.mockResolvedValue({ saved: [], rejected: [] });
    await save();
    await waitFor(() => expect(screen.getByText(/넣은 행이 없습니다/)).toBeInTheDocument());
  });
});

describe("거래처 시트", () => {
  it("매입처 · 매출처의 거절은 「구분」 한 자리로 — 두 칸이 빨갛다. 같은 사업자번호는 저장 알림에 경고한다", async () => {
    const action = vi.fn().mockResolvedValue({
      saved: [
        {
          code: "BP-0008",
          name: "(가상) 가람 2공장",
          sharedBizNo: [{ code: "BP-0001", name: "(가상) 가람리드프레임", active: true }],
        },
      ],
      rejected: [{ row: { name: "(가상) 둘" }, errors: { role: "매입처 · 매출처 가운데 하나 이상을 고르세요" } }],
    } satisfies SheetResult);
    render(
      <SheetGrid
        columns={partnerSheetColumns([{ code: "KR", name: "한국" }])}
        errorLabels={PARTNER_SHEET_ERROR_LABELS}
        action={action}
        what="거래처"
        listHref="/master/partners"
      />,
    );
    await save();
    await waitFor(() => expect(screen.getByText(/같은 사업자번호를 쓰는 거래처가 있습니다/)).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "BP-0001" })).toHaveAttribute("href", "/master/partners/BP-0001");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "1행 · 구분(매입처 · 매출처) — 매입처 · 매출처 가운데 하나 이상을 고르세요",
    );
    expect(within(screen.getByRole("alert")).getByRole("link")).toHaveAttribute("href", "#c-0-isSupplier");
    expect(cell(1, "매입처")).toHaveAttribute("aria-invalid", "true");
    expect(cell(1, "매출처")).toHaveAttribute("aria-invalid", "true");
    expect(cell(1, "거래처명")).not.toHaveAttribute("aria-invalid");
  });
});

describe("리뷰 1회차", () => {
  it("짧은 범위를 붙여넣으면 붙여넣은 줄의 빨간 표시만 지운다 — 아래의 틀린 줄은 그대로", async () => {
    const action = renderItems();
    const bad = { row: { name: "", unit: "BOX" }, errors: { unit: "없는 단위" } };
    action.mockResolvedValue({ saved: [], rejected: [bad, bad, bad, bad, bad] });
    await save();
    await waitFor(() => expect(cell(5, "단위")).toHaveAttribute("aria-invalid", "true"));
    paste(cell(1, "단위"), "EA\nEA");
    expect(cell(1, "단위")).not.toHaveAttribute("aria-invalid");
    expect(cell(2, "단위")).not.toHaveAttribute("aria-invalid");
    expect(cell(3, "단위")).toHaveAttribute("aria-invalid", "true");
    expect(cell(5, "단위")).toHaveAttribute("aria-invalid", "true");
  });

  it("따옴표로 감싼 한 칸짜리 글(엑셀이 따옴표가 든 칸을 복사한 꼴)은 풀어서 붙인다", () => {
    renderItems();
    expect(paste(cell(1, "규격"), '"12"" 웨이퍼"\r\n')).toBe(false);
    expect(cell(1, "규격")).toHaveValue('12" 웨이퍼');
  });

  it("저장하는 동안에는 시트를 고칠 수 없다 — 결과가 고친 것을 덮지 않게", async () => {
    let finish: (r: SheetResult) => void = () => {};
    const action = renderItems();
    action.mockImplementation(() => new Promise<SheetResult>((resolve) => (finish = resolve)));
    fireEvent.change(cell(1, "품명"), { target: { value: "솔더 볼" } });
    await save();
    expect(cell(1, "품명")).toBeDisabled();
    expect(screen.getByRole("button", { name: "행 추가" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "모두 비우기" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "1행 지우기" })).toBeDisabled();
    await act(async () => finish({ saved: [{ code: "RM-0007", name: "솔더 볼" }], rejected: [] }));
    await waitFor(() => expect(cell(1, "품명")).toBeEnabled());
  });
});

describe("리뷰 2회차 — 빨간 표시는 값이 바뀐 칸만 지운다", () => {
  it("붙여넣은 줄이라도 덮지 않은 칸의 표시는 남는다", async () => {
    const action = renderItems();
    const bad = { row: { name: "", unit: "BOX" }, errors: { name: "품명을 넣으세요", unit: "없는 단위" } };
    action.mockResolvedValue({ saved: [], rejected: [bad, bad] });
    await save();
    await waitFor(() => expect(cell(2, "단위")).toHaveAttribute("aria-invalid", "true"));
    paste(cell(1, "단위"), "EA\nEA");
    expect(cell(1, "단위")).not.toHaveAttribute("aria-invalid");
    expect(cell(2, "단위")).not.toHaveAttribute("aria-invalid");
    expect(cell(1, "품명")).toHaveAttribute("aria-invalid", "true");
    expect(cell(2, "품명")).toHaveAttribute("aria-invalid", "true");
  });
});

describe("불러와 고치기(PR J)", () => {
  type Load = (form: FormData) => Promise<SheetLoad>;
  const loadedRow = (code: string, name: string): SheetRow => ({
    ...blankRow(columns),
    [CODE_KEY]: code,
    [VERSION_KEY]: "1730000000000000",
    itemType: "RM",
    name,
    unit: "EA",
    active: "Y",
  });

  function renderWithLoad(load: Load, action = vi.fn<(s: SheetResult | null, f: FormData) => Promise<SheetResult>>()) {
    render(
      <SheetGrid
        columns={columns}
        action={action}
        what="품목"
        listHref="/master/items"
        load={{ action: load, filters: <input name="q" aria-label="찾을 글자" /> }}
      />,
    );
    return action;
  }
  const loadNow = async () => {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "불러오기" }));
    });
  };
  const sentRows = (action: ReturnType<typeof vi.fn>) =>
    JSON.parse((action.mock.calls[0][1] as FormData).get("rows") as string) as SheetRow[];

  it("찾기 칸의 값으로 불러와 넣은 줄 뒤에 붙이고, 코드와 「새 줄」을 보인다", async () => {
    const load = vi.fn<Load>().mockResolvedValue({
      rows: [loadedRow("RM-0001", "웨이퍼"), loadedRow("RM-0002", "리드프레임")],
      total: 2,
      notices: [],
    });
    renderWithLoad(load);
    fireEvent.change(cell(1, "품명"), { target: { value: "새 품목" } });
    fireEvent.change(screen.getByLabelText("찾을 글자"), { target: { value: "RM" } });
    await loadNow();
    expect((load.mock.calls[0][0] as FormData).get("q")).toBe("RM");
    expect(cell(1, "품명")).toHaveValue("새 품목");
    expect(cell(2, "품명")).toHaveValue("웨이퍼");
    expect(cell(3, "품명")).toHaveValue("리드프레임");
    expect(screen.getByTestId("code-0")).toHaveTextContent("새 행");
    expect(screen.getByTestId("code-1")).toHaveTextContent("RM-0001");
    expect(screen.getByText("찾은 2건 가운데 2건을 불러왔습니다.")).toBeInTheDocument();
    // 다섯 줄을 채울 만큼 빈 줄.
    expect(dataRows()).toHaveLength(5);
  });

  it("불러온 줄의 유형은 고칠 수 없고, 고치면 「고침」 표시가 붙는다", async () => {
    renderWithLoad(vi.fn<Load>().mockResolvedValue({ rows: [loadedRow("RM-0001", "웨이퍼")], total: 1, notices: [] }));
    await loadNow();
    expect(cell(1, "유형")).toHaveAttribute("readonly");
    expect(cell(1, "유형")).toHaveAttribute("data-kind", "fixed");
    expect(cell(2, "유형")).toHaveAttribute("data-kind", "required");
    expect(cell(1, "품명")).not.toHaveAttribute("readonly");
    expect(cell(2, "유형")).not.toHaveAttribute("readonly");
    expect(screen.getByTestId("code-0")).not.toHaveTextContent("고침");
    fireEvent.change(cell(1, "품명"), { target: { value: "웨이퍼 8인치" } });
    expect(screen.getByTestId("code-0")).toHaveTextContent("RM-0001고침");
  });

  it("이미 시트에 있는 코드는 다시 붙이지 않고, 100줄을 넘는 것은 불러오지 않았다고 알린다", async () => {
    const many = Array.from({ length: 100 }, (_, i) => loadedRow(`RM-${String(i + 1).padStart(4, "0")}`, `품목 ${i}`));
    const load = vi
      .fn<Load>()
      .mockResolvedValueOnce({ rows: many.slice(0, 2), total: 2, notices: [] })
      .mockResolvedValueOnce({ rows: many, total: 230, notices: ["없는 유형이라 거르지 않았습니다"] });
    renderWithLoad(load);
    await loadNow();
    await loadNow();
    expect(
      screen.getByText(
        "없는 유형이라 거르지 않았습니다. 찾은 230건 가운데 98건을 불러왔습니다. 2건은 이미 시트에 있습니다. " +
          "시트는 100행까지라 130건은 불러오지 않았습니다 — 찾기를 좁히거나, 저장한 뒤 다시 불러오세요.",
      ),
    ).toBeInTheDocument();
    expect(dataRows()).toHaveLength(100);
  });

  it("서버에 닿지 못하면 말없이 끝나지 않고 다시 불러오라고 알린다 — 시트는 그대로", async () => {
    renderWithLoad(vi.fn<Load>().mockRejectedValue(new Error("network")));
    fireEvent.change(cell(1, "품명"), { target: { value: "새 품목" } });
    await loadNow();
    expect(screen.getByText("불러오지 못했습니다 — 화면을 새로 고친 뒤 다시 불러오세요")).toBeInTheDocument();
    expect(cell(1, "품명")).toHaveValue("새 품목");
    expect(screen.getByRole("button", { name: "불러오기" })).toBeEnabled();
  });

  it("찾은 것이 없으면 그렇게 알린다", async () => {
    renderWithLoad(vi.fn<Load>().mockResolvedValue({ rows: [], total: 0, notices: [] }));
    await loadNow();
    expect(screen.getByText("찾은 품목이 없습니다.")).toBeInTheDocument();
  });

  it("저장은 새 줄과 달라진 불러온 줄만 보내고, 바뀌지 않은 줄은 저장한 뒤에도 시트에 남는다", async () => {
    const action = renderWithLoad(
      vi.fn<Load>().mockResolvedValue({
        rows: [loadedRow("RM-0001", "웨이퍼"), loadedRow("RM-0002", "리드프레임"), loadedRow("RM-0003", "금 와이어")],
        total: 3,
        notices: [],
      }),
    );
    await loadNow();
    fireEvent.change(cell(1, "안전재고"), { target: { value: "200" } });
    fireEvent.change(cell(3, "비고"), { target: { value: "고침" } });
    fireEvent.change(cell(4, "품명"), { target: { value: "솔더 볼" } });
    const stale = { ...loadedRow("RM-0003", "금 와이어"), note: "고침" };
    action.mockResolvedValue({
      saved: [
        { code: "RM-0001", name: "웨이퍼", updated: true },
        { code: "RM-0007", name: "솔더 볼" },
      ],
      rejected: [{ row: stale, errors: { [ROW_ERROR]: "불러온 뒤 다른 사람이 먼저 고쳤습니다" } }],
    });
    await save();
    const sent = sentRows(action);
    // 바뀌지 않은 RM-0002 는 보내지 않는다(빈 줄은 서버가 건너뛴다).
    expect(sent.map((r) => r[CODE_KEY] ?? r.name)).toEqual(["RM-0001", "RM-0003", "솔더 볼", ""]);
    expect(screen.getByText("품목 1행을 등록하고 1행을 고쳐 저장했습니다.")).toBeInTheDocument();
    // 남은 줄 — 거절된 RM-0003(고친 채로, 「고침」 표시), 보내지 않은 RM-0002.
    expect(screen.getByTestId("code-0")).toHaveTextContent("RM-0003고침");
    expect(screen.getByTestId("code-1")).toHaveTextContent("RM-0002");
    expect(screen.getByTestId("code-1")).not.toHaveTextContent("고침");
    expect(cell(2, "품명")).toHaveValue("리드프레임");
  });
});

describe("저장 알림의 말(PR J)", () => {
  it("고친 줄만이면 「고쳐 저장했습니다」, 줄마다 (고침)", async () => {
    const action = renderItems();
    action.mockResolvedValue({ saved: [{ code: "RM-0001", name: "웨이퍼", updated: true }], rejected: [] });
    await save();
    await waitFor(() => expect(screen.getByText("품목 1행을 고쳐 저장했습니다.")).toBeInTheDocument());
    expect(screen.getByText("(고침)")).toBeInTheDocument();
  });
});
