import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BomChangeEntry } from "@/db/boms";
import { BomHistory } from "../bom-history";

// 한 BOM 화면의 고친 이력 표(조각 「BOM」 PR C, 성공 기준 16) — 구분 · 내용의 글과, 일시는 한 저장의 첫 줄에만(같은 분의 두 저장은 갈린다).

const entry = (over: Partial<BomChangeEntry>): BomChangeEntry => ({
  id: 1,
  savedAt: "2026-11-13 17:16",
  saveKey: "2026-11-13 08:16:30.1+00",
  kind: "LINE_EDIT",
  before: {},
  after: {},
  ...over,
});

describe("고친 이력 표", () => {
  it("구분마다 내용 — 고침은 전 → 후(단위 · %), 더함은 그 줄의 칸, 기준수량은 부모 단위, 빈 종료일은 「계속」", () => {
    render(
      <BomHistory
        unit="EA"
        history={{
          total: 3,
          entries: [
            entry({
              id: 3,
              child: { code: "RM-0003", name: "금 와이어", unit: "M" },
              lineNo: 2,
              before: { qty: "12", lossRate: "3", validTo: "2026-12-31" },
              after: { qty: "13", lossRate: "3.5", validTo: "" },
            }),
            entry({
              id: 2,
              kind: "LINE_ADD",
              child: { code: "SM-0002", name: "방습백", unit: "EA" },
              lineNo: 4,
              after: { qty: "1", lossRate: "0", validFrom: "2026-01-01", validTo: "", note: "릴마다" },
            }),
            entry({ id: 1, kind: "BASE", before: { baseQty: "1,000" }, after: { baseQty: "2,500" } }),
          ],
        }}
      />,
    );
    const rows = within(screen.getByRole("region", { name: "고친 이력 표" }))
      .getAllByRole("row")
      .slice(1);
    expect(rows.map((r) => r.textContent)).toEqual([
      "2026-11-13 17:16줄 고침줄 2RM-0003 금 와이어소요량 12 M → 13 M · 로스율 3% → 3.5% · 적용 종료일 2026-12-31 → 계속",
      "줄 더함줄 4SM-0002 방습백소요량 1 EA · 로스율 0% · 2026-01-01 ~ · 비고 릴마다",
      "기준수량 고침기준수량 1,000 EA → 2,500 EA",
    ]);
  });

  it("수량은 이력에 남은 그때의 단위로 — 품목의 지금 단위가 바뀌었어도(PR C 리뷰 1회차)", () => {
    render(
      <BomHistory
        unit="KG"
        history={{
          total: 2,
          entries: [
            entry({
              id: 2,
              kind: "LINE_DEL",
              child: { code: "RM-0003", name: "금 와이어", unit: "KG" },
              lineNo: 2,
              before: { qty: "12", lossRate: "3", validFrom: "2026-05-17", validTo: "", note: "", unit: "M" },
            }),
            entry({ id: 1, kind: "BOM_DEL", saveKey: "a", before: { baseQty: "1,000", unit: "EA" } }),
          ],
        }}
      />,
    );
    const rows = within(screen.getByRole("region", { name: "고친 이력 표" }))
      .getAllByRole("row")
      .slice(1);
    expect(rows[0].textContent).toContain("소요량 12 M");
    expect(rows[1].textContent).toContain("기준수량 1,000 EA");
    expect(rows[1].textContent).not.toContain("unit");
  });

  it("같은 분의 두 저장은 일시가 두 번 보인다", () => {
    render(
      <BomHistory
        unit="EA"
        history={{
          total: 2,
          entries: [
            entry({ id: 2, kind: "BASE", saveKey: "b", before: { baseQty: "1" }, after: { baseQty: "2" } }),
            entry({ id: 1, kind: "BOM_ADD", saveKey: "a", after: { baseQty: "1" } }),
          ],
        }}
      />,
    );
    expect(screen.getAllByText("2026-11-13 17:16")).toHaveLength(2);
  });

  it("이력이 없으면 그렇다고 적고, 100줄을 넘으면 몇 줄 가운데인지 적는다", () => {
    const { rerender } = render(<BomHistory unit="EA" history={{ total: 0, entries: [] }} />);
    expect(screen.getByText("아직 고친 이력이 없습니다.")).toBeInTheDocument();
    rerender(<BomHistory unit="EA" history={{ total: 250, entries: [entry({})] }} />);
    expect(screen.getByText(/250줄 가운데 100줄/)).toBeInTheDocument();
  });
});
