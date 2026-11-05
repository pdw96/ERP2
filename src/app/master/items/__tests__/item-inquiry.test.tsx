import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Item } from "@/db/items";
import { InquiryTable } from "@/components/inquiry-table";
import { itemInquiryColumns } from "../inquiry/item-inquiry";
import { ItemSearch } from "../item-list";

vi.mock("next/form", () => ({ default: (props: Record<string, unknown>) => <form {...props} /> }));

// 품목 조회(PR I, 성공 기준 14) — 모든 칸을 넓은 표로 보는, 고칠 수 없는 화면.

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
  minLot: 5000,
  lotMultiple: 0,
  cls1Group: "ITEM_CLS1",
  cls1: "WAFER",
  cls2Group: "ITEM_CLS2",
  cls2: "COMMON",
  cls3Group: "ITEM_CLS3",
  cls3: null,
  note: "",
  active: true,
  createdAt: new Date("2026-11-01T00:00:00Z"),
  // 한국 시각으로는 11월 4일 새벽이다.
  updatedAt: new Date("2026-11-03T16:30:00Z"),
  ...over,
});
const classes = {
  cls1: [{ code: "WAFER", name: "웨이퍼", active: true }],
  cls2: [
    { code: "COMMON", name: "공용", active: true },
    { code: "OLD", name: "옛 패키지", active: false },
  ],
  cls3: [],
};
const none = { q: "", includeInactive: false };

const table = (rows: Item[], over: { includeInactive?: boolean; narrowed?: boolean } = {}) =>
  render(
    <InquiryTable
      rows={rows}
      columns={itemInquiryColumns(classes)}
      what="품목"
      nameLabel="품명"
      editHref={(code) => `/master/items/${code}`}
      includeInactive={over.includeInactive ?? false}
      narrowed={over.narrowed ?? false}
    />,
  );

describe("품목 조회의 표", () => {
  it("칸은 한 건 등록 화면의 순서대로, 끝에 사용 여부 · 수정일(저자 판정 2026-11-04)", () => {
    table([item({})]);
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "코드 · 품명",
      "유형",
      "규격",
      "단위",
      "조달구분",
      "검사 대상",
      "리드타임",
      "안전재고",
      "최소 발주 · 생산량",
      "발주 · 생산 배수",
      "대분류",
      "중분류",
      "소분류",
      "비고",
      "사용 여부",
      "수정일",
    ]);
  });

  it("모든 칸의 값을 보인다 — 분류는 이름, 빈 칸은 「—」, 배수 0 은 「없음」, 수정일은 한국 날짜", () => {
    table([item({ note: "냉장 보관" })]);
    const cells = within(screen.getAllByRole("row")[1])
      .getAllByRole("cell")
      .map((td) => td.textContent);
    expect(cells).toEqual([
      "원자재",
      "8인치",
      "EA",
      "구매",
      "수입",
      "21일",
      "20,000",
      "5,000",
      "없음",
      "웨이퍼",
      "공용",
      "—",
      "냉장 보관",
      "사용",
      "2026-11-04",
    ]);
  });

  it("코드를 누르면 품목 등록의 수정 화면으로 간다 — 표 안에는 고치는 칸 · 단추가 없다", () => {
    table([item({})]);
    const head = within(screen.getAllByRole("row")[1]).getByRole("rowheader");
    expect(within(head).getByRole("link", { name: "RM-0001" })).toHaveAttribute("href", "/master/items/RM-0001");
    expect(head).toHaveTextContent("RM-0001웨이퍼");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("휴대폰 폭에서는 표를 옆으로 민다 — 코드 · 품명 칸은 왼쪽에 붙어 남는다", () => {
    table([item({})]);
    expect(screen.getByRole("region", { name: "품목 조회 표" })).toHaveClass("overflow-x-auto");
    expect(screen.getByRole("columnheader", { name: "코드 · 품명" })).toHaveClass("sticky", "left-0");
    expect(within(screen.getAllByRole("row")[1]).getByRole("rowheader")).toHaveClass("sticky", "left-0");
    expect(screen.getByText(/표를 옆으로 밀면/)).toHaveClass("md:hidden");
  });

  it("긴 비고는 칸 안에서 접고 줄바꿈을 지킨다", () => {
    table([item({ note: "첫 줄\n둘째 줄" })]);
    expect(screen.getByText(/첫 줄/).closest("td")).toHaveClass("whitespace-pre-line", "wrap-anywhere");
  });

  it("공통코드에서 이름을 모르는 분류는 코드 그대로", () => {
    table([item({ cls3: "GONE" })]);
    expect(screen.getByText("GONE")).toBeInTheDocument();
  });

  it("「사용 안 함」 품목은 흐리게, 사용 여부 칸에 「사용 안 함」", () => {
    table([item({ active: false })], { includeInactive: true });
    expect(screen.getAllByRole("row")[1]).toHaveClass("text-muted");
    expect(screen.getByText("사용 안 함")).toBeInTheDocument();
    expect(screen.getByText(/1개 · 사용 안 함 포함/)).toBeInTheDocument();
  });

  it("찾은 것이 없으면 그렇게 말한다", () => {
    table([], { narrowed: true });
    expect(screen.getByText("찾는 품목이 없습니다.")).toBeInTheDocument();
  });
});

describe("품목 조회의 찾기", () => {
  it("찾기는 조회로 보내고 글 칸 전체를 본다고 알린다 — 거르기는 품목 등록과 같다", () => {
    render(
      <ItemSearch
        filter={{ ...none, q: "냉장" }}
        notices={[]}
        classes={classes}
        action="/master/items/inquiry"
        scope="allText"
      />,
    );
    const form = screen.getByRole("search", { name: "품목 찾기" });
    expect(form).toHaveAttribute("action", "/master/items/inquiry");
    const f = within(form);
    expect(f.getByLabelText("코드 · 품명 · 규격 · 비고")).toHaveValue("냉장");
    for (const label of ["유형", "조달구분", "대분류", "중분류", "소분류", "사용 안 함 포함"])
      expect(f.getByLabelText(label)).toBeInTheDocument();
    expect(f.getByRole("link", { name: "처음대로" })).toHaveAttribute("href", "/master/items/inquiry");
  });
});
