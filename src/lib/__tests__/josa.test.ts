import { describe, expect, it } from "vitest";
import { eul, eun } from "@/lib/josa";

describe("조사", () => {
  it.each([
    ["품명", "품명을", "품명은"],
    ["안전재고", "안전재고를", "안전재고는"],
    ["센서 IC", "센서 IC를", "센서 IC는"],
    ["금 와이어", "금 와이어를", "금 와이어는"],
  ])("%s", (word, a, b) => {
    expect(eul(word)).toBe(a);
    expect(eun(word)).toBe(b);
  });
});
