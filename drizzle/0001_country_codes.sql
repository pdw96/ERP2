-- 손으로 쓴 마이그레이션(drizzle-kit generate --custom) — 거래처의 국가(ADR 0011, 조각 「기준정보」 PR G)의 데이터 쪽. 칸은 0002 가 더한다.
-- 데이터가 있는 DB(운영 · 미리보기 분기)에는 국가 묶음 COUNTRY 와 처음 값을 먼저 넣는다 — 기존 거래처가 KR 을 가리킬 수 있게.
-- 빈 DB 에는 넣지 않는다 — 배포 빌드가 「묶음 0 행」을 보고 샘플 전체를 넣는다(src/db/deploy.ts). 값은 src/db/sample.ts 와 같다(시험이 견준다).
INSERT INTO "code_groups" ("code", "name", "is_system")
SELECT 'COUNTRY', '국가', false WHERE EXISTS (SELECT 1 FROM "code_groups")
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
INSERT INTO "codes" ("group_code", "code", "name", "sort_order")
SELECT 'COUNTRY', v.code, v.name, v.sort_order
FROM (VALUES ('KR', '한국', 10), ('US', '미국', 20), ('JP', '일본', 30), ('CN', '중국', 40), ('TW', '대만', 50)) AS v(code, name, sort_order)
WHERE EXISTS (SELECT 1 FROM "code_groups" WHERE "code" = 'COUNTRY')
ON CONFLICT ("group_code", "code") DO NOTHING;
