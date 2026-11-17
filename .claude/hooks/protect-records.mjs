// 기록 보호 — Claude 가 파일을 고치기 직전에 돈다(.claude/settings.json 의 PreToolUse 훅).
//
// 무엇을 지키는지(규칙)는 records-rules.mjs 가 든다. 이 훅은 고치기 도구(Edit · Write · MultiEdit)만 본다 —
// 셸 명령으로 고친 것은 일을 마칠 때 도는 check-records-on-stop.mjs 가 잡는다.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { firstLostLine, headline, ruleFor } from "./records-rules.mjs";

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
const rule = ruleFor(rel);
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

const head = headline(rel, rule);

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

const lost = firstLostLine(base, next);
if (!lost) allow();

deny(
  `${head} 기본 가지의 ${lost.line}번째 줄이 바뀌거나 사라진다: 「${lost.text.trim().slice(0, 80)}」. ${rule.how} 새 줄을 더하기만 하는 고침은 막지 않는다.`,
);
