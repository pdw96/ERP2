import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Item } from "@/db/items";
import { ItemList, ItemSearch, SavedNotice } from "../item-list";

vi.mock("next/form", () => ({ default: (props: Record<string, unknown>) => <form {...props} /> }));

const item = (over: Partial<Item>): Item => ({
  id: 1,
  code: "RM-0001",
  name: "웨이퍼",
  spec: "8인치",
  itemTypeGroup: "ITEM_TYPE",
  itemType: "RM",
  procurementGroup: "PROC_TYPE",
  procurement: "BUY",
  unitGroup: "UNIT",
  unit: "EA",
  inspectIn: true,
  inspectOut: false,
  leadTimeDays: 21,
  safetyStock: 20000,
  minLot: 0,
  lotMultiple: 0,
  cls1Group: "ITEM_CLS1",
  cls1: null,
  cls2Group: "ITEM_CLS2",
  cls2: null,
  cls3Group: "ITEM_CLS3",
  cls3: null,
  note: "",
  lotManaged: true,
  lotRuleCode: null,
  defaultInWarehouseId: null,
  defaultOutWarehouseId: null,
  defaultWarehouseDefect: false,
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});
const none = { q: "", includeInactive: false };

describe("품목 목록", () => {
  it("행마다 코드(수정 화면 링크) · 품명 · 규격 · 유형 · 단위", () => {
    render(<ItemList rows={[item({})]} filter={none} />);
    const row = within(screen.getAllByRole("row")[1]);
    expect(row.getByRole("link", { name: "RM-0001" })).toHaveAttribute("href", "/master/items/RM-0001");
    for (const text of ["웨이퍼", "8인치", "원자재", "EA"]) expect(row.getByText(text)).toBeInTheDocument();
    expect(screen.getByText("1개")).toBeInTheDocument();
  });

  it("찾아 고르는 칸만 둔다 — 조달구분 · 분류 · 검사 · 계획 정보는 「품목 조회」가 보인다(저자 판정 2026-11-04)", () => {
    render(<ItemList rows={[item({})]} filter={none} />);
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "코드",
      "품명 · 규격",
      "유형",
      "단위",
    ]);
    expect(screen.queryByText("21일")).toBeNull();
  });

  it("「사용 안 함」 품목에는 표시가 붙는다", () => {
    render(<ItemList rows={[item({ active: false })]} filter={{ ...none, includeInactive: true }} />);
    expect(screen.getByText("사용 안 함")).toBeInTheDocument();
    expect(screen.getByText("1개 · 사용 안 함 포함")).toBeInTheDocument();
  });

  it("쉼 없이 긴 품명 · 규격도 칸 안에서 접힌다 — 휴대폰 폭에서 표가 넓어지지 않게", () => {
    render(<ItemList rows={[item({ name: "A".repeat(100), spec: "B".repeat(100) })]} filter={none} />);
    expect(screen.getByText("A".repeat(100)).closest("td")).toHaveClass("wrap-anywhere");
  });

  it("찾은 것이 없으면 그렇게 말한다", () => {
    render(<ItemList rows={[]} filter={{ ...none, q: "없음" }} />);
    expect(screen.getByText("찾는 품목이 없습니다.")).toBeInTheDocument();
  });
});

describe("찾기 · 거르기", () => {
  it("지금 거르는 값을 칸에 보이고, 「처음대로」로 돌아간다", () => {
    render(<ItemSearch filter={{ q: "웨이퍼", itemType: "RM", includeInactive: true }} notices={[]} />);
    const form = within(screen.getByRole("search", { name: "품목 찾기" }));
    expect(form.getByLabelText("코드 · 품명")).toHaveValue("웨이퍼");
    expect(form.getByLabelText("유형")).toHaveDisplayValue("원자재");
    expect(form.getByLabelText("조달구분")).toHaveDisplayValue("전체");
    expect(form.getByLabelText("사용 안 함 포함")).toBeChecked();
    expect(form.getByRole("link", { name: "처음대로" })).toHaveAttribute("href", "/master/items");
  });

  it("받지 않은 거르기 값을 알린다", () => {
    render(<ItemSearch filter={none} notices={[{ field: "itemType", message: "없는 유형이라 거르지 않았습니다" }]} />);
    expect(screen.getByRole("status")).toHaveTextContent("없는 유형이라 거르지 않았습니다");
  });
});

describe("분류(PR H)", () => {
  const classes = {
    cls1: [{ code: "FRAME", name: "리드프레임", active: true }],
    cls2: [
      { code: "SOP", name: "SOP", active: true },
      { code: "OLD", name: "옛 패키지", active: false },
    ],
    cls3: [],
  };

  it("찾기 줄에 분류 고르는 칸 셋 — 「사용 안 함」 값도 표시를 붙여 고를 수 있다", () => {
    render(<ItemSearch filter={{ ...none, cls2: "OLD" }} notices={[]} classes={classes} />);
    const form = within(screen.getByRole("search", { name: "품목 찾기" }));
    expect(form.getByLabelText("대분류")).toHaveDisplayValue("전체");
    expect(form.getByLabelText("중분류")).toHaveDisplayValue("옛 패키지 (사용 안 함)");
    expect(form.getByLabelText("소분류")).toHaveDisplayValue("전체");
    expect(form.getByRole("link", { name: "처음대로" })).toBeInTheDocument();
  });

  it("분류로만 걸러 찾은 것이 없어도 「찾는 품목이 없습니다」", () => {
    render(<ItemList rows={[]} filter={{ ...none, cls3: "POWER" }} />);
    expect(screen.getByText("찾는 품목이 없습니다.")).toBeInTheDocument();
  });
});

describe("저장 뒤의 알림", () => {
  it("저장한 품목을 알린다", () => {
    render(<SavedNotice item={item({ name: "솔더 볼" })} shown />);
    expect(screen.getByRole("status")).toHaveTextContent("RM-0001 솔더 볼을 저장했습니다.");
  });

  it("「사용 안 함」으로 바꿔 목록에서 빠졌으면 다시 보는 길을 알린다", () => {
    render(<SavedNotice item={item({ name: "센서 IC", active: false })} shown={false} />);
    expect(screen.getByRole("status")).toHaveTextContent("센서 IC를 저장했습니다.");
    expect(screen.getByRole("link", { name: "사용 안 함 포함" })).toHaveAttribute("href", "/master/items?inactive=1");
  });
});
