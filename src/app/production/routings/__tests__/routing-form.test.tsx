import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProcessChoice, RoutingSheet, RoutingSheetMaterial, RoutingSheetStep } from "@/db/routings";
import { routingValues } from "@/lib/routing-input";
import { RoutingForm } from "../routing-form";

// 라우팅 한 품목 화면의 폼(메뉴 「라우팅」) — 공정 줄 · 투입 자재를 고치고 「저장」으로 보낸다. 저장 · 지우기는 서버 동작이라 흉내 낸다 —
// 보내는 칸(서버가 읽는 이름)과 거절의 까닭이 그 줄 · 그 자재에 붙는지를 본다. 줄을 옮기거나 지워도 자재는 그 공정을 따라간다(Review Focus 1),
// 줄의 공정을 바꾸면 작업장이 비고 후보가 그 공정의 것만 된다(Review Focus 2).

const h = vi.hoisted(() => ({ save: vi.fn(), del: vi.fn() }));
vi.mock("../actions", () => ({ saveRoutingAction: h.save, deleteRoutingAction: h.del }));

const processes: ProcessChoice[] = [
  {
    code: "DA",
    name: "다이 본딩",
    active: true,
    workCenters: [
      { code: "DA-1", name: "다이 본딩 1라인", active: true },
      { code: "DA-2", name: "다이 본딩 2라인", active: true },
    ],
  },
  { code: "MD", name: "몰딩", active: true, workCenters: [{ code: "MD-1", name: "몰딩 1호기", active: true }] },
  {
    code: "WB",
    name: "와이어 본딩",
    active: true,
    workCenters: [
      { code: "WB-1", name: "와이어 본딩 1라인", active: true },
      { code: "WB-2", name: "와이어 본딩 2라인", active: true },
    ],
  },
];

const step = (over: Partial<RoutingSheetStep>): RoutingSheetStep => ({
  seq: 10,
  processCode: "WB",
  processName: "와이어 본딩",
  processActive: true,
  workCenterCode: "WB-1",
  workCenterName: "와이어 본딩 1라인",
  workCenterActive: true,
  setupMin: 20,
  runSec: "2.400",
  note: "",
  ...over,
});
const material = (over: Partial<RoutingSheetMaterial>): RoutingSheetMaterial => ({
  code: "RM-0003",
  name: "금 와이어",
  itemType: "RM",
  unit: "M",
  active: true,
  seq: null,
  inBom: true,
  ...over,
});

const sheet: RoutingSheet = {
  item: { code: "SF-0002", name: "몰딩 완료품", spec: "", itemType: "SF", unit: "EA", active: true },
  version: "1700000000000",
  hasBom: true,
  steps: [
    step({}),
    step({
      seq: 20,
      processCode: "MD",
      processName: "몰딩",
      workCenterCode: "MD-1",
      workCenterName: "몰딩 1호기",
      setupMin: 30,
      runSec: "0.120",
    }),
  ],
  materials: [
    material({ code: "SF-0001", name: "다이 본딩 완료품", itemType: "SF", unit: "EA", seq: 10 }),
    material({ seq: 10 }),
    material({ code: "RM-0004", name: "몰딩 컴파운드", unit: "KG", seq: 20 }),
  ],
};

/** 「저장」으로 보낸 칸을 서버가 읽는 꼴로. */
function sent() {
  const form = h.save.mock.calls.at(-1)![1] as FormData;
  return routingValues(form);
}
const stepOfMaterial = (code: string) => sent().materials.find((m) => m.item === code)?.step;

/** 공정 줄 표에서 그 순번의 줄. */
const stepRow = (seq: number) => screen.getByLabelText(`${seq} 줄 공정`).closest("tr")!;
const materialRow = (code: string) => screen.getByLabelText(`${code} 투입 공정`).closest("tr")!;
const optionTexts = (select: HTMLElement) =>
  within(select)
    .getAllByRole("option")
    .map((o) => o.textContent);

