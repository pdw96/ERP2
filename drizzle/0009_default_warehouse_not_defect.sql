-- 품목의 기본 창고가 불량창고를 가리키지 못하게 DB 가 막는다(조각 「재고 수불」 PR B 리뷰 1회차 — 0007 은 이미 적용된 DB 가 있어 고치지 않고 덧붙인다).
-- 손으로 더하거나 옮긴 줄 둘: 이미 불량창고를 가리키는 기본 창고는 비운다(새 참조가 걸려 배포가 멈추지 않게),
-- 그리고 참조가 가리키는 열쇠를 참조보다 먼저 만든다(drizzle-kit 이 뒤에 둔다).
UPDATE "items" SET "default_in_warehouse_id" = NULL
WHERE "default_in_warehouse_id" IN (SELECT "id" FROM "warehouses" WHERE "is_defect");--> statement-breakpoint
UPDATE "items" SET "default_out_warehouse_id" = NULL
WHERE "default_out_warehouse_id" IN (SELECT "id" FROM "warehouses" WHERE "is_defect");--> statement-breakpoint
ALTER TABLE "items" DROP CONSTRAINT "items_default_in_warehouse_fk";
--> statement-breakpoint
ALTER TABLE "items" DROP CONSTRAINT "items_default_out_warehouse_fk";
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "default_warehouse_defect" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_id_defect_unique" UNIQUE("id","is_defect");--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_default_in_warehouse_fk" FOREIGN KEY ("default_in_warehouse_id","default_warehouse_defect") REFERENCES "public"."warehouses"("id","is_defect") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_default_out_warehouse_fk" FOREIGN KEY ("default_out_warehouse_id","default_warehouse_defect") REFERENCES "public"."warehouses"("id","is_defect") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_default_warehouse_defect_fixed" CHECK ("items"."default_warehouse_defect" = false);