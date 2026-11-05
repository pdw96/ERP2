import { afterEach, describe, expect, it, vi } from "vitest";
import { checkDatabase, describeFailure, readLastReset } from "@/db/status";

describe("checkDatabase", () => {
  afterEach(() => vi.restoreAllMocks());

  it("닿으면 DB 의 현재 시각 · 마지막 되돌림 시각과 함께 「연결됨」", async () => {
    const now = new Date("2026-11-02T03:04:05Z");
    const lastReset = new Date("2026-11-01T19:00:02Z");
    const probe = vi.fn().mockResolvedValue({ now, lastReset });
    expect(await checkDatabase("postgres://u:p@db.example/erp", probe)).toEqual({ state: "connected", now, lastReset });
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

describe("readLastReset — 마지막 되돌림을 읽는다(대장 NC-14)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("시각이 있으면 그 시각, 샘플이 없으면 「none」", async () => {
    const at = new Date("2026-11-04T19:07:35Z");
    expect(await readLastReset(async () => at)).toBe(at);
    expect(await readLastReset(async () => null)).toBe("none");
  });

  it("테이블이 아직 없으면(42P01) 로그 없이 「none」", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const missing = Object.assign(new Error("Failed query"), {
      cause: { code: "42P01", severity: "ERROR", message: 'relation "code_groups" does not exist' },
    });
    expect(await readLastReset(() => Promise.reject(missing))).toBe("none");
    expect(log).not.toHaveBeenCalled();
  });

  it("그 밖의 까닭이면 「unreadable」 — 「샘플이 없다」로 적지 않고, 까닭을 로그에 한 줄 남긴다", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const timeout = Object.assign(new Error("Failed query"), {
      cause: { code: "57014", severity: "ERROR", message: "canceling statement due to statement timeout" },
    });
    expect(await readLastReset(() => Promise.reject(timeout))).toBe("unreadable");
    expect(log).toHaveBeenCalledWith(
      "마지막 되돌림 조회 실패: DB 질의 실패: 57014 ERROR canceling statement due to statement timeout",
    );
    const net = Object.assign(new Error("connect ECONNRESET 10.0.0.5:5432"), { code: "ECONNRESET" });
    expect(await readLastReset(() => Promise.reject(net))).toBe("unreadable");
    expect(log).toHaveBeenLastCalledWith("마지막 되돌림 조회 실패: DB 연결 실패: ECONNRESET");
  });
});

describe("describeFailure", () => {
  it("DB 서버가 돌려준 오류는 코드 · severity · 메시지를 남기고 「질의 실패」로 적는다", () => {
    const server = Object.assign(new Error("Your account or project has exceeded the compute time quota."), {
      name: "PostgresError",
      code: "XX000",
      severity: "ERROR",
    });
    expect(describeFailure(Object.assign(new Error("Failed query"), { cause: server }))).toBe(
      "DB 질의 실패: XX000 ERROR Your account or project has exceeded the compute time quota.",
    );
  });

  it("드라이버 · 네트워크 오류는 코드만 남기고 「연결 실패」로 적는다 — 메시지의 주소를 남기지 않는다", () => {
    const net = Object.assign(new Error("connect ECONNREFUSED 10.0.0.5:5432"), { code: "ECONNREFUSED" });
    expect(describeFailure(net)).toBe("DB 연결 실패: ECONNREFUSED");
  });

  it("코드가 없는 오류는 이름과 메시지를 남긴다 — 「Error」 · 「TypeError」 하나로 끝나지 않는다", () => {
    expect(describeFailure(new TypeError("Cannot read properties of undefined (reading 'now')"))).toBe(
      "DB 질의 실패: TypeError Cannot read properties of undefined (reading 'now')",
    );
  });

  it("메시지에 접속 문자열이 섞여 있으면 지운다", () => {
    const leak = new Error("bad url postgres://u:secret@db.example/erp given");
    expect(describeFailure(leak)).toBe("DB 질의 실패: Error bad url [접속 문자열] given");
  });

  it("던져진 것이 오류 객체가 아니어도 한 줄을 남긴다", () => {
    expect(describeFailure(undefined)).toBe("DB 질의 실패: unknown");
  });
});

describe("describeFailure — 코드만(방문자 데이터에 닿는 경로, 대장 NC-6)", () => {
  const visitor = "방문자가넣은글자";
  const server = Object.assign(new Error(`invalid input syntax for type integer: "${visitor}"`), {
    name: "PostgresError",
    code: "22P02",
    severity: "ERROR",
    table_name: "items",
    column_name: "lead_time_days",
  });

  it("서버 오류는 코드 · 등급과 스키마의 이름만 남기고 메시지(행의 값)는 남기지 않는다", () => {
    const line = describeFailure(Object.assign(new Error("Failed query"), { cause: server }), "code-only");
    expect(line).toBe("DB 질의 실패: 22P02 ERROR table=items column=lead_time_days");
    expect(line).not.toContain(visitor);
  });

  it("PGlite 꼴의 이름(table · constraint)도 읽는다", () => {
    const pg = {
      code: "23514",
      severity: "ERROR",
      message: `failing row contains (${visitor})`,
      table: "items",
      constraint: "items_name_length",
    };
    expect(describeFailure(pg, "code-only")).toBe("DB 질의 실패: 23514 ERROR table=items constraint=items_name_length");
  });

  it("코드가 없는 오류(코드의 버그 등)는 「처리 실패」와 이름만 남긴다 — DB 가 거절한 것으로 적지 않는다(대장 NC-12)", () => {
    expect(describeFailure(new TypeError(`bad ${visitor}`), "code-only")).toBe("처리 실패: TypeError");
  });

  it("네트워크 오류는 그대로 코드만", () => {
    expect(describeFailure(Object.assign(new Error("x"), { code: "ECONNREFUSED" }), "code-only")).toBe(
      "DB 연결 실패: ECONNREFUSED",
    );
  });
});
