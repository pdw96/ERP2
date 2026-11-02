import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DbStatusView } from "@/components/db-status-view";

describe("DbStatusView", () => {
  it("「연결됨」과 DB 시각을 한국 시간으로 보인다", () => {
    render(<DbStatusView status={{ state: "connected", now: new Date("2026-11-02T03:04:05Z") }} />);
    expect(screen.getByText("연결됨")).toBeInTheDocument();
    expect(screen.getByText(/DB 시각 2026년 11월 2일 .*12:04:05/)).toBeInTheDocument();
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
