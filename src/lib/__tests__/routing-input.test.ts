import { describe, expect, it } from "vitest";
import {
  formatRunMs,
  parseRouting,
  parseRunSec,
  routingValues,
  seqOf,
  type RoutingStepValues,
  type RoutingValues,
} from "@/lib/routing-input";

// 라우팅의 꼴 검사 — DB 를 보지 않는 몫. DB 를 보는 몫은 src/db/__tests__/routings.test.ts.

const step = (over: RoutingStepValues = {}): RoutingStepValues => ({
  process: "DA",
  workCenter: "WB-1",
  setupMin: "10",
  runSec: "2.4",
  note: "",
  ...over,
});
const base = (over: Partial<RoutingValues> = {}): RoutingValues => ({
  item: "SF-0001",
  version: "",
  steps: [step()],
  materials: [],
  ...over,
});
const fail = (values: RoutingValues) => {
  const r = parseRouting(values);
  if (r.ok) throw new Error("통과하면 안 된다");
  return r;
};
const pass = (values: RoutingValues) => {
  const r = parseRouting(values);
  if (!r.ok) throw new Error(`통과해야 한다: ${JSON.stringify(r)}`);
  return r.value;
};

describe("개당 작업시간 글자", () => {
  it.each([
    ["2.4", 2400],
    ["0", 0],
    ["3600.000", 3_600_000],
    ["3600", 3_600_000],
    ["0.001", 1],
    ["12.34", 12_340],
  ])("「%s」 → %i 밀리초", (text, ms) => expect(parseRunSec(text)).toBe(ms));

  it.each(["", "1.2345", "-1", "+1", "3600.001", "3601", "1,000", "abc", "1.", ".5", " 1"])(
    "「%s」는 받지 않는다",
    (text) => expect(parseRunSec(text)).toBeNull(),
  );

  it("밀리초를 소수 셋째 자리까지 보인다", () => {
    expect(formatRunMs(2400)).toBe("2.400");
    expect(formatRunMs(0)).toBe("0.000");
    expect(formatRunMs(3_600_000)).toBe("3600.000");
    expect(formatRunMs(1)).toBe("0.001");
  });

  it("순번은 10 단위로 매긴다", () => {
    expect(seqOf(0)).toBe(10);
    expect(seqOf(4)).toBe(50);
  });
});

describe("라우팅 꼴 검사", () => {
  it("바른 값은 통과한다", () => {
    const v = pass(base({ version: "3" }));
    expect(v).toMatchObject({ itemCode: "SF-0001", version: "3" });
    expect(v.steps[0]).toMatchObject({
      index: 0,
      processCode: "DA",
      workCenterCode: "WB-1",
      setupMin: 10,
      runMs: 2400,
      note: "",
      origSeq: null,
    });
  });

  it("칸이 모두 빈 공정 줄은 없는 줄로 친다", () => {
    const v = pass(base({ steps: [{}, step()] }));
    expect(v.steps).toHaveLength(1);
    expect(v.steps[0].index).toBe(1);
  });

  it("공정 줄이 없으면 「공정 줄을 하나 이상 넣으세요」", () => {
    const r = fail(base({ steps: [{}] }));
    expect(r.formError).toBe("공정 줄을 하나 이상 넣으세요");
  });

  it("51줄이면 「라우팅 하나는 50줄까지입니다」", () => {
    const r = fail(base({ steps: Array.from({ length: 51 }, () => step()) }));
    expect(r.formError).toBe("라우팅 하나는 50줄까지입니다");
    expect(pass(base({ steps: Array.from({ length: 50 }, () => step()) })).steps).toHaveLength(50);
  });

  it("공정 · 작업장의 까닭", () => {
    const r = fail(
      base({
        steps: [step({ process: "", workCenter: "" }), step({ process: "da", workCenter: "x" })],
      }),
    );
    expect(r.errors.steps[0]).toEqual({ process: "공정을 고르세요", workCenter: "작업장을 고르세요" });
    expect(r.errors.steps[1].process).toBe("목록에서 공정을 고르세요");
    expect(r.errors.steps[1].workCenter).toBe("목록에서 작업장을 고르세요");
  });

  it("이름이 붙어 와도 공정 · 작업장 코드만 읽는다", () => {
    const v = pass(base({ steps: [step({ process: "DA 다이 본딩", workCenter: "WB-1 본딩 1호기" })] }));
    expect(v.steps[0]).toMatchObject({ processCode: "DA", workCenterCode: "WB-1" });
  });

  it.each(["1441", "1.5", "-1", ""])("준비시간 「%s」는 받지 않는다", (text) => {
    const r = fail(base({ steps: [step({ setupMin: text })] }));
    expect(r.errors.steps[0].setupMin).toBe("준비시간은 0 ~ 1,440 분의 정수입니다");
  });

  it("준비시간 0 · 1440 은 받는다", () => {
    expect(
      pass(base({ steps: [step({ setupMin: "0" }), step({ setupMin: "1440" })] })).steps.map((s) => s.setupMin),
    ).toEqual([0, 1440]);
  });

  it("개당 작업시간이 넘으면 까닭을 붙인다", () => {
    const r = fail(base({ steps: [step({ runSec: "3600.001" })] }));
    expect(r.errors.steps[0].runSec).toBe("개당 작업시간은 0 ~ 3,600 초입니다 — 소수 셋째 자리까지");
  });

  it("비고는 200자까지", () => {
    expect(pass(base({ steps: [step({ note: "가".repeat(200) })] })).steps).toHaveLength(1);
    const r = fail(base({ steps: [step({ note: "가".repeat(201) })] }));
    expect(r.errors.steps[0].note).toBe("비고는 200자까지입니다");
  });

  it("품목의 까닭과 이름 붙은 코드", () => {
    expect(fail(base({ item: "" })).errors.item).toBe("품목을 고르세요");
    expect(fail(base({ item: "XX-1" })).errors.item).toBe("목록에서 품목을 고르세요");
    expect(pass(base({ item: "SF-0001 다이 본딩 완료품" })).itemCode).toBe("SF-0001");
  });

  it("틀린 곳을 모두 모은다", () => {
    const r = fail(base({ item: "", steps: [step({ process: "" }), step({ setupMin: "x" })] }));
    expect(r.errors.item).toBeDefined();
    expect(Object.keys(r.errors.steps)).toEqual(["0", "1"]);
  });

  it.each([
    ["20", 20],
    ["abc", null],
    ["15", null],
    ["510", null],
    ["", null],
  ])("원래 순번 「%s」 → %s", (text, expected) => {
    expect(pass(base({ steps: [step({ origSeq: text })] })).steps[0].origSeq).toBe(expected);
  });

  it("원래 순번만 있는 줄은 빈 줄이다", () => {
    expect(fail(base({ steps: [{ origSeq: "10" }] })).formError).toBe("공정 줄을 하나 이상 넣으세요");
  });
});