async function save() {
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "저장" })));
  await waitFor(() => expect(h.save).toHaveBeenCalled());
}

beforeEach(() => {
  h.save.mockReset().mockResolvedValue(null);
  h.del.mockReset().mockResolvedValue(null);
});
afterEach(() => vi.restoreAllMocks());

describe("공정 줄", () => {
  it("불러온 줄 — 순번 10 · 20, 공정 · 작업장 · 준비 · 개당이 칸에 있고, 투입 자재 칸에 붙은 자재가 보인다", () => {
    render(<RoutingForm sheet={sheet} processes={processes} />);
    const table = screen.getByRole("table", { name: /공정 줄/ });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((c) => c.textContent),
    ).toEqual(["순번", "공정", "작업장", "준비시간(분)", "개당 시간(초)", "투입 자재", "비고", ""]);
    expect(screen.getByLabelText("10 줄 공정")).toHaveValue("WB");
    expect(screen.getByLabelText("10 줄 작업장")).toHaveValue("WB-1");
    expect(screen.getByLabelText("10 줄 준비시간")).toHaveValue("20");
    expect(screen.getByLabelText("10 줄 개당 시간")).toHaveValue("2.400");
    expect(screen.getByLabelText("20 줄 공정")).toHaveValue("MD");
    expect(screen.getByLabelText("20 줄 작업장")).toHaveValue("MD-1");
    expect(within(stepRow(10)).getAllByRole("cell")[0].textContent).toBe("10");
    expect(stepRow(10).textContent).toContain("SF-0001 다이 본딩 완료품");
    expect(stepRow(10).textContent).toContain("RM-0003 금 와이어");
    expect(stepRow(10).textContent).not.toContain("RM-0004");
    expect(stepRow(20).textContent).toContain("RM-0004 몰딩 컴파운드");
  });

  it("공정을 바꾸면 작업장이 비고, 후보는 그 공정의 작업장만", () => {
    render(<RoutingForm sheet={sheet} processes={processes} />);
    fireEvent.change(screen.getByLabelText("10 줄 공정"), { target: { value: "DA" } });
    const center = screen.getByLabelText("10 줄 작업장");
    expect(center).toHaveValue("");
    expect(optionTexts(center).slice(1)).toEqual(["DA-1 다이 본딩 1라인", "DA-2 다이 본딩 2라인"]);
  });

  it("불러온 「사용 안 함」 공정 · 작업장은 그 줄에만 「(사용 안 함)」을 붙여 후보로 남는다", () => {
    render(
      <RoutingForm
        sheet={{
          ...sheet,
          steps: [
            step({
              processCode: "BG",
              processName: "웨이퍼 연삭",
              processActive: false,
              workCenterCode: "BG-1",
              workCenterName: "연삭 1호기",
              workCenterActive: false,
            }),
            sheet.steps[1],
          ],
        }}
        processes={processes}
      />,
    );
    expect(screen.getByLabelText("10 줄 공정")).toHaveDisplayValue("BG 웨이퍼 연삭 (사용 안 함)");
    expect(screen.getByLabelText("10 줄 작업장")).toHaveDisplayValue("BG-1 연삭 1호기 (사용 안 함)");
    expect(optionTexts(screen.getByLabelText("20 줄 공정"))).not.toContain("BG 웨이퍼 연삭 (사용 안 함)");
  });

  it("줄을 아래로 옮기면 순번이 다시 보이고, 자재의 투입 공정이 그 공정을 따라간다 — 보내는 materials.<j>.step 이 새 차례", async () => {
    render(<RoutingForm sheet={sheet} processes={processes} />);
    fireEvent.click(screen.getByRole("button", { name: "10 줄 아래로" }));
    expect(screen.getByLabelText("10 줄 공정")).toHaveValue("MD");
    expect(screen.getByLabelText("20 줄 공정")).toHaveValue("WB");
    expect(screen.getByLabelText("RM-0003 투입 공정")).toHaveDisplayValue("20 WB 와이어 본딩");
    expect(screen.getByLabelText("RM-0004 투입 공정")).toHaveDisplayValue("10 MD 몰딩");
    expect(stepRow(20).textContent).toContain("RM-0003 금 와이어");
    await save();
    const v = sent();
    expect(v).toMatchObject({ item: "SF-0002", version: "1700000000000" });
    expect(v.steps.map((s) => [s.process, s.workCenter, s.origSeq])).toEqual([
      ["MD", "MD-1", "20"],
      ["WB", "WB-1", "10"],
    ]);
    expect(stepOfMaterial("SF-0001")).toBe("1");
    expect(stepOfMaterial("RM-0003")).toBe("1");
    expect(stepOfMaterial("RM-0004")).toBe("0");
  });

  it("자재가 붙은 줄을 지우면 그 자재는 「첫 공정에서 듦」이 되고 step 은 빈 글자로 간다", async () => {
    render(<RoutingForm sheet={sheet} processes={processes} />);
    fireEvent.click(screen.getByRole("button", { name: "10 줄 지우기" }));
    expect(screen.getByLabelText("10 줄 공정")).toHaveValue("MD");
    expect(screen.getByLabelText("RM-0003 투입 공정")).toHaveDisplayValue("첫 공정에서 듦");
    expect(screen.getByLabelText("RM-0004 투입 공정")).toHaveDisplayValue("10 MD 몰딩");
    await save();
    expect(sent().steps.map((s) => s.process)).toEqual(["MD"]);
    expect(stepOfMaterial("RM-0003")).toBe("");
    expect(stepOfMaterial("SF-0001")).toBe("");
    expect(stepOfMaterial("RM-0004")).toBe("0");
  });

  it("자재의 투입 공정을 고르면 그 줄 차례가 간다 — 새로 더한 줄도", async () => {
    render(<RoutingForm sheet={sheet} processes={processes} />);
    fireEvent.click(screen.getByRole("button", { name: "공정 줄 더하기" }));
    fireEvent.change(screen.getByLabelText("30 줄 공정"), { target: { value: "DA" } });
    fireEvent.change(screen.getByLabelText("30 줄 작업장"), { target: { value: "DA-2" } });
    const select = screen.getByLabelText("RM-0004 투입 공정");
    expect(optionTexts(select)).toEqual(["첫 공정에서 듦", "10 WB 와이어 본딩", "20 MD 몰딩", "30 DA 다이 본딩"]);
    // 후보의 값은 줄의 차례 — 서버와 브라우저가 같은 값을 그려야 고른 값이 보인다(화면 열쇠는 둘이 다르다).
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => (o as HTMLOptionElement).value),
    ).toEqual(["", "0", "1", "2"]);
    fireEvent.change(select, { target: { value: optionValue(select, "30 DA 다이 본딩") } });
    await save();
    expect(sent().steps[2]).toMatchObject({ process: "DA", workCenter: "DA-2" });
    expect(sent().steps[2].origSeq).toBeUndefined();
    expect(stepOfMaterial("RM-0004")).toBe("2");
  });
});

