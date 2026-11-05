import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DbStatusView } from "@/components/db-status-view";

describe("DbStatusView", () => {
  it("「연결됨」과 DB 시각 · 마지막 되돌림을 한국 시간으로 보인다", () => {
    render(
      <DbStatusView
        status={{
          state: "connected",
          now: new Date("2026-11-02T03:04:05Z"),
          lastReset: new Date("2026-11-01T15:00:00Z"),
        }}
      />,
    );
    expect(screen.getByText("연결됨")).toBeInTheDocument();
    expect(screen.getByText(/DB 시각 2026년 11월 2일 .*12:04:05/)).toBeInTheDocument();
    // 정기 확인(health-check.yml)이 이 꼴을 읽는다 — 자정은 24:00 이 아니라 00:00.
    expect(screen.getByText(/^마지막 되돌림 2026-11-02 00:00 \(한국 시간\)/)).toBeInTheDocument();
  });

  it("샘플이 없으면 「없음」, 읽지 못했으면 「읽지 못함」 — 둘을 가른다(대장 NC-14)", () => {
    const now = new Date("2026-11-02T03:04:05Z");
    const { unmount } = render(<DbStatusView status={{ state: "connected", now, lastReset: "none" }} />);
    expect(screen.getByText(/^마지막 되돌림 없음 — 샘플 데이터가 들어 있지 않습니다/)).toBeInTheDocument();
    unmount();
    render(<DbStatusView status={{ state: "connected", now, lastReset: "unreadable" }} />);
    expect(screen.getByText(/^마지막 되돌림 읽지 못함 — .*「마지막 되돌림 조회 실패」/)).toBeInTheDocument();
  });

  it("닿지 못하면 「연결 안 됨」과 다음에 할 일을 보인다", () => {
    render(<DbStatusView status={{ state: "unreachable" }} />);
    expect(screen.getByText("연결 안 됨")).toBeInTheDocument();
    expect(screen.getByText(/DB에 닿지 못했습니다/)).toBeInTheDocument();
  });

  it("값이 없으면 「연결 안 됨」과 설정할 자리를 보인다", () => {
    render(<DbStatusView status={{ state: "unset" }} />);
    expect(screen.getByText("연결 안 됨")).toBeInTheDocument();
    expect(screen.getByText(/DATABASE_URL/)).toBeInTheDocument();
  });
});
