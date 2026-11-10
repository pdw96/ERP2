import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfirmPreview, CountItemOption, CountSheet, CountWarehouse } from "@/db/stock-counts";
import { CountEntry } from "../count-entry";

// 재고 실사의 입력(조각 「재고 수불」 PR E) — 줄마다 장부 · 실물 · 차이, 「확정…」은 저장한 뒤 확정 화면을 연다.
// 리뷰 1회차: 저장한 더한 줄을 다시 열면 그 줄의 지금 장부로 차이를 보이고, 창고를 바꾸면(주소가 바뀌어 다시 그림) 앞 창고의 확정 화면이 남지 않는다.

const h = vi.hoisted(() => ({ save: vi.fn(), push: vi.fn() }));
vi.mock("../actions", () => ({
  saveCountAction: h.save,
  confirmCountAction: vi.fn(),
  cancelCountAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push }) }));

const warehouses: CountWarehouse[] = [
  { code: "WH-01", name: "자재창고", isDefect: false },
  { code: "WH-03", name: "제품창고", isDefect: false },
];
const items: CountItemOption[] = [
  { code: "RM-0003", name: "금 와이어", unit: "M", decimals: 3, itemType: "RM", lotManaged: true },
];

const sheetOf = (wh: CountWarehouse, over: Partial<CountSheet> = {}): CountSheet => ({
  warehouse: wh,
  code: "PI-20261109-001",
  countDate: "2026-11-09",
  version: "1",
  baseline: 10,
  lines: [
    {
      itemCode: "RM-0003",
      itemName: "금 와이어",
      unit: "M",
      decimals: 3,
      itemType: "RM",
      lotManaged: true,
      lot: "FOUND-1",
      status: "AVAILABLE",
      added: true,
      book: "3",
      counted: "5",
    },
  ],
  ...over,
});

const preview = (wh: CountWarehouse): ConfirmPreview => ({
  code: "PI-20261109-001",
  version: "2",
  warehouse: wh,
  countDate: "2026-11-09",
  diffs: [],
  blanks: [],
  movesAfter: [],
  outside: [],
});

beforeEach(() => {
  h.save.mockReset();
  h.push.mockReset();
});

describe("CountEntry", () => {
  it("저장한 더한 줄은 그 줄의 지금 장부와 견준 차이를 보인다 — 품목 · LOT 를 바꾸면 장부 0", () => {
    render(
      <CountEntry options={{ warehouses, items }} picked="WH-01" sheet={sheetOf(warehouses[0])} openError={null} />,
    );
    const row = screen.getByLabelText("줄 1 실물 수량").closest("tr")!;
    expect(row).toHaveTextContent("3 M");
    expect(row).toHaveTextContent("+2");
    fireEvent.change(screen.getByLabelText("줄 1 LOT번호"), { target: { value: "FOUND-2" } });
    expect(row).toHaveTextContent("0 M");
    expect(row).toHaveTextContent("+5");
  });

  it("창고를 바꿔 다시 그리면 앞 창고의 확정 화면이 남지 않는다", async () => {
    h.save.mockResolvedValue({ ok: true, code: "PI-20261109-001", version: "2", preview: preview(warehouses[0]) });
    const { rerender } = render(
      <CountEntry
        key="WH-01"
        options={{ warehouses, items }}
        picked="WH-01"
        sheet={sheetOf(warehouses[0])}
        openError={null}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "확정…" }));
    });
    await waitFor(() => expect(screen.getByRole("heading", { name: /확정 — WH-01/ })).toBeInTheDocument());
    // 페이지가 고른 창고를 key 로 넘긴다 — 창고를 바꾸면 입력이 새로 그려진다(src/app/inventory/counts/page.tsx).
    rerender(
      <CountEntry
        key="WH-03"
        options={{ warehouses, items }}
        picked="WH-03"
        sheet={sheetOf(warehouses[1], { code: null, version: null })}
        openError={null}
      />,
    );
    expect(screen.queryByRole("heading", { name: /확정 —/ })).toBeNull();
    expect(screen.getByText(/새 실사/)).toBeInTheDocument();
  });
});