function optionValue(select: HTMLElement, text: string) {
  return (within(select).getByRole("option", { name: text }) as HTMLOptionElement).value;
}

describe("투입 자재", () => {
  it("BOM 에 없음 · 사용 안 함 표시, BOM 이 없으면 안내와 BOM 등록 링크", () => {
    const { unmount } = render(
      <RoutingForm
        sheet={{
          ...sheet,
          materials: [
            material({ code: "RM-0009", name: "옛 와이어", inBom: false, seq: 10 }),
            material({ code: "SM-0002", name: "방습백", itemType: "SM", unit: "EA", active: false }),
          ],
        }}
        processes={processes}
      />,
    );
    const table = screen.getByRole("table", { name: /투입 자재/ });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((c) => c.textContent),
    ).toEqual(["자재", "유형", "단위", "투입 공정"]);
    expect(materialRow("RM-0009").textContent).toContain("BOM 에 없음");
    expect(materialRow("SM-0002").textContent).toContain("사용 안 함");
    expect(materialRow("SM-0002").textContent).not.toContain("BOM 에 없음");
    unmount();

    render(<RoutingForm sheet={{ ...sheet, hasBom: false, materials: [] }} processes={processes} />);
    expect(screen.getByText(/이 품목의 BOM 이 없어/).textContent).toBe(
      "이 품목의 BOM 이 없어 붙일 자재가 없습니다 — BOM 등록에서 먼저 넣으세요",
    );
    expect(screen.getByRole("link", { name: "BOM 등록" })).toHaveAttribute("href", "/production/bom/SF-0002");
    expect(screen.queryByRole("table", { name: /투입 자재/ })).toBeNull();
  });

  it("붙이지 않은 자재 안내 — 첫 줄 공정코드", () => {
    render(
      <RoutingForm
        sheet={{ ...sheet, materials: [...sheet.materials, material({ code: "SM-0002", name: "방습백" })] }}
        processes={processes}
      />,
    );
    expect(screen.getByText("붙이지 않은 자재 1개 — 첫 공정(WB)에서 듭니다")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "20 줄 위로" }));
    expect(screen.getByText("붙이지 않은 자재 1개 — 첫 공정(MD)에서 듭니다")).toBeInTheDocument();
  });
});

