// 기록 보호의 마무리 검사 — Claude 가 한 차례 일을 마칠 때 돈다(.claude/settings.json 의 Stop 훅).
//
// protect-records.mjs 는 고치기 도구만 본다. 셸 명령(sed · 리다이렉트 · git checkout 따위)으로 고친 기록은 그 훅을 지나간다.
// 이 검사는 어떤 길로 고쳤든, 기본 가지와 갈라진 자리(머지 베이스)에 견준 지금의 파일(커밋 · 커밋 안 함 모두)을
// records-rules.mjs 의 규칙에 대어 본다.
//
// 걸리면 Claude 가 일을 마치지 못하고 까닭을 받아 되돌리거나 저자에게 묻는다. 그러고도 남아 있으면(두 번째로 마칠 때)
// 더 막지 않고 저자의 화면에 알림을 띄운다 — 끝없이 막혀 도는 것을 피한다.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { firstLostLine, headline, ruleFor } from "./records-rules.mjs";

let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  // 입력이 없어도 검사는 한다
}

const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const git = (args) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });

// 기본 가지와 갈라진 자리. 기본 가지가 앞서 나갔어도 그쪽의 새 줄을 「이 가지가 지웠다」로 잘못 읽지 않는다.
let base = null;
for (const ref of ["origin/main", "main"]) {
  try {
    base = git(["merge-base", "HEAD", ref]).trim();
    if (base) break;
  } catch {
    // 다음 이름으로
  }
}
if (!base) process.exit(0);

let changed = [];
try {
  changed = git(["diff", "--name-only", "-z", base]).split("\0").filter(Boolean);
} catch {
  process.exit(0);
}

const found = [];
for (const rel of changed) {
  const rule = ruleFor(rel);
  if (!rule) continue;

  let before;
  try {
    before = git(["show", `${base}:${rel}`]);
  } catch {
    continue; // 기본 가지에 없던 파일 — 아직 기록이 아니다
  }

  const abs = path.join(root, rel);
  if (!existsSync(abs)) {
    found.push(`- ${headline(rel, rule)} 파일이 지워졌다. ${rule.how}`);
    continue;
  }
  if (rule.mode === "frozen") {
    found.push(`- ${headline(rel, rule)} 내용이 바뀌었다. ${rule.how}`);
    continue;
  }
  const lost = firstLostLine(before, readFileSync(abs, "utf8"));
  if (lost) {
    found.push(
      `- ${headline(rel, rule)} 기본 가지의 ${lost.line}번째 줄이 바뀌거나 사라졌다: 「${lost.text.trim().slice(0, 80)}」. ${rule.how}`,
    );
  }
}

if (found.length === 0) process.exit(0);

const how =
  `되돌리는 법 — 그 파일을 갈라진 자리의 내용(\`git show ${base.slice(0, 7)}:<파일>\`)으로 돌려놓고, 이 가지가 더하려던 줄만 끝에 다시 덧붙인다. ` +
  "글자를 고쳐야 할 까닭이 있으면 고치지 말고 저자에게 묻는다.";

if (input.stop_hook_active) {
  process.stdout.write(
    JSON.stringify({
      systemMessage: `기록 보호(마무리 검사): 머지된 기록이 아직 고쳐진 채다 — 커밋 · 푸시 전에 확인하세요.\n${found.join("\n")}`,
    }),
  );
  process.exit(0);
}

process.stdout.write(
  JSON.stringify({
    decision: "block",
    reason: `기록 보호(마무리 검사): 셸 명령 등으로 머지된 기록을 고친 자리가 있다.\n${found.join("\n")}\n${how}`,
  }),
);
process.exit(0);
