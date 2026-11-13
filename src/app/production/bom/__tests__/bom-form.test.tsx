import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BomItemOption, BomSheet, SubBom } from "@/db/boms";
import { bomTreeValues, isUntouchedNewBom } from "@/lib/bom-input";
import { BomForm } from "../bom-form";

// BOM 등록의 한 화면 다단계(조각 「BOM」 PR C, 성공 기준 15) — 반제품 줄을 펼치면 그 BOM 이 그 줄 아래에 열리고, 접어도 값은 함께 보내진다.
// 저장 · 펼칠 BOM 읽기는 서버 동작이라 흉내 낸다 — 보내는 칸(서버가 읽는 이름)과 거절의 까닭이 그 BOM 에 붙는지를 본다.

const h = vi.hoisted(() => ({ save: vi.fn(), open: vi.fn() }));
vi.mock("../actions", () => ({
  saveBomTreeAction: h.save,
  openSubBomAction: h.open,
  deleteBomAction: vi.fn(),
}));

const item = (code: string, name: string, itemType: string, unit = "EA"): BomItemOption => ({
  code,
  name,
  spec: "",
  itemType,
  unit,
  decimals: unit === "EA" ? 0 : 3,
  active: true,
});
const options = [
  item("SF-0002", "몰딩 완료품", "SF"),
  item("RM-0003", "금 와이어", "RM", "M"),
  item("SM-0002", "방습백", "SM"),
];

const sheetLine = (
  lineNo: number,
  childCode: string,
  childName: string,
  childType: string,
  qty: string,
  unit = "EA",
) => ({
  lineNo,
  childCode,
  childName,
  childType,
  unit,
  active: true,
  qty,
  lossRate: "0",
  validFrom: "2026-05-17",
  validTo: "",
  note: "",
});

const root: BomSheet = {
  parent: item("FG-0001", "전원 관리 IC", "FG"),
  version: "1000",
  baseQty: "2500",
  lines: [sheetLine(1, "SF-0002", "몰딩 완료품", "SF", "2500"), sheetLine(2, "SM-0002", "방습백", "SM", "1")],
};
const sub: SubBom = {
  sheet: {
    parent: item("SF-0002", "몰딩 완료품", "SF"),
    version: "2000",
    baseQty: "1000",
    lines: [sheetLine(1, "RM-0003", "금 와이어", "RM", "12", "M")],
  },
  usedBy: [
    { code: "FG-0001", name: "전원 관리 IC" },
    { code: "FG-0002", name: "센서 IC" },
  ],
};

/** 「저장」으로 보낸 칸을 서버가 읽는 꼴로. */
function sentValues() {
  const form = h.save.mock.calls.at(-1)![1] as FormData;
  return bomTreeValues(form);
}

beforeEach(() => {
  h.save.mockReset().mockResolvedValue(null);
  h.open.mockReset().mockResolvedValue({ ok: true, sub });
});

