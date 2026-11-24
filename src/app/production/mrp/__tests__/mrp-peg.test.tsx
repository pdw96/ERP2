import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MrpPegCover, MrpPegDown, MrpPegOrder, MrpPegUp, MrpPegView, MrpRunInfo } from "@/db/mrp";
import { MrpPeg } from "../mrp-peg";
import { mrpPegHref } from "../paths";

// 페깅 탭 — 고른 계획오더의 머리 한 줄 · 위로(이 계획오더가 채우는 소요) · 아래로(이 계획오더가 낳은 소요). 나무는 중첩 목록.

vi.mock("next/form", () => ({ default: (props: Record<string, unknown>) => <form {...props} /> }));

const run: MrpRunInfo = { ranAt: new Date("2026-11-24T05:05:00Z"), runDate: "2026-11-24", dueWeekday: 1, orders: 3 };
const info = (code: string, name: string, itemType = "FG") => ({ code, name, spec: "", itemType, active: true });
const order = (over: Partial<MrpPegOrder>): MrpPegOrder => ({
  number: "PL-20261124-001",
  kind: "MAKE",
  item: info("FG-0001", "전원 관리 IC"),
  qty: "7000",
  unit: "EA",
  startDate: "2026-11-24",
  dueDate: "2026-12-01",
  lateDays: 0,
  noBom: false,
  mps: null,
  ...over,
});
const view = (over: Partial<MrpPegView>): MrpPegView => ({
  run,
  hasPegs: true,
  items: [
    { code: "FG-0001", name: "전원 관리 IC" },
    { code: "RM-0001", name: "솔더 페이스트" },
  ],
  item: "FG-0001",
  orders: [{ number: "PL-20261124-001", qty: "7000", unit: "EA", dueDate: "2026-12-01" }],
  notice: null,
  selected: order({ mps: { week: "2026-12-01", fixed: true } }),
  up: [],
  down: [],
  truncated: false,
  ...over,
});
const rm007 = order({
  number: "PL-20261124-007",
  kind: "BUY",
  item: info("RM-0001", "솔더 페이스트", "RM"),
  qty: "50",
  unit: "KG",
  startDate: "2026-11-24",
  dueDate: "2026-11-27",
});
const stock = (qty: string): MrpPegCover => ({ stock: true, qty });
const up = () => within(screen.getByRole("region", { name: "위로" }));
const down = () => within(screen.getByRole("region", { name: "아래로" }));

