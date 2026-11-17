// 기록 보호의 규칙 — 두 훅이 같이 쓴다.
//
//   protect-records.mjs        Claude 가 고치기 도구(Edit · Write · MultiEdit)로 파일을 고치기 직전에 막는다.
//   check-records-on-stop.mjs  Claude 가 한 차례 일을 마칠 때, 어떤 길로 고쳤든(셸 명령 포함) 바뀐 내용을 다시 본다.
//
// CLAUDE.md 「작업 방식」 · ADR 0024: 머지된 조각의 요구사항 · 설계, ADR, 감사 기록은 기록이라 글자를 고치지 않고
// 새 항목 · 대체 ADR 로 잇는다. 「머지된」은 기본 가지에 이미 있는 줄로 가린다 — 이 가지가 새로 더한 줄은
// 아직 기록이 아니라 막지 않는다.
//
//   덧붙임만 — 기본 가지에 있는 줄은 그대로 남아야 한다. 새 줄을 더하는 것은 된다.
//   손대지 않음 — 기본 가지에 있는 파일은 어떤 고침도 막는다.

export const RULES = [
  {
    mode: "append",
    test: /^docs\/adr\/[^/]+\.md$/,
    what: "ADR",
    how: "새 ADR(대체 ADR)을 쓰거나, 이 ADR 끝에 날짜를 박은 새 항목을 덧붙인다.",
  },
  {
    mode: "append",
    test: /^docs\/slices\/[^/]+\/(requirements|design)\.md$/,
    what: "머지된 조각의 요구사항 · 설계",
    how: "있는 줄은 두고, 날짜를 박은 새 항목을 덧붙인다.",
  },
  {
    mode: "frozen",
    test: /^\.claude\/audits\//,
    what: "감사 기록",
    how: "감사 기록은 그대로 두고, 부적합 대장(docs/audit/nc-ledger.md)의 판정으로 잇는다.",
  },
  {
    mode: "frozen",
    test: /^AGENTS\.md$/,
    what: "Next.js 가 쓰고 고치는 안내(AGENTS.md)",
    how: "손으로 고치지 않는다 — Next.js 가 다시 쓴다.",
  },
  {
    mode: "frozen",
    test: /^drizzle\/([^/]+\.sql|meta\/[^/]+_snapshot\.json)$/,
    what: "이미 올라간 마이그레이션",
    how: "데모 DB 에 이미 적용됐을 수 있다 — 스키마를 고치고 `npm run db:generate` 로 새 마이그레이션을 만든다.",
  },
];

export const ruleFor = (rel) => RULES.find((r) => r.test.test(rel));

export const lines = (text) => text.replace(/\r\n/g, "\n").split("\n");

// 기본 가지의 줄이 모두, 같은 차례로 남아 있나 — 처음으로 사라진 줄의 번호(1부터)를 돌려준다. 다 남았으면 0.
// 파일 끝의 빈 줄은 덧붙일 때 자리가 바뀌므로 견주지 않는다.
export function firstLostLine(baseText, nextText) {
  const base = lines(baseText);
  while (base.length && base[base.length - 1] === "") base.pop();
  const next = lines(nextText);
  let at = 0;
  for (let i = 0; i < base.length; i++) {
    const found = next.indexOf(base[i], at);
    if (found === -1) return { line: i + 1, text: base[i] };
    at = found + 1;
  }
  return null;
}

export const headline = (rel, rule) =>
  `기록 보호: ${rel} 은(는) ${rule.what}(이)라 기본 가지에 머지된 내용을 고치지 않는다(CLAUDE.md 「작업 방식」 · ADR 0024).`;
