import { describe, expect, it } from "vitest";
import {
  addWeeks,
  isEditableWeek,
  isMonday,
  isoWeekOf,
  mondayOf,
  pageStartOf,
  pageStarts,
  pageWeeks,
  thisWeekOf,
  weekLabel,
  weekRange,
} from "../weeks";

const THIS = "2026-11-16";

describe("mondayOf", () => {
  it("그 날이 든 주의 월요일을 준다", () => {
    expect(mondayOf("2026-11-19")).toBe("2026-11-16");
    expect(mondayOf("2026-11-22")).toBe("2026-11-16");
    expect(mondayOf("2026-11-23")).toBe("2026-11-23");
  });
});

describe("thisWeekOf — 한국 시각 경계", () => {
  it("한국 월요일 00:30(UTC 일요일)은 새 주다", () => {
    expect(thisWeekOf(new Date("2026-11-22T15:30:00Z"))).toBe("2026-11-23");
  });
  it("한국 일요일 23:59 는 지난 주다", () => {
    expect(thisWeekOf(new Date("2026-11-22T14:59:00Z"))).toBe("2026-11-16");
  });
});

describe("weekLabel · isoWeekOf", () => {
  it("같은 해는 주 번호만", () => {
    expect(weekLabel("2026-11-16", THIS)).toBe("47주");
    expect(weekLabel("2026-12-28", THIS)).toBe("53주");
  });
  it("해가 다르면 해를 붙인다", () => {
    expect(weekLabel("2027-01-04", THIS)).toBe("2027년 1주");
    expect(weekLabel("2026-12-28", "2027-01-04")).toBe("2026년 53주");
  });
  it("ISO 주", () => {
    expect(isoWeekOf("2026-12-28")).toEqual({ year: 2026, week: 53 });
    expect(isoWeekOf("2027-01-04")).toEqual({ year: 2027, week: 1 });
    expect(isoWeekOf("2024-12-30")).toEqual({ year: 2025, week: 1 });
  });
});

describe("weekRange", () => {
  it("월 · 일을 두 자리로", () => {
    expect(weekRange("2026-11-16")).toBe("11/16~11/22");
    expect(weekRange("2026-12-28")).toBe("12/28~01/03");
  });
});

describe("isEditableWeek", () => {
  it("이번 주 ~ 51주 뒤만", () => {
    expect(isEditableWeek("2026-11-09", THIS)).toBe(false);
    expect(isEditableWeek(THIS, THIS)).toBe(true);
    expect(isEditableWeek(addWeeks(THIS, 51), THIS)).toBe(true);
    expect(isEditableWeek(addWeeks(THIS, 52), THIS)).toBe(false);
  });
});

describe("isMonday", () => {
  it("달력에 있는 월요일만", () => {
    expect(isMonday("2026-11-17")).toBe(false);
    expect(isMonday("2026-02-30")).toBe(false);
    expect(isMonday("2026-11-16")).toBe(true);
    expect(isMonday("abc")).toBe(false);
  });
});

describe("쪽", () => {
  it("pageStarts 는 8개", () => {
    const s = pageStarts(THIS);
    expect(s).toHaveLength(8);
    expect(s[0]).toBe(addWeeks(THIS, -52));
    expect(s[4]).toBe(THIS);
    expect(s[7]).toBe(addWeeks(THIS, 39));
  });
  it("pageStartOf", () => {
    expect(pageStartOf(undefined, THIS)).toBe(THIS);
    expect(pageStartOf("2026-11-17", THIS)).toBe(THIS);
    expect(pageStartOf(addWeeks(THIS, -52), THIS)).toBe(addWeeks(THIS, -52));
    expect(pageStartOf(addWeeks(THIS, 52), THIS)).toBe(THIS);
  });
  it("pageWeeks 는 13개", () => {
    const w = pageWeeks(THIS);
    expect(w).toHaveLength(13);
    expect(w[12]).toBe(addWeeks(THIS, 12));
  });
});
