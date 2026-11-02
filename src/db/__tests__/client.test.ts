import { describe, expect, it } from "vitest";
import { tlsFor } from "@/db/client";

describe("tlsFor", () => {
  it.each(["postgres://u:p@ep-x.us-east-1.aws.neon.tech/db?sslmode=disable", "postgres://u:p@db.example/erp"])(
    "바깥 DB 는 URL 이 무엇이라 하든 암호화하고 인증서를 확인한다 (%s)",
    (url) => expect(tlsFor(url)).toBe("verify-full"),
  );

  it.each(["postgres://u@localhost:5432/db", "postgres://u@127.0.0.1:5544/db", "postgres://u@[::1]/db"])(
    "내 컴퓨터의 DB 는 암호화하지 않는다 (%s)",
    (url) => expect(tlsFor(url)).toBe(false),
  );

  it("주소로 읽히지 않으면 암호화 쪽을 고른다", () => {
    expect(tlsFor("이건-주소가-아니다")).toBe("verify-full");
  });
});
