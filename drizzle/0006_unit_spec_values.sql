-- 손으로 쓴 마이그레이션(drizzle-kit generate --custom) — 단위 사양(ADR 0017, 조각 「재고 수불」 PR A)의 데이터 쪽. 표는 0005 가 만든다.
-- 데이터가 있는 DB(운영 · 미리보기 분기)에는 새 샘플 단위 넷(MM · L · ML · MG)을 공통코드에 넣고, 모든 단위에 사양을 넣는다 —
-- 아는 단위는 ADR 0017 의 값, 방문자가 더해 둔 단위는 「기준이 자신 · 배수 1 · 소수 셋째 자리」(지금까지와 같은 동작)다.
-- 빈 DB 에는 넣지 않는다 — 배포 빌드가 「묶음 0 행」을 보고 샘플 전체를 넣는다(src/db/deploy.ts). 값은 src/db/sample.ts 와 같다(시험이 견준다).
-- 기준 단위의 행이 같은 문장 안에 있어 참조(unit_specs_base_fk)는 문장 끝에 맞는다.
INSERT INTO "codes" ("group_code", "code", "name", "sort_order")
SELECT 'UNIT', v.code, v.name, v.sort_order
FROM (VALUES ('MM', '밀리미터', 50), ('L', '리터', 60), ('ML', '밀리리터', 70), ('MG', '밀리그램', 80)) AS v(code, name, sort_order)
WHERE EXISTS (SELECT 1 FROM "code_groups" WHERE "code" = 'UNIT')
ON CONFLICT ("group_code", "code") DO NOTHING;--> statement-breakpoint
INSERT INTO "unit_specs" ("unit", "base_unit", "factor", "decimals")
SELECT c."code",
       CASE WHEN b."code" IS NOT NULL THEN k.base_unit ELSE c."code" END,
       CASE WHEN b."code" IS NOT NULL THEN k.factor ELSE 1 END,
       coalesce(k.decimals, 3)
FROM "codes" c
LEFT JOIN (VALUES
  ('EA', 'EA', 1, 0), ('M', 'M', 1, 3), ('KG', 'G', 1000, 3), ('G', 'G', 1, 0),
  ('MM', 'M', 0.001, 0), ('L', 'ML', 1000, 3), ('ML', 'ML', 1, 0), ('MG', 'G', 0.001, 0)
) AS k(unit, base_unit, factor, decimals) ON k.unit = c."code"
-- 아는 단위의 기준이 이 DB 의 공통코드에 없으면(지우는 길은 없지만) 자신을 기준으로 둔다 — 참조가 실패해 배포가 멈추지 않게.
LEFT JOIN "codes" b ON b."group_code" = 'UNIT' AND b."code" = k.base_unit
WHERE c."group_code" = 'UNIT'
ON CONFLICT ("unit") DO NOTHING;
