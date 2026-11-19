import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RoutingChangeEntry } from "@/db/routings";
import { RoutingHistory } from "../routing-history";

// 라우팅 한 품목 화면의 고친 이력 표(메뉴 「라우팅」) — 저장마다 묶어 일시는 그 저장의 첫 줄에만, 구분 · 대상 · 내용의 글.

const entry = (over: Partial<RoutingChangeEntry>): RoutingChangeEntry => ({
  id: 1,
  savedAt: "2026-11-19 10:05",
  saveKey: "2026-11-19 01:05:30.1+00",
  kind: "STEP_EDIT",
  before: {},
  after: {},
  ...over,
});

const rowsText = () =>
  within(screen.getByRole("region", { name: "고친 이력 표" }))
    .getAllByRole("row")
    .slice(1)
    .map((r) => r.textContent);

describe("라우팅 고친 이력", () => {
  it("저장마다 묶어 보이고, 공정 고침은 「개당 시간(초) 2.400 → 2.000」 꼴", () => {
    render(
      <RoutingHistory
        history={{
          total: 6,
          entries: [
            entry({
              id: 6,
              seq: 10,
              before: { runSec: "2.400", note: "" },
              after: { runSec: "2.000", note: "금선 굵기 바뀜" },
            }),
            entry({
              id: 5,
              kind: "MAT_MOVE",
              material: { code: "RM-0003", name: "금 와이어" },
              before: { step: "10 WB 와이어 본딩" },
              after: { step: "20 MD 몰딩" },
            }),
            entry({
              id: 4,
              saveKey: "b",
              kind: "STEP_ADD",
              seq: 30,
              after: {
                seq: "30",
                process: "MK 마킹",
                workCenter: "MK-1 레이저 마킹 1호기",
                setupMin: "10",
                runSec: "0.080",
                note: "",
              },
            }),
            entry({
              id: 3,
              saveKey: "b",
              kind: "MAT_DEL",
              material: { code: "SM-0002", name: "방습백" },
              before: { step: "20 MD 몰딩" },
            }),
            entry({ id: 2, saveKey: "a", savedAt: "2026-11-18 09:00", kind: "ROUTING_ADD" }),
            entry({
              id: 1,
              saveKey: "a",
              savedAt: "2026-11-18 09:00",
              kind: "MAT_ADD",
              material: { code: "RM-0004", name: "몰딩 컴파운드" },
              after: { step: "20 MD 몰딩" },
            }),
          ],
        }}
      />,
    );
    expect(rowsText()).toEqual([
      "2026-11-19 10:05공정 고침순번 10개당 시간(초) 2.400 → 2.000 · 비고 (없음) → 금선 굵기 바뀜",
      "자재 옮김RM-0003 금 와이어투입 공정 10 WB 와이어 본딩 → 20 MD 몰딩",
      "2026-11-19 10:05공정 더함순번 30공정 MK 마킹 · 작업장 MK-1 레이저 마킹 1호기 · 준비시간(분) 10 · 개당 시간(초) 0.080",
      "자재 뗌SM-0002 방습백투입 공정 20 MD 몰딩",
      "2026-11-18 09:00라우팅 등록",
      "자재 붙임RM-0004 몰딩 컴파운드투입 공정 20 MD 몰딩",
    ]);
  });

  it("줄 옮김은 순번 고침으로 — 「순번 20 → 10」", () => {
    render(
      <RoutingHistory
        history={{ total: 1, entries: [entry({ seq: 10, before: { seq: "20" }, after: { seq: "10" } })] }}
      />,
    );
    expect(rowsText()[0]).toContain("순번 20 → 10");
  });

  it("칸은 화면의 칸 차례로 — 저장된 값의 칸 차례(jsonb)와 무관하게", () => {
    render(
      <RoutingHistory
        history={{
          total: 2,
          entries: [
            entry({
              id: 2,
              kind: "STEP_DEL",
              seq: 20,
              before: {
                seq: "20",
                note: "",
                runSec: "0.120",
                process: "MD 몰딩",
                setupMin: "30",
                workCenter: "MD-1 몰딩 1호기",
              },
            }),
            entry({
              id: 1,
              seq: 10,
              before: { runSec: "1.000", process: "WB 와이어 본딩" },
              after: { runSec: "2.000", process: "DA 다이 본딩" },
            }),
          ],
        }}
      />,
    );
    expect(rowsText()).toEqual([
      "2026-11-19 10:05공정 뺌순번 20공정 MD 몰딩 · 작업장 MD-1 몰딩 1호기 · 준비시간(분) 30 · 개당 시간(초) 0.120",
      "공정 고침순번 10공정 WB 와이어 본딩 → DA 다이 본딩 · 개당 시간(초) 1.000 → 2.000",
    ]);
  });

  it("빈 이력 글자, 100줄을 넘으면 몇 줄 가운데인지", () => {
    const { rerender } = render(<RoutingHistory history={{ total: 0, entries: [] }} />);
    expect(screen.getByText("고친 이력이 없습니다")).toBeInTheDocument();
    rerender(<RoutingHistory history={{ total: 1250, entries: [entry({})] }} />);
    expect(screen.getByText("최근 100줄만 보입니다(전체 1,250줄)")).toBeInTheDocument();
  });
});
