import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SheetGrid } from "../sheet-grid";
import type { SheetResult } from "@/lib/sheet";
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
const cell = (row: number, label: string) => screen.getByLabelText(`${row}줄 ${label}`) as HTMLInputElement;
const paste = (el: HTMLElement, text: string) => fireEvent.paste(el, { clipboardData: { getData: () => text } });
const dataRows = () => screen.getAllByRole("row").filter((r) => within(r).queryAllByRole("textbox").length > 0);
const save = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
  });
};

afterEach(() => vi.restoreAllMocks());

describe("시트", () => {
  it("칸은 한 건 등록 화면의 순서이고, 처음에 다섯 줄이다", () => {
    renderItems();
    const heads = screen.getAllByRole("columnheader").map((th) => th.textContent);
    expect(heads.slice(1, -1)).toEqual([
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
    ]);
    expect(dataRows()).toHaveLength(5);
  });

  it("칸 순서 안내에 고르는 값(단위는 공통코드의 값)과 빈 칸의 기본값이 보인다", () => {
    renderItems();
    const guide = screen.getByText("칸 순서와 넣는 값").closest("details")!;
    expect(guide).toHaveTextContent("단위 — 개(EA) · 킬로그램(KG) — 이름이나 코드, 꼭 넣습니다");
    expect(guide).toHaveTextContent("조달구분 — 구매(BUY) · 생산(MAKE) — 비우면 유형의 기본값");
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
    expect(screen.getByText("첫 줄은 머리글이라 건너뛰었습니다.")).toBeInTheDocument();
  });

  it("100줄까지만 받고 남은 줄 수를 알린다", () => {
    renderItems();
    paste(cell(1, "유형"), Array.from({ length: 103 }, (_, i) => `원자재\t${i}`).join("\n"));
    expect(dataRows()).toHaveLength(100);
    expect(screen.getByText(/남은 3줄은 저장한 뒤 나눠 붙여넣으세요/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "줄 더하기" })).toBeDisabled();
  });

  it("한 칸짜리 글은 가로채지 않는다 — 브라우저가 그 칸에 붙인다", () => {
    renderItems();
    expect(paste(cell(1, "품명"), "솔더 볼")).toBe(true);
  });

  it("줄을 더하고 지운다", () => {
    renderItems();
    fireEvent.click(screen.getByRole("button", { name: "줄 더하기" }));
    expect(dataRows()).toHaveLength(10);
    fireEvent.change(cell(2, "품명"), { target: { value: "둘째" } });
    fireEvent.click(screen.getByRole("button", { name: "1줄 지우기" }));
    expect(dataRows()).toHaveLength(9);
    expect(cell(1, "품명")).toHaveValue("둘째");
  });

  it("머리글 줄 복사 — 칸 이름을 탭으로 이어 클립보드에 넣는다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderItems();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "머리글 줄 복사" }));
    });
    expect(writeText).toHaveBeenCalledWith(columns.map((c) => c.label).join("\t"));
    expect(screen.getByText(/머리글 줄을 복사했습니다/)).toBeInTheDocument();
  });

  it("클립보드를 쓸 수 없으면 그렇게 알린다", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("no")) },
      configurable: true,
    });
    renderItems();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "머리글 줄 복사" }));
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
    await waitFor(() => expect(screen.getByText("품목 2줄을 저장했습니다.")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "RM-0007" })).toHaveAttribute("href", "/master/items/RM-0007");

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("1줄은 저장하지 않았습니다");
    expect(within(alert).getByRole("link", { name: "1줄 · 단위" })).toHaveAttribute("href", "#c-0-unit");
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
      expect(screen.getByRole("alert")).toHaveTextContent("1줄 · 줄 — 품목은 2,000개까지 등록됩니다"),
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
    await waitFor(() => expect(screen.getByText(/넣은 줄이 없습니다/)).toBeInTheDocument());
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
      "1줄 · 구분(매입처 · 매출처) — 매입처 · 매출처 가운데 하나 이상을 고르세요",
    );
    expect(within(screen.getByRole("alert")).getByRole("link")).toHaveAttribute("href", "#c-0-isSupplier");
    expect(cell(1, "매입처")).toHaveAttribute("aria-invalid", "true");
    expect(cell(1, "매출처")).toHaveAttribute("aria-invalid", "true");
    expect(cell(1, "거래처명")).not.toHaveAttribute("aria-invalid");
  });
});
