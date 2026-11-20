ALTER TABLE "sales_plan_changes" ADD COLUMN "kind" text DEFAULT 'EDIT' NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_plans" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sales_plan_changes" ADD CONSTRAINT "sales_plan_changes_kind" CHECK ("sales_plan_changes"."kind" in ('EDIT', 'CONFIRM', 'UNCONFIRM'));
--> statement-breakpoint
-- 손으로 덧붙인 데이터 — 메뉴 「판매계획」의 확정. 위 세 줄은 drizzle-kit 이 만든 표 · 제약이다.
-- 데이터가 있는 DB(운영 · 미리보기 분기)의 칸 가운데 주 ≤ 한국 이번 주 + 5주 를 확정한다(샘플의 SAMPLE_SALES_PLAN_CONFIRMED_THROUGH 와 같은 시작점).
-- 그 고객 × 품목에 확정 이력 · 고친 이력이 하나라도 있으면(방문자가 이미 만진 쌍) 건너뛴다. 이미 확정된 칸도 건드리지 않는다.
-- 이 SQL 은 이력을 넣지 않으므로 다시 돌려도 바뀌지 않는다. 빈 DB 는 칸이 없어 아무것도 하지 않는다.
UPDATE "sales_plans" s
SET "confirmed_at" = now()
WHERE s."confirmed_at" IS NULL
  AND s."week_start" <= (date_trunc('week', now() AT TIME ZONE 'Asia/Seoul'))::date + 5 * 7
  AND NOT EXISTS (
    SELECT 1 FROM "sales_plan_changes" c
    WHERE c."partner_id" = s."partner_id" AND c."item_id" = s."item_id"
  );
