-- 손으로 쓴 마이그레이션(drizzle-kit generate --custom) — 조각 「재고 수불」 PR C 의 데이터 쪽. 표는 0011 이 만든다.
-- 데이터가 있는 DB(운영 · 미리보기 분기)에만 넣는다 — 빈 DB 는 배포 빌드가 「묶음 0 행」을 보고 샘플 전체를 넣는다(src/db/deploy.ts).
-- 값은 src/db/sample.ts 와 같다(시험이 견준다). 수불 유형은 재고 계산이 기대는 시스템 코드, 조정 사유는 사용자 코드다(ADR 0016).
-- 샘플 수불은 넣지 않는다 — 날짜가 되돌린 날에 기대고 LOT 의 저절로 붙는 번호를 SQL 로 낼 수 없어, 매일 밤 되돌림이 넣는다
-- (설계 「2026-11-09 — PR C 를 열기 전에 정한 것」).
INSERT INTO "code_groups" ("code", "name", "is_system")
SELECT v.code, v.name, v.is_system
FROM (VALUES ('MOVE_TYPE', '수불 유형', true), ('ADJ_REASON', '조정 사유', false)) AS v(code, name, is_system)
WHERE EXISTS (SELECT 1 FROM "code_groups")
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
INSERT INTO "codes" ("group_code", "code", "name", "sort_order")
SELECT v.group_code, v.code, v.name, v.sort_order
FROM (VALUES
  ('MOVE_TYPE', 'IN', '기타입고', 10), ('MOVE_TYPE', 'OUT', '기타출고', 20),
  ('MOVE_TYPE', 'XFER', '이동', 30), ('MOVE_TYPE', 'ADJ', '조정', 40),
  ('ADJ_REASON', 'COUNT', '실사 차이', 10), ('ADJ_REASON', 'DAMAGE', '파손', 20),
  ('ADJ_REASON', 'LOSS', '분실', 30), ('ADJ_REASON', 'FOUND', '발견', 40), ('ADJ_REASON', 'ETC', '기타', 50)
) AS v(group_code, code, name, sort_order)
WHERE EXISTS (SELECT 1 FROM "code_groups" g WHERE g."code" = v.group_code)
ON CONFLICT ("group_code", "code") DO NOTHING;
