// 기록 보호 — Claude 가 파일을 고치기 직전에 돈다(.claude/settings.json 의 PreToolUse 훅).
//
// CLAUDE.md 「작업 방식」 · ADR 0024: 머지된 조각의 요구사항 · 설계, ADR, 감사 기록은 기록이라 글자를 고치지 않고
// 새 항목 · 대체 ADR 로 잇는다. 「머지된」은 기본 가지(origin/main)에 이미 있는 줄로 가린다 — 이 가지가 새로 더한 줄은
// 아직 기록이 아니라 막지 않는다.
//
//   덧붙임만 — 기본 가지에 있는 줄은 그대로 남아야 한다. 새 줄을 더하는 것은 된다.
//   손대지 않음 — 기본 가지에 있는 파일은 어떤 고침도 막는다.
//
// 막는 것은 Edit · Write 도구뿐이다. 셸 명령으로 고치는 것은 보지 못한다.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const RULES = [
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

function allow() {
  process.exit(0);
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

const lines = (text) => text.replace(/\r\n/g, "\n").split("\n");

// 기본 가지의 줄이 모두, 같은 차례로 남아 있나 — 처음으로 사라진 줄의 번호(1부터)를 돌려준다. 다 남았으면 0.
function firstLostLine(base, next) {
  let at = 0;
  for (let i = 0; i < base.length; i++) {
    const found = next.indexOf(base[i], at);
    if (found === -1) return i + 1;
    at = found + 1;
  }
  return 0;
}

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  allow();
}

const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const filePath = input.tool_input?.file_path;
if (!filePath) allow();

const rel = path.relative(root, path.resolve(root, filePath)).split(path.sep).join("/");
const rule = RULES.find((r) => r.test.test(rel));
if (!rule) allow();

// 기본 가지에 있는 내용. 없으면(이 가지가 새로 만든 파일) 아직 기록이 아니다.
let base = null;
for (const ref of ["origin/main", "main"]) {
  try {
    base = execFileSync("git", ["show", `${ref}:${rel}`], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
    break;
  } catch {
    // 다음 이름으로
  }
}
if (base === null) allow();

const head = `기록 보호: ${rel} 은(는) ${rule.what}(이)라 기본 가지에 머지된 내용을 고치지 않는다(CLAUDE.md 「작업 방식」 · ADR 0024).`;

if (rule.mode === "frozen") deny(`${head} ${rule.how}`);

// 덧붙임만 — 고친 뒤의 내용을 지어 기본 가지의 줄이 다 남는지 본다.
let next;
const tool = input.tool_input;
if (typeof tool.content === "string") {
  next = tool.content;
} else {
  // Edit 는 고침 하나를, MultiEdit 는 고침 여럿(edits)을 차례로 넣는다.
  const edits = Array.isArray(tool.edits) ? tool.edits : [tool];
  const abs = path.resolve(root, filePath);
  if (!existsSync(abs)) allow();
  next = readFileSync(abs, "utf8");
  for (const edit of edits) {
    if (typeof edit?.old_string !== "string" || typeof edit?.new_string !== "string") allow();
    if (!next.includes(edit.old_string)) allow(); // 도구가 스스로 실패한다
    next = edit.replace_all
      ? next.split(edit.old_string).join(edit.new_string)
      : next.replace(edit.old_string, () => edit.new_string);
  }
}

const baseLines = lines(base);
// 파일 끝의 빈 줄은 덧붙일 때 자리가 바뀌므로 견주지 않는다.
while (baseLines.length && baseLines[baseLines.length - 1] === "") baseLines.pop();
const lost = firstLostLine(baseLines, lines(next));
if (lost === 0) allow();

const shown = baseLines[lost - 1].trim().slice(0, 80);
deny(
  `${head} 기본 가지의 ${lost}번째 줄이 바뀌거나 사라진다: 「${shown}」. ${rule.how} 새 줄을 더하기만 하는 고침은 막지 않는다.`,
);
