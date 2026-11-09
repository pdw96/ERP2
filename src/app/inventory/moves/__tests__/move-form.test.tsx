import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MoveFormOptions, WarehouseStockRow } from "@/db/stock";
import type { MoveType } from "@/lib/master-codes";
import { MoveEntry } from "../move-entry";

// 등록 메뉴의 입력 — 메뉴가 수불구분을 정해 그 구분의 칸만 보이고, 품목을 고르면 기본 창고가 채워진다(성공 기준 2, 설계 「2026-11-09 — PR C 를
// 열기 전에 정한 것」). 저장되면 같은 화면에 남아 전표번호를 보이고 입력을 비운다(ADR 0020, 설계 「2026-11-09 — PR F 를 열기 전에 정한 것」).
// 기타출고 · 재고이동 · 재고조정은 머리에서 창고를 고르고, 그 창고의 현재고에서 골라 줄로 넣는다(설계 「2026-11-09 — PR F 검토 중 정한 것」).

const h = vi.hoisted(() => ({ onHand: vi.fn(), save: vi.fn(), stock: vi.fn() }));
vi.mock("../actions", () => ({ saveMoveAction: h.save, onHandAction: h.onHand, warehouseStockAction: h.stock }));

const stockRow = (over: Partial<WarehouseStockRow>): WarehouseStockRow => ({
  itemCode: "RM-0003",
  itemName: "금 와이어",
  unit: "M",
  lot: "NW-25-0701",
  status: "AVAILABLE",
  qty: "2,000",
  pickable: true,
  ...over,
});

const options: MoveFormOptions = {
  items: [
    {
      code: "RM-0003",
      name: "금 와이어",
      unit: "M",
      itemType: "RM",
      lotManaged: true,
      defaultIn: "WH-01",
      defaultOut: "WH-02",
    },
    {
      code: "FG-0001",
      name: "전원 관리 IC",
      unit: "EA",
      itemType: "FG",
      lotManaged: true,
      defaultIn: "WH-03",
      defaultOut: "WH-03",
    },
    {
      code: "SM-0002",
      name: "방습백",
      unit: "EA",
      itemType: "SM",
      lotManaged: false,
      defaultIn: "WH-01",
      defaultOut: "WH-02",
    },
  ],
  warehouses: [
    { code: "WH-01", name: "자재창고", isDefect: false },
    { code: "WH-02", name: "생산현장", isDefect: false },
    { code: "WH-03", name: "제품창고", isDefect: false },
    { code: "WH-04", name: "불량창고", isDefect: true },
  ],
  units: [
    { code: "M", name: "미터", baseUnit: "M", decimals: 3 },
    { code: "MM", name: "밀리미터", baseUnit: "M", decimals: 0 },
    { code: "EA", name: "개", baseUnit: "EA", decimals: 0 },
  ],
  reasons: [{ code: "LOSS", name: "분실" }],
};
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const pick = (n: number, text: string) => fireEvent.change(field(`줄 ${n} 품목`), { target: { value: text } });
const note = () => screen.getByLabelText(/^비고/) as HTMLInputElement;
const open = (moveType: MoveType) => render(<MoveEntry options={options} today="2026-11-09" moveType={moveType} />);
const submit = (container: HTMLElement) => fireEvent.submit(container.querySelector("form")!);
const sentType = (container: HTMLElement) =>
  (container.querySelector('input[name="moveType"]') as HTMLInputElement).value;