describe("거절 · 지우기", () => {
  it("서버 거절의 까닭이 그 줄 · 그 자재 칸 아래와 맨 위에 보인다", async () => {
    h.save.mockResolvedValue({
      ok: false,
      errors: {
        steps: { 1: { workCenter: "그 공정의 작업장이 아닙니다 — 이 공정의 작업장에서 고르세요" } },
        materials: { 2: "이 품목의 BOM 에 없는 자재입니다" },
      },
      formError: "다른 사람이 먼저 고쳤습니다 — 화면을 새로 열어 다시 고치세요",
      values: { steps: [], materials: [] },
    });
    render(<RoutingForm sheet={sheet} processes={processes} />);
    await save();
    expect(await within(stepRow(20)).findByText(/그 공정의 작업장이 아닙니다/)).toBeVisible();
    expect(screen.getByLabelText("20 줄 작업장")).toHaveAttribute("aria-invalid", "true");
    expect(within(materialRow("RM-0004")).getByText("이 품목의 BOM 에 없는 자재입니다")).toBeVisible();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("다른 사람이 먼저 고쳤습니다");
    expect(alert.textContent).toContain("틀린 칸 2개");
    // 값은 화면이 쥐고 있어 그대로 남는다.
    expect(screen.getByLabelText("10 줄 개당 시간")).toHaveValue("2.400");
  });

  it("「라우팅 지우기」는 한 번 더 묻고, 그렇다 하면 그때의 버전으로 지운다 — 새 라우팅에는 없다", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { unmount } = render(<RoutingForm sheet={sheet} processes={processes} />);
    fireEvent.click(screen.getByRole("button", { name: "라우팅 지우기" }));
    expect(confirm).toHaveBeenCalledWith("이 라우팅을 지울까요? 고친 이력은 남습니다");
    expect(h.del).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "라우팅 지우기" })));
    await waitFor(() => expect(h.del).toHaveBeenCalledWith("SF-0002", "1700000000000"));
    unmount();

    render(<RoutingForm sheet={{ ...sheet, version: null, steps: [], materials: [] }} processes={processes} />);
    expect(screen.queryByRole("button", { name: "라우팅 지우기" })).toBeNull();
    // 새 라우팅은 빈 줄 하나로 연다.
    expect(screen.getByLabelText("10 줄 공정")).toHaveValue("");
  });
});
