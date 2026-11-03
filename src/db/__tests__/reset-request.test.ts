// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleResetRequest } from "@/db/reset-request";

const counts = { items: 10, warehouses: 4, partners: 5, codes: 9, code_groups: 3 };
const env = { cronSecret: "s3cret-value", databaseUrl: "postgres://u:p@db.example/erp" };

describe("되돌림의 입구 — 비밀값을 가진 요청만", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["머리글 없음", null, env],
    ["틀린 비밀값", "Bearer wrong", env],
    ["Bearer 없이 비밀값만", "s3cret-value", env],
    ["앞뒤가 붙은 비밀값", "Bearer s3cret-value-x", env],
    ["서버에 비밀값이 설정되지 않음", "Bearer ", { ...env, cronSecret: "" }],
    ["서버에 비밀값이 없음(undefined)", "Bearer undefined", { ...env, cronSecret: undefined }],
  ])("%s → 401, DB 에 닿지 않는다", async (_name, auth, e) => {
    const reset = vi.fn();
    const res = await handleResetRequest(auth, e, reset);
    expect(res.status).toBe(401);
    expect(reset).not.toHaveBeenCalled();
  });

  it("맞는 비밀값 → 되돌리고 테이블마다 행 수를 돌려준다", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const reset = vi.fn().mockResolvedValue(counts);
    const res = await handleResetRequest("Bearer s3cret-value", env, reset);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, counts });
    expect(reset).toHaveBeenCalledWith(env.databaseUrl);
    expect(log).toHaveBeenCalledWith("되돌림 완료: items 10 · warehouses 4 · partners 5 · codes 9 · code_groups 3");
  });

  it("DB 주소가 없으면 503", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await handleResetRequest("Bearer s3cret-value", { ...env, databaseUrl: undefined }, vi.fn());
    expect(res.status).toBe(503);
  });

  it("DB 서버가 거절해도 로그에 서버의 메시지(행의 값)는 남지 않는다 — 코드 · 등급 · 스키마의 이름만", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const server = Object.assign(new Error('value too long: "방문자가넣은글자"'), {
      code: "23514",
      severity: "ERROR",
      table_name: "items",
      constraint_name: "items_name_length",
    });
    const wrapped = Object.assign(new Error("Failed query"), { cause: server });
    const res = await handleResetRequest("Bearer s3cret-value", env, vi.fn().mockRejectedValue(wrapped));
    expect(res.status).toBe(500);
    expect(log).toHaveBeenCalledWith("되돌림 실패: DB 질의 실패: 23514 ERROR table=items constraint=items_name_length");
    expect(JSON.stringify(log.mock.calls)).not.toContain("방문자가넣은글자");
  });

  it("연결이 실패하면 500 — 로그에는 오류 코드만, 접속 정보 · 비밀값은 남기지 않는다", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = Object.assign(new Error("connect ECONNREFUSED postgres://u:p@db.example/erp"), {
      code: "ECONNREFUSED",
    });
    const res = await handleResetRequest("Bearer s3cret-value", env, vi.fn().mockRejectedValue(failure));
    expect(res.status).toBe(500);
    expect(log).toHaveBeenCalledWith("되돌림 실패: DB 연결 실패: ECONNREFUSED");
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain("s3cret");
    expect(logged).not.toContain("u:p@");
    expect(JSON.stringify(await res.json())).not.toContain("ECONNREFUSED");
  });
});