describe("등록 메뉴의 입력", () => {
  beforeEach(() => {
    h.onHand.mockResolvedValue([]);
    h.save.mockReset();
  });

  it("기타입고 — 수불구분을 고르는 칸이 없고 메뉴가 IN 을 보낸다. 품목을 고르면 기본 입고 창고가 채워지고, 단위는 기준이 같은 것만 고른다", () => {
    const { container } = open("IN");
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByText("수불구분")).toBeNull();
    expect(sentType(container)).toBe("IN");
    pick(1, "RM-0003 금 와이어");
    expect(field("줄 1 창고")).toHaveValue("WH-01");
    expect(field("줄 1 LOT번호")).toHaveAttribute("placeholder", "거래처 LOT");
    const units = [...(field("줄 1 단위") as unknown as HTMLSelectElement).options].map((o) => o.value);
    expect(units).toEqual(["", "MM"]);
    expect(screen.queryByLabelText("줄 1 입고창고")).toBeNull();
    expect(screen.queryByLabelText("조정사유")).toBeNull();
  });

  it("만드는 품목의 LOT 는 비우면 번호 규칙으로, LOT 를 끈 품목은 LOT 칸이 없다", () => {
    open("IN");
    pick(1, "FG-0001 전원 관리 IC");
    expect(field("줄 1 LOT번호")).toHaveAttribute("placeholder", "비우면 번호 규칙으로");
    pick(1, "SM-0002 방습백");
    expect(screen.queryByLabelText("줄 1 LOT번호")).toBeNull();
    expect(screen.getByText("LOT 관리 안 함")).toBeInTheDocument();
  });

  it("기타출고 — 머리에서 창고를 고르면 그 창고의 현재고가 보이고, 골라 「줄로 넣기」하면 품목 · LOT 가 채워진 줄이 생긴다", async () => {
    h.onHand.mockResolvedValue([{ lot: "NW-25-0701", qty: "2,000" }]);
    h.stock.mockResolvedValue([
      stockRow({}),
      stockRow({ itemCode: "SM-0002", itemName: "방습백", unit: "EA", lot: "", qty: "300" }),
      stockRow({ lot: "NW-25-0702", status: "QC", qty: "500", pickable: false }),
    ]);
    const { container } = open("OUT");
    expect(sentType(container)).toBe("OUT");
    expect(screen.getByText(/창고를 고르면 그 창고의 현재고가 보이고/)).toBeInTheDocument();
    // 줄에는 창고 칸이 없다 — 머리의 창고다. 불량창고는 내보내지 못해 고르는 목록에 없다.
    expect(screen.queryByLabelText("줄 1 창고")).toBeNull();
    const head = screen.getByLabelText(/^창고/) as HTMLSelectElement;
    expect([...head.options].map((o) => o.value)).toEqual(["", "WH-01", "WH-02", "WH-03"]);
    fireEvent.change(head, { target: { value: "WH-02" } });

    expect(await screen.findByRole("heading", { name: "WH-02 생산현장 현재고" })).toBeInTheDocument();
    expect(h.stock).toHaveBeenCalledWith("WH-02");
    expect(await screen.findByRole("checkbox", { name: "RM-0003 NW-25-0702 고르기" })).toBeDisabled();
    expect(screen.getByText("검사대기")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "RM-0003 NW-25-0701 고르기" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "SM-0002 LOT 없음 고르기" }));
    fireEvent.click(screen.getByRole("button", { name: "줄로 넣기 (2)" }));

    expect(screen.getByText("2줄")).toBeInTheDocument();
    expect(field("줄 1 품목")).toHaveValue("RM-0003 금 와이어");
    expect(field("줄 2 품목")).toHaveValue("SM-0002 방습백");
    expect(await screen.findByRole("option", { name: "NW-25-0701 · 가용 2,000 M" })).toBeInTheDocument();
    expect(field("줄 1 LOT번호")).toHaveValue("NW-25-0701");
    expect(h.onHand).toHaveBeenCalledWith("RM-0003", "WH-02");
    const hidden = (n: string) => (container.querySelector(`[name="${n}"]`) as HTMLInputElement).value;
    expect([hidden("lines.0.warehouse"), hidden("lines.1.warehouse"), hidden("lines.0.toWarehouse")]).toEqual([
      "WH-02",
      "WH-02",
      "",
    ]);
    // 이미 줄에 넣은 것은 「줄에 있음」으로 다시 고르지 못한다.
    expect(screen.getByRole("checkbox", { name: "RM-0003 NW-25-0701 고르기" })).toBeDisabled();
    expect(screen.getAllByText("줄에 있음")).toHaveLength(2);
  });

  it("재고이동 — 머리에 출고창고 → 입고창고, 모든 줄이 그 두 창고로 간다. 입고창고는 출고창고를 빼고 불량창고(격리)를 받는다", async () => {
    h.stock.mockResolvedValue([stockRow({ qty: "6,000" })]);
    const { container } = open("XFER");
    expect(sentType(container)).toBe("XFER");
    const from = screen.getByLabelText(/^출고창고/) as HTMLSelectElement;
    expect([...from.options].map((o) => o.value)).toEqual(["", "WH-01", "WH-02", "WH-03"]);
    fireEvent.change(from, { target: { value: "WH-01" } });
    const to = screen.getByLabelText(/^입고창고/) as HTMLSelectElement;
    expect([...to.options].map((o) => o.value)).toEqual(["", "WH-02", "WH-03", "WH-04"]);
    fireEvent.change(to, { target: { value: "WH-04" } });
    expect(screen.queryByLabelText("줄 1 출고창고")).toBeNull();
    expect(screen.queryByLabelText("줄 1 입고창고")).toBeNull();

    fireEvent.click(await screen.findByRole("checkbox", { name: "RM-0003 NW-25-0701 고르기" }));
    fireEvent.click(screen.getByRole("button", { name: "줄로 넣기 (1)" }));
    const hidden = (n: string) => (container.querySelector(`[name="${n}"]`) as HTMLInputElement).value;
    expect([hidden("lines.0.warehouse"), hidden("lines.0.toWarehouse")]).toEqual(["WH-01", "WH-04"]);
    // 출고창고를 바꾸면 그 창고의 현재고를 다시 읽고, 줄의 LOT 는 비운다.
    h.stock.mockResolvedValue([]);
    fireEvent.change(from, { target: { value: "WH-03" } });
    expect(await screen.findByText("이 창고에는 재고가 없습니다.")).toBeInTheDocument();
    expect(h.stock).toHaveBeenLastCalledWith("WH-03");
    expect(hidden("lines.0.lot")).toBe("");
  });

  it("재고조정 — 사유 칸이 있고 수량에 + · − 를 붙인다. 불량창고도 고른다. 줄을 더하고 지운다", () => {
    const { container } = open("ADJ");
    expect(sentType(container)).toBe("ADJ");
    const head = screen.getByLabelText(/^창고/) as HTMLSelectElement;
    expect([...head.options].map((o) => o.value)).toEqual(["", "WH-01", "WH-02", "WH-03", "WH-04"]);
    expect(screen.getByLabelText(/사유/)).toBeInTheDocument();
    expect(field("줄 1 수량")).toHaveAttribute("placeholder", "+10 · −10");
    fireEvent.click(screen.getByRole("button", { name: "줄 더하기" }));
    expect(screen.getByText("2줄")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "줄 2 지우기" }));
    expect(screen.getByText("1줄")).toBeInTheDocument();
  });

  it("저장되면 같은 화면에 전표번호가 전표 보기로 이어지게 보이고, 입력이 비워져 다음 전표를 받는다", async () => {
    h.save.mockResolvedValue({ ok: true, code: "IV-20261109-003" });
    const { container } = open("IN");
    pick(1, "RM-0003 금 와이어");
    fireEvent.change(note(), { target: { value: "기초 재고" } });
    fireEvent.click(screen.getByRole("button", { name: "줄 더하기" }));
    submit(container);

    const link = await screen.findByRole("link", { name: "IV-20261109-003" });
    expect(link).toHaveAttribute("href", "/inventory/moves/IV-20261109-003");
    expect(screen.getByRole("status")).toHaveTextContent("다음 전표를 넣으세요");
    await waitFor(() => expect(field("줄 1 품목")).toHaveValue(""));
    expect(note()).toHaveValue("");
    expect(screen.getByText("1줄")).toBeInTheDocument();
    const sent = h.save.mock.calls[0][1] as FormData;
    expect([sent.get("moveType"), sent.get("note"), sent.get("lines.0.item")]).toEqual([
      "IN",
      "기초 재고",
      "RM-0003 금 와이어",
    ]);
  });

  it("저장한 뒤에도 머리에서 고른 창고는 남아, 같은 창고에서 잇달아 넣는다", async () => {
    h.save.mockResolvedValue({ ok: true, code: "IV-20261109-004" });
    h.stock.mockResolvedValue([stockRow({})]);
    const { container } = open("OUT");
    fireEvent.change(screen.getByLabelText(/^창고/), { target: { value: "WH-02" } });
    fireEvent.click(await screen.findByRole("checkbox", { name: "RM-0003 NW-25-0701 고르기" }));
    fireEvent.click(screen.getByRole("button", { name: "줄로 넣기 (1)" }));
    submit(container);
    await screen.findByRole("link", { name: "IV-20261109-004" });
    await waitFor(() => expect(field("줄 1 품목")).toHaveValue(""));
    expect(screen.getByLabelText(/^창고/)).toHaveValue("WH-02");
    expect(await screen.findByRole("checkbox", { name: "RM-0003 NW-25-0701 고르기" })).not.toBeDisabled();
  });

  it("머리에서 창고를 골라도 쓰지 않은 빈 줄은 창고를 보내지 않아, 서버가 없는 줄로 친다(PR 리뷰)", async () => {
    h.save.mockResolvedValue({ ok: true, code: "IV-20261109-005" });
    h.stock.mockResolvedValue([stockRow({})]);
    const { container } = open("OUT");
    fireEvent.change(screen.getByLabelText(/^창고/), { target: { value: "WH-02" } });
    fireEvent.click(await screen.findByRole("checkbox", { name: "RM-0003 NW-25-0701 고르기" }));
    fireEvent.click(screen.getByRole("button", { name: "줄로 넣기 (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "줄 더하기" }));
    expect(screen.getByText("2줄")).toBeInTheDocument();
    submit(container);
    await waitFor(() => expect(h.save).toHaveBeenCalled());
    const sent = h.save.mock.calls[0][1] as FormData;
    expect([sent.get("lines.0.warehouse"), sent.get("lines.1.warehouse"), sent.get("lines.1.item")]).toEqual([
      "WH-02",
      "",
      "",
    ]);
  });

  it("줄이 100줄을 넘게 고르면 남은 자리만큼만 넣고, 넣지 못한 것은 고른 채로 두고 알린다(PR 리뷰)", async () => {
    const many = Array.from({ length: 101 }, (_, i) => stockRow({ lot: `L-${String(i).padStart(3, "0")}` }));
    h.stock.mockResolvedValue(many);
    open("OUT");
    fireEvent.change(screen.getByLabelText(/^창고/), { target: { value: "WH-02" } });
    fireEvent.click(await screen.findByRole("checkbox", { name: "보이는 것 모두 고르기" }));
    fireEvent.click(screen.getByRole("button", { name: "줄로 넣기 (101)" }));
    expect(screen.getByText("100줄")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("1개를 넣지 못했습니다");
    expect(screen.getByRole("checkbox", { name: "RM-0003 L-100 고르기" })).toBeChecked();
    expect(screen.getByRole("button", { name: "줄로 넣기 (1)" })).toBeInTheDocument();
    // 줄이 가득하면 더 넣지 않고, 고른 것도 그대로다.
    fireEvent.click(screen.getByRole("button", { name: "줄로 넣기 (1)" }));
    expect(screen.getByText("100줄")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "RM-0003 L-100 고르기" })).toBeChecked();
  });

  it("거절되면 넣은 값이 남고 틀린 줄의 까닭이 보이며, 저장했다는 줄은 없다", async () => {
    h.save.mockResolvedValue({
      ok: false,
      errors: { header: {}, lines: { 0: { lot: "거래처 LOT 를 넣어 주세요" } } },
      values: { moveDate: "2026-11-09", moveType: "IN", note: "기초 재고", lines: [] },
    });
    const { container } = open("IN");
    pick(1, "RM-0003 금 와이어");
    fireEvent.change(note(), { target: { value: "기초 재고" } });
    submit(container);

    expect(await screen.findByText("거래처 LOT 를 넣어 주세요")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("저장하지 않았습니다");
    expect(field("줄 1 품목")).toHaveValue("RM-0003 금 와이어");
    expect(note()).toHaveValue("기초 재고");
    expect(screen.queryByRole("status")).toBeNull();
  });
});
