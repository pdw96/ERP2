// 고친 파일의 형식 맞추기 — Claude 가 고치기 도구(Edit · Write · MultiEdit)로 파일을 고친 직후에 돈다(.claude/settings.json 의 PostToolUse 훅).
//
// CI 의 첫 단계 「형식」(npm run format:check)이 PR 에서 떨어지기 전에, 고친 그 파일 하나를 Prettier 로 맞춘다.
// .prettierignore 를 따르므로 문서(*.md — 기록 포함) · 마이그레이션(drizzle/) · package-lock.json 은 건드리지 않는다.
// Prettier 가 아직 깔리지 않았으면(npm ci 전) 아무것도 하지 않는다 — 내려받으러 가지 않는다.
// 무엇이 어긋나도 Claude 의 일을 막지 않는다.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const done = () => process.exit(0);

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  done();
}

const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const filePath = input.tool_input?.file_path;
if (!filePath) done();

const abs = path.resolve(root, filePath);
const rel = path.relative(root, abs);
if (rel.startsWith("..") || path.isAbsolute(rel) || !existsSync(abs)) done();

const prettier = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "prettier.cmd" : "prettier");
if (!existsSync(prettier)) done();

try {
  execFileSync(prettier, ["--write", "--ignore-unknown", "--log-level", "warn", rel], {
    cwd: root,
    stdio: "ignore",
    timeout: 20_000,
  });
} catch {
  // 문법이 틀린 파일 따위 — 린트 · 타입 검사가 잡는다
}
done();
