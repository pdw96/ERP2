import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MoveFormOptions } from "@/db/stock";
import { MoveForm } from "../move-form";

// 수불 등록 화면 — 유형마다 칸이 바뀌고, 품목을 고르면 기본 창고가 채워진다(성공 기준 2, 설계 「2026-11-09 — PR C 를 열기 전에 정한 것」).

const h = vi.hoisted(() => ({ onHand: vi.fn() }));
vi.mock("../actions", () => ({ saveMoveAction: vi.fn(), onHandAction: h.onHand }));

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

describe("수불 등록 화면", () => {
  beforeEach(() => h.onHand.mockResolvedValue([]));

  it("입고 — 품목을 고르면 기본 입고 창고가 채워지고, 단위는 기준이 같은 것만 고른다", () => {
    render(<MoveForm options={options} today="2026-11-09" />);
    pick(1, "RM-0003 금 와이어");
    expect(field("줄 1 창고")).toHaveValue("WH-01");
    expect(field("줄 1 LOT")).toHaveAttribute("placeholder", "거래처 LOT");
    const units = [...(field("줄 1 단위") as unknown as HTMLSelectElement).options].map((o) => o.value);
    expect(units).toEqual(["", "MM"]);
    expect(screen.queryByLabelText("줄 1 받는 창고")).toBeNull();
    expect(screen.queryByLabelText("사유")).toBeNull();
  });

  it("만드는 품목의 LOT 는 비우면 번호 규칙으로, LOT 를 끈 품목은 LOT 칸이 없다", () => {
    render(<MoveForm options={options} today="2026-11-09" />);
    pick(1, "FG-0001 전원 관리 IC");
    expect(field("줄 1 LOT")).toHaveAttribute("placeholder", "비우면 번호 규칙으로");
    pick(1, "SM-0002 방습백");
    expect(screen.queryByLabelText("줄 1 LOT")).toBeNull();
    expect(screen.getByText("LOT 관리 안 함")).toBeInTheDocument();
  });

  it("이동 — 받는 창고 칸이 생기고 입고 창고 → 출고 창고로 채워진다. 같은 품목은 받는 쪽을 비운다", async () => {
    h.onHand.mockResolvedValue([{ lot: "NW-25-0701", qty: "6,000" }]);
    render(<MoveForm options={options} today="2026-11-09" />);
    fireEvent.click(screen.getByRole("radio", { name: "이동" }));
    pick(1, "RM-0003 금 와이어");
    expect([field("줄 1 보내는 창고").value, field("줄 1 받는 창고").value]).toEqual(["WH-01", "WH-02"]);
    expect(await screen.findByRole("option", { name: "NW-25-0701 · 가용 6,000 M" })).toBeInTheDocument();
    expect(h.onHand).toHaveBeenCalledWith("RM-0003", "WH-01");
    pick(1, "FG-0001 전원 관리 IC");
    expect([field("줄 1 보내는 창고").value, field("줄 1 받는 창고").value]).toEqual(["WH-03", ""]);
  });

  it("조정 — 사유 칸이 생기고 수량에 + · − 를 붙인다. 줄을 더하고 지운다", () => {
    render(<MoveForm options={options} today="2026-11-09" />);
    fireEvent.click(screen.getByRole("radio", { name: "조정" }));
    expect(screen.getByLabelText(/사유/)).toBeInTheDocument();
    expect(field("줄 1 수량")).toHaveAttribute("placeholder", "+10 · −10");
    fireEvent.click(screen.getByRole("button", { name: "줄 더하기" }));
    expect(screen.getByText("2줄")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "줄 2 지우기" }));
    expect(screen.getByText("1줄")).toBeInTheDocument();
  });
});
