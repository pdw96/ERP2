CREATE TABLE "sales_plan_changes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sales_plan_changes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"partner_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"week_start" date NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"before" numeric(15, 3),
	"after" numeric(15, 3),
	CONSTRAINT "sales_plan_changes_monday" CHECK (extract(isodow from "sales_plan_changes"."week_start") = 1),
	CONSTRAINT "sales_plan_changes_some" CHECK ("sales_plan_changes"."before" is not null or "sales_plan_changes"."after" is not null)
);
--> statement-breakpoint
CREATE TABLE "sales_plans" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sales_plans_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"partner_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"week_start" date NOT NULL,
	"qty" numeric(15, 3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_plans_cell_unique" UNIQUE("partner_id","item_id","week_start"),
	CONSTRAINT "sales_plans_monday" CHECK (extract(isodow from "sales_plans"."week_start") = 1),
	CONSTRAINT "sales_plans_qty_range" CHECK ("sales_plans"."qty" > 0 and "sales_plans"."qty" <= 99999999)
);
--> statement-breakpoint
ALTER TABLE "sales_plan_changes" ADD CONSTRAINT "sales_plan_changes_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_plan_changes" ADD CONSTRAINT "sales_plan_changes_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_plans" ADD CONSTRAINT "sales_plans_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_plans" ADD CONSTRAINT "sales_plans_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sales_plan_changes_saved_at_idx" ON "sales_plan_changes" USING btree ("saved_at");--> statement-breakpoint
CREATE INDEX "sales_plans_item_week_idx" ON "sales_plans" USING btree ("item_id","week_start");