describe("투입 자재", () => {
  const two = [step(), step({ process: "WB" })];

  it("붙이지 않은 자재(step 이 빈 글자)는 담지 않는다", () => {
    const v = pass(base({ steps: two, materials: [{ item: "RM-0003", step: "" }, { item: "RM-0004" }] }));
    expect(v.materials).toEqual([]);
  });

  it("붙인 자재는 줄의 차례를 가진다", () => {
    const v = pass(base({ steps: two, materials: [{ item: "RM-0003 웨이퍼", step: "1" }] }));
    expect(v.materials).toEqual([{ index: 0, itemCode: "RM-0003", stepPos: 1 }]);
  });

  it("빈 줄 뒤의 줄을 가리키면 stepPos 는 담긴 줄 안의 차례다", () => {
    const v = pass(base({ steps: [{}, step()], materials: [{ item: "RM-0003", step: "1" }] }));
    expect(v.materials[0].stepPos).toBe(0);
  });

  it("빈 줄이나 없는 차례를 가리키면 다시 고르게 한다", () => {
    const r = fail(
      base({
        steps: [{}, step()],
        materials: [
          { item: "RM-0003", step: "0" },
          { item: "RM-0004", step: "5" },
          { item: "RM-0005", step: "x" },
        ],
      }),
    );
    expect(r.errors.materials).toEqual({
      0: "투입 공정을 다시 고르세요",
      1: "투입 공정을 다시 고르세요",
      2: "투입 공정을 다시 고르세요",
    });
  });

  it("같은 자재가 두 번이면 뒤의 것에 까닭을 붙인다", () => {
    const r = fail(
      base({
        steps: two,
        materials: [
          { item: "RM-0003", step: "0" },
          { item: "RM-0003", step: "1" },
        ],
      }),
    );
    expect(r.errors.materials).toEqual({ 1: "같은 자재가 두 번 있습니다" });
  });

  it("품목 칸이 빈 자재 줄은 없는 줄로 친다", () => {
    const v = pass(
      base({
        materials: [
          { item: "", step: "0" },
          { item: "RM-0003", step: "0" },
        ],
      }),
    );
    expect(v.materials).toEqual([{ index: 1, itemCode: "RM-0003", stepPos: 0 }]);
  });

  it("자재 코드의 꼴이 틀리면 목록에서 고르게 한다", () => {
    const r = fail(base({ materials: [{ item: "XX", step: "0" }] }));
    expect(r.errors.materials[0]).toBe("목록에서 자재를 고르세요");
  });
});

describe("routingValues", () => {
  it("보낸 칸을 모으고 모르는 칸 · 상한 넘는 차례는 버린다", () => {
    const form = new FormData();
    form.set("item", "SF-0001");
    form.set("version", "2");
    form.set("steps.0.process", "DA");
    form.set("steps.0.foo", "x");
    form.set("steps.1.workCenter", "WB-1");
    form.set("steps.1.origSeq", "20");
    form.set("steps.999.process", "WB");
    form.set("steps.101.process", "WB");
    form.set("materials.0.item", "RM-0003");
    form.set("materials.0.step", "1");
    form.set("materials.0.foo", "x");
    form.set("materials.999.item", "RM-0009");
    const v = routingValues(form);
    expect(v.item).toBe("SF-0001");
    expect(v.version).toBe("2");
    expect(v.steps).toEqual([{ process: "DA" }, { workCenter: "WB-1", origSeq: "20" }]);
    expect(v.materials).toEqual([{ item: "RM-0003", step: "1" }]);
  });

  it("아무것도 없으면 빈 목록", () => {
    expect(routingValues(new FormData())).toEqual({ steps: [], materials: [] });
  });
});