describe("페깅 탭", () => {
  it("실행이 없으면 아무것도 그리지 않는다", () => {
    const { container } = render(<MrpPeg peg={view({ run: null, hasPegs: false, items: [], selected: null })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("머리 · 위로 · 아래로를 그린다 — 몫과 계획오더 전체 수량", () => {
    const downs: MrpPegDown[] = [
      {
        item: info("RM-0001", "솔더 페이스트", "RM"),
        unit: "KG",
        need: "82",
        covers: [stock("37"), { stock: false, qty: "45", order: rm007, down: [] }],
      },
    ];
    render(<MrpPeg peg={view({ down: downs })} />);
    expect(screen.getByText("▲ 위로 — 이 계획오더가 채우는 소요")).toBeInTheDocument();
    expect(screen.getByText("▼ 아래로 — 이 계획오더가 낳은 소요")).toBeInTheDocument();
    const lower = down();
    expect(lower.getAllByText("RM-0001")).toHaveLength(2); // 소요 줄 · 계획오더 마디
    expect(lower.getByText("82")).toBeInTheDocument();
    expect(lower.getByText("재고 37")).toBeInTheDocument();
    expect(lower.getByText("45")).toBeInTheDocument();
    expect(lower.getByText("50 KG")).toBeInTheDocument();
    expect(lower.getByRole("link", { name: "PL-20261124-007" })).toHaveAttribute(
      "href",
      "/production/mrp?view=peg&order=PL-20261124-007",
    );
    const head = screen.getByRole("region", { name: "고른 계획오더" });
    expect(within(head).getByText("PL-20261124-001")).toBeInTheDocument();
    expect(within(head).getByText("7,000 EA")).toBeInTheDocument();
  });

  it("고르는 폼 둘 — 품목 폼은 order 를, 계획오더 폼은 item 을 싣지 않는다(품목 바꿈이 묻히지 않게)", () => {
    render(<MrpPeg peg={view({})} />);
    const itemForm = screen.getByRole("search", { name: "페깅 품목 고르기" });
    const orderForm = screen.getByRole("search", { name: "페깅 계획오더 고르기" });
    for (const form of [itemForm, orderForm]) {
      expect(form).toHaveAttribute("action", "/production/mrp");
      expect(form.querySelector('input[name="view"]')).toHaveValue("peg");
      expect(within(form).getByRole("button", { name: "보기" })).toBeInTheDocument();
    }
    expect(within(itemForm).getByLabelText("품목")).toHaveValue("FG-0001");
    expect(itemForm.querySelector('[name="order"]')).toBeNull();
    expect(within(orderForm).getByLabelText("계획오더")).toHaveValue("PL-20261124-001");
    expect(orderForm.querySelector('[name="item"]')).toBeNull();
  });

  it("늦은 계획오더는 머리에 빨강 N일 늦음", () => {
    render(<MrpPeg peg={view({ selected: order({ lateDays: 3 }) })} />);
    const late = within(screen.getByRole("region", { name: "고른 계획오더" })).getByText("3일 늦음");
    expect(late).toHaveClass("text-red-700");
  });

  it("MPS 칸 · 안전재고 보충 · 남는 수량 · 0(끝수) · 구매 · BOM 없음 문구", () => {
    const ups: MrpPegUp[] = [
      { kind: "ORDER", qty: "30", needDate: "2026-12-01", parent: order({ number: "PL-20261124-002" }), up: [] },
      { kind: "SAFETY", qty: "5" },
      { kind: "SURPLUS", qty: "2" },
      { kind: "SHORT", qty: "1" },
    ];
    const downs: MrpPegDown[] = [{ item: info("RM-0002", "리드 프레임", "RM"), unit: "EA", need: "0", covers: [] }];
    const { rerender } = render(<MrpPeg peg={view({ up: ups, down: downs })} />);
    expect(up().getByText("MPS · FG-0001 · 12-01 주 · 7,000 · 고정")).toBeInTheDocument();
    expect(up().getByText(/안전재고 보충/)).toBeInTheDocument();
    expect(up().getByText(/남는 수량\(최소량 · 배수\)/)).toBeInTheDocument();
    expect(up().getByText(/가용재고 음수 메움/)).toBeInTheDocument();
    expect(up().getByRole("link", { name: "PL-20261124-002" })).toBeInTheDocument();
    expect(down().getByText("0(끝수)")).toBeInTheDocument();

    rerender(<MrpPeg peg={view({ selected: order({ mps: { week: "2026-12-08", fixed: false } }) })} />);
    expect(up().getByText("MPS · FG-0001 · 12-08 주 · 7,000 · 안")).toBeInTheDocument();

    rerender(<MrpPeg peg={view({ item: "RM-0001", selected: rm007 })} />);
    expect(down().getByText("구매라 아래가 없습니다")).toBeInTheDocument();

    rerender(<MrpPeg peg={view({ selected: order({ noBom: true }) })} />);
    expect(down().getByText("BOM 없음 — 펼칠 BOM 줄이 없습니다")).toBeInTheDocument();
  });

  it("위로의 윗 계획오더가 완제품이면 그 마디 밑에도 MPS 칸을 적는다", () => {
    const fg = order({
      number: "PL-20261124-002",
      qty: "300",
      mps: { week: "2026-12-08", fixed: false },
    });
    const ups: MrpPegUp[] = [
      {
        kind: "ORDER",
        qty: "30",
        needDate: "2026-12-01",
        parent: order({ number: "PL-20261124-005", item: info("SF-0002", "보드 조립품", "SF") }),
        up: [{ kind: "ORDER", qty: "30", needDate: "2026-12-08", parent: fg, up: [] }],
      },
    ];
    render(<MrpPeg peg={view({ selected: order({ number: "PL-20261124-009", mps: null }), up: ups })} />);
    expect(up().getByText("MPS · FG-0001 · 12-08 주 · 300 · 안")).toBeInTheDocument();
    expect(up().queryByText(/고정/)).toBeNull();
  });

  it("아래로는 생산 계획오더 밑으로 이어진다", () => {
    const inner: MrpPegDown[] = [
      { item: info("RM-0001", "솔더 페이스트", "RM"), unit: "KG", need: "9", covers: [stock("9")] },
    ];
    const sf = order({ number: "PL-20261124-004", item: info("SF-0002", "보드 조립품", "SF"), qty: "20", unit: "EA" });
    const downs: MrpPegDown[] = [
      {
        item: info("SF-0002", "보드 조립품", "SF"),
        unit: "EA",
        need: "20",
        covers: [{ stock: false, qty: "20", order: sf, down: inner }],
      },
    ];
    render(<MrpPeg peg={view({ down: downs })} />);
    expect(down().getByText("재고 9")).toBeInTheDocument();
  });

  it("페깅 없는 실행 · 지난 번호 · 찾지 못함 안내", () => {
    const { rerender } = render(
      <MrpPeg peg={view({ hasPegs: false, items: [], item: null, selected: null, orders: [] })} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "이 실행에는 페깅이 없습니다 — [MRP 실행]을 다시 누르면 생깁니다",
    );
    expect(screen.queryByRole("region", { name: "위로" })).toBeNull();
    expect(screen.queryByRole("region", { name: "아래로" })).toBeNull();
    expect(screen.queryByText(/▲ 위로|▼ 아래로/)).toBeNull();

    // 고른 계획오더가 있어도(머리 한 줄) 페깅이 없으면 나무 칸은 없다
    rerender(<MrpPeg peg={view({ hasPegs: false })} />);
    expect(screen.getByRole("region", { name: "고른 계획오더" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("이 실행에는 페깅이 없습니다");
    expect(screen.queryByRole("region", { name: "위로" })).toBeNull();
    expect(screen.queryByRole("region", { name: "아래로" })).toBeNull();

    rerender(<MrpPeg peg={view({ notice: { kind: "stale", order: "PL-20261101-009" }, selected: null })} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "PL-20261101-009 는 지난 실행의 계획오더입니다 — 새 실행에서 다시 고르세요",
    );

    rerender(<MrpPeg peg={view({ notice: { kind: "notFound" }, selected: null })} />);
    expect(screen.getByRole("status")).toHaveTextContent("고른 계획오더를 찾지 못했습니다 — 품목을 골라 다시 고르세요");
  });

  it("마디 상한 안내", () => {
    const { rerender } = render(<MrpPeg peg={view({ truncated: true })} />);
    expect(screen.getByText("마디가 500개를 넘어 나머지는 줄였습니다")).toBeInTheDocument();
    rerender(<MrpPeg peg={view({})} />);
    expect(screen.queryByText(/마디가 500개를 넘어/)).toBeNull();
  });
});

describe("mrpPegHref", () => {
  it("품목 · 계획오더가 있으면 싣는다", () => {
    expect(mrpPegHref()).toBe("/production/mrp?view=peg");
    expect(mrpPegHref("PL-20261124-003")).toBe("/production/mrp?view=peg&order=PL-20261124-003");
    expect(mrpPegHref(undefined, "FG-0001")).toBe("/production/mrp?view=peg&item=FG-0001");
  });
});
