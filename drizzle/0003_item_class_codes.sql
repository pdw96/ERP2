-- 손으로 쓴 마이그레이션(drizzle-kit generate --custom) — 품목의 대 · 중 · 소 분류(ADR 0012, 조각 「기준정보」 PR H)의 데이터 쪽. 칸은 0004 가 더한다.
-- 데이터가 있는 DB(운영 · 미리보기 분기)에는 분류 묶음 셋과 처음 값을 넣는다 — 화면의 고르는 목록이 비지 않게.
-- 빈 DB 에는 넣지 않는다 — 배포 빌드가 「묶음 0 행」을 보고 샘플 전체를 넣는다(src/db/deploy.ts). 값은 src/db/sample.ts 와 같다(시험이 견준다).
INSERT INTO "code_groups" ("code", "name", "is_system")
SELECT v.code, v.name, false
FROM (VALUES ('ITEM_CLS1', '품목 대분류'), ('ITEM_CLS2', '품목 중분류'), ('ITEM_CLS3', '품목 소분류')) AS v(code, name)
WHERE EXISTS (SELECT 1 FROM "code_groups")
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
INSERT INTO "codes" ("group_code", "code", "name", "sort_order")
SELECT v.group_code, v.code, v.name, v.sort_order
FROM (VALUES
  ('ITEM_CLS1', 'WAFER', '웨이퍼', 10), ('ITEM_CLS1', 'FRAME', '리드프레임', 20), ('ITEM_CLS1', 'WIRE', '와이어', 30),
  ('ITEM_CLS1', 'CHEM', '화학재료', 40), ('ITEM_CLS1', 'WIP', '공정품', 50), ('ITEM_CLS1', 'IC', 'IC', 60),
  ('ITEM_CLS2', 'SOP', 'SOP', 10), ('ITEM_CLS2', 'QFN', 'QFN', 20), ('ITEM_CLS2', 'COMMON', '공용', 30),
  ('ITEM_CLS3', 'POWER', '전원', 10), ('ITEM_CLS3', 'SENSOR', '센서', 20), ('ITEM_CLS3', 'GENERAL', '범용', 30)
) AS v(group_code, code, name, sort_order)
WHERE EXISTS (SELECT 1 FROM "code_groups" g WHERE g."code" = v.group_code)
ON CONFLICT ("group_code", "code") DO NOTHING;
