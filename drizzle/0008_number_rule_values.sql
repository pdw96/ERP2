-- 손으로 쓴 마이그레이션(drizzle-kit generate --custom) — 조각 「재고 수불」 PR B 의 데이터 쪽. 표 · 칸은 0007 이 만든다.
-- 데이터가 있는 DB(운영 · 미리보기 분기)에만 넣는다 — 빈 DB 는 배포 빌드가 「묶음 0 행」을 보고 샘플 전체를 넣는다(src/db/deploy.ts).
-- 값은 src/db/sample.ts 와 같다(시험이 견준다). 설계 「2026-11-06 — PR B 를 열기 전에 정한 것」.
-- 품목 유형 부자재 · 소모품(ADR 0019)과 대분류 포장재 · 공구.
INSERT INTO "codes" ("group_code", "code", "name", "sort_order")
SELECT v.group_code, v.code, v.name, v.sort_order
FROM (VALUES
  ('ITEM_TYPE', 'SM', '부자재', 40), ('ITEM_TYPE', 'CS', '소모품', 50),
  ('ITEM_CLS1', 'PACK', '포장재', 70), ('ITEM_CLS1', 'TOOL', '공구', 80)
) AS v(group_code, code, name, sort_order)
WHERE EXISTS (SELECT 1 FROM "code_groups" g WHERE g."code" = v.group_code)
ON CONFLICT ("group_code", "code") DO NOTHING;--> statement-breakpoint
-- LOT 번호 규칙 셋(ADR 0016) — 반제품 · 완제품의 기본과 숫자형.
INSERT INTO "number_rules" ("code", "name", "prefix", "separator", "date_format", "seq_digits", "default_for")
SELECT v.code, v.name, v.prefix, v.separator, v.date_format, v.seq_digits, v.default_for
FROM (VALUES
  ('LOT_SF', '반제품 LOT', 'SF', '-', 'YYMMDD', 3, 'SF'),
  ('LOT_FG', '완제품 LOT', 'FG', '-', 'YYMMDD', 3, 'FG'),
  ('LOT_NUM', '숫자형 LOT', '', '', 'YYMMDD', 3, NULL)
) AS v(code, name, prefix, separator, date_format, seq_digits, default_for)
WHERE EXISTS (SELECT 1 FROM "code_groups")
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
-- 불량창고 표시(ADR 0015) — 샘플의 WH-04.
UPDATE "warehouses" SET "is_defect" = true WHERE "code" = 'WH-04';--> statement-breakpoint
-- 부자재 · 소모품 샘플 넷 — SM · CS 코드는 이 마이그레이션 앞에 넣을 길이 없어 겹치지 않는다. 단위가 없으면 그 품목은 넣지 않고,
-- 분류가 없으면 비운다(참조가 실패해 배포가 멈추지 않게).
INSERT INTO "items" ("code", "name", "spec", "item_type", "procurement", "unit", "lot_managed",
  "lead_time_days", "safety_stock", "min_lot", "lot_multiple", "cls1", "cls2")
SELECT v.code, v.name, v.spec, v.item_type, 'BUY', v.unit, false,
  v.lead_time_days, v.safety_stock, v.min_lot, v.lot_multiple, c1."code", c2."code"
FROM (VALUES
  ('SM-0001', '캐리어 테이프', '폭 12mm · SOP-8 용', 'SM', 'M', 7, 2000, 1000, 500, 'PACK', 'SOP'),
  ('SM-0002', '방습백', '알루미늄 · 건조제 동봉', 'SM', 'EA', 7, 500, 500, 100, 'PACK', 'COMMON'),
  ('CS-0001', '다이싱 블레이드', '두께 30µm', 'CS', 'EA', 14, 10, 5, 5, 'TOOL', 'COMMON'),
  ('CS-0002', '세정용 IPA', '순도 99.9%', 'CS', 'L', 5, 20, 20, 20, 'CHEM', 'COMMON')
) AS v(code, name, spec, item_type, unit, lead_time_days, safety_stock, min_lot, lot_multiple, cls1, cls2)
JOIN "codes" t ON t."group_code" = 'ITEM_TYPE' AND t."code" = v.item_type
JOIN "codes" p ON p."group_code" = 'PROC_TYPE' AND p."code" = 'BUY'
JOIN "codes" u ON u."group_code" = 'UNIT' AND u."code" = v.unit
LEFT JOIN "codes" c1 ON c1."group_code" = 'ITEM_CLS1' AND c1."code" = v.cls1
LEFT JOIN "codes" c2 ON c2."group_code" = 'ITEM_CLS2' AND c2."code" = v.cls2
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
-- 품목의 기본 입고 · 출고 창고 — 유형마다(사 오는 품목: 자재창고 → 생산현장, 반제품: 생산현장, 완제품: 제품창고).
-- 그 창고가 있고 「사용」이며 불량창고가 아닐 때만 넣는다. 방문자가 더해 둔 품목도 유형대로 받는다.
UPDATE "items" i SET "default_in_warehouse_id" = w."id"
FROM (VALUES ('RM', 'WH-01'), ('SM', 'WH-01'), ('CS', 'WH-01'), ('SF', 'WH-02'), ('FG', 'WH-03')) AS v(item_type, wh)
JOIN "warehouses" w ON w."code" = v.wh AND w."active" AND NOT w."is_defect"
WHERE i."item_type" = v.item_type AND i."default_in_warehouse_id" IS NULL;--> statement-breakpoint
UPDATE "items" i SET "default_out_warehouse_id" = w."id"
FROM (VALUES ('RM', 'WH-02'), ('SM', 'WH-02'), ('CS', 'WH-02'), ('SF', 'WH-02'), ('FG', 'WH-03')) AS v(item_type, wh)
JOIN "warehouses" w ON w."code" = v.wh AND w."active" AND NOT w."is_defect"
WHERE i."item_type" = v.item_type AND i."default_out_warehouse_id" IS NULL;--> statement-breakpoint
-- 센서 IC 는 숫자형 규칙을 고른다 — 품목에서 다른 규칙을 고르는 본보기.
UPDATE "items" SET "lot_rule_code" = 'LOT_NUM'
WHERE "code" = 'FG-0002' AND "item_type" = 'FG' AND EXISTS (SELECT 1 FROM "number_rules" WHERE "code" = 'LOT_NUM');
