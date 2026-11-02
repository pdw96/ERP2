import { afterEach, describe, expect, it, vi } from "vitest";
import { checkDatabase } from "@/db/status";

describe("checkDatabase", () => {
  afterEach(() => vi.restoreAllMocks());

  it("닿으면 DB 의 현재 시각과 함께 「연결됨」", async () => {
    const now = new Date("2026-11-02T03:04:05Z");
    const probe = vi.fn().mockResolvedValue(now);
    expect(await checkDatabase("postgres://u:p@db.example/erp", probe)).toEqual({ state: "connected", now });
    expect(probe).toHaveBeenCalledWith("postgres://u:p@db.example/erp");
  });

  it("닿지 못하면 「닿지 못함」 — 오류를 밖으로 던지지 않고, 접속 문자열을 로그에 남기지 않는다", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    const probe = vi.fn().mockRejectedValue(failure);
    expect(await checkDatabase("postgres://u:secret@db.example/erp", probe)).toEqual({ state: "unreachable" });
    expect(log).toHaveBeenCalledWith("DB 연결 실패: ECONNREFUSED");
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
  });

  it("감싼 오류면 안쪽 원인 코드를 남긴다", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const wrapped = Object.assign(new Error("Failed query"), { cause: { code: "ENOTFOUND" } });
    expect(await checkDatabase("postgres://db.example/erp", vi.fn().mockRejectedValue(wrapped))).toEqual({
      state: "unreachable",
    });
    expect(log).toHaveBeenCalledWith("DB 연결 실패: ENOTFOUND");
  });

  it.each([undefined, ""])("값이 없으면(%s) 묻지 않고 「설정 없음」", async (url) => {
    const probe = vi.fn();
    expect(await checkDatabase(url, probe)).toEqual({ state: "unset" });
    expect(probe).not.toHaveBeenCalled();
  });

  it("형식이 틀린 값이면 실제 드라이버로 물어도 「닿지 못함」", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await checkDatabase("이건-주소가-아니다")).toEqual({ state: "unreachable" });
  });
});