describe("반제품 줄 펼치기", () => {
  it("반제품 줄에만 「펼치기」가 있고, 누르면 그 줄 아래에 그 반제품의 BOM 과 그것을 쓰는 다른 BOM 이 보인다", async () => {
    render(<BomForm sheet={root} childOptions={options} today="2026-11-13" />);
    expect(screen.getByRole("button", { name: "SF-0002 BOM 펼치기" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "SM-0002 BOM 펼치기" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "SF-0002 BOM 펼치기" }));
    expect(h.open).toHaveBeenCalledWith("SF-0002");
    await screen.findByText(/몰딩 완료품의 BOM/);
    expect(screen.getByLabelText("SF-0002 줄 1 소요량")).toHaveValue("12");
    // 지금 BOM(전원 관리 IC)은 빼고 다른 BOM 만 — 여기서 고치면 그 BOM 에도 바뀐다고 알린다.
    expect(screen.getByText(/이 반제품을 쓰는 다른 BOM/).textContent).toContain("FG-0002 센서 IC");
    expect(screen.getByText(/이 반제품을 쓰는 다른 BOM/).textContent).not.toContain("FG-0001");
  });

  it("저장하면 맨 위 BOM 과 펼친 BOM 을 함께 보낸다 — 줄의 원래 번호까지, 접어도 펼친 BOM 은 보내진다", async () => {
    render(<BomForm sheet={root} childOptions={options} today="2026-11-13" />);
    fireEvent.click(screen.getByRole("button", { name: "SF-0002 BOM 펼치기" }));
    await screen.findByText(/몰딩 완료품의 BOM/);
    fireEvent.change(screen.getByLabelText("SF-0002 줄 1 소요량"), { target: { value: "13" } });
    fireEvent.click(screen.getByRole("button", { name: "SF-0002 BOM 접기" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "저장" })));
    await waitFor(() => expect(h.save).toHaveBeenCalled());
    const sent = sentValues();
    expect(sent.root).toMatchObject({ parent: "FG-0001", version: "1000", baseQty: "2500" });
    expect(sent.root.lines.map((l) => [l.lineNo, l.child])).toEqual([
      ["1", "SF-0002 몰딩 완료품"],
      ["2", "SM-0002 방습백"],
    ]);
    expect(sent.subs).toEqual([
      {
        parent: "SF-0002",
        version: "2000",
        baseQty: "1000",
        lines: [
          {
            lineNo: "1",
            child: "RM-0003 금 와이어",
            qty: "13",
            lossRate: "0",
            validFrom: "2026-05-17",
            validTo: "",
            note: "",
          },
        ],
      },
    ]);
  });

  it("반제품 줄을 지우면 펼친 BOM 도 보내지 않는다 — 새 줄에는 원래 번호가 없다", async () => {
    render(<BomForm sheet={root} childOptions={options} today="2026-11-13" />);
    fireEvent.click(screen.getByRole("button", { name: "SF-0002 BOM 펼치기" }));
    await screen.findByText(/몰딩 완료품의 BOM/);
    fireEvent.click(screen.getByRole("button", { name: "줄 1 지우기" }));
    fireEvent.click(screen.getByRole("button", { name: "줄 더하기" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "저장" })));
    const sent = sentValues();
    expect(sent.subs).toEqual([]);
    expect(sent.root.lines.map((l) => l.lineNo)).toEqual(["2", undefined]);
  });

  it("BOM 이 없는 반제품을 펼쳐 보기만 하면, 보내는 칸은 서버가 건너뛰는 「넣지 않은 새 BOM」이다(PR C 리뷰 1회차)", async () => {
    h.open.mockResolvedValue({
      ok: true,
      sub: { sheet: { ...sub.sheet, version: null, baseQty: "", lines: [] }, usedBy: [] },
    });
    render(<BomForm sheet={root} childOptions={options} today="2026-11-13" />);
    fireEvent.click(screen.getByRole("button", { name: "SF-0002 BOM 펼치기" }));
    await screen.findByText(/몰딩 완료품의 새 BOM/);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "저장" })));
    const sent = sentValues();
    // 화면은 새 줄에 오늘을 미리 채운다 — 그래도 넣지 않은 것으로 친다.
    expect(sent.subs[0].lines[0].validFrom).toBe("2026-11-13");
    expect(isUntouchedNewBom(sent.subs[0])).toBe(true);
  });

  it("거절되면 틀린 펼친 BOM 을 열어 그 줄에 까닭을 보이고, 위 알림에 그 BOM 을 적는다", async () => {
    h.save.mockResolvedValue({
      ok: false,
      errors: { header: {}, lines: {} },
      subs: { "SF-0002": { errors: { header: {}, lines: { 0: { child: "소모품은 BOM 에 넣지 않습니다" } } } } },
      values: { root: { lines: [] }, subs: [] },
    });
    render(<BomForm sheet={root} childOptions={options} today="2026-11-13" />);
    fireEvent.click(screen.getByRole("button", { name: "SF-0002 BOM 펼치기" }));
    await screen.findByText(/몰딩 완료품의 BOM/);
    fireEvent.click(screen.getByRole("button", { name: "SF-0002 BOM 접기" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "저장" })));
    expect(await screen.findByText("소모품은 BOM 에 넣지 않습니다")).toBeVisible();
    expect(screen.getByRole("button", { name: "SF-0002 BOM 접기" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("alert").textContent).toContain("펼친 BOM SF-0002 몰딩 완료품");
  });

  it("펼칠 BOM 을 읽지 못하면 그 자리에 까닭이 보인다", async () => {
    h.open.mockResolvedValue({ ok: false, message: "불러오지 못했습니다 — 잠시 뒤 다시 누르세요" });
    render(<BomForm sheet={root} childOptions={options} today="2026-11-13" />);
    fireEvent.click(screen.getByRole("button", { name: "SF-0002 BOM 펼치기" }));
    expect(await screen.findByText(/불러오지 못했습니다/)).toBeInTheDocument();
  });
});
