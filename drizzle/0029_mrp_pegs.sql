CREATE TABLE "mrp_pegs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mrp_pegs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"run_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"kind" text NOT NULL,
	"demand_order_id" integer,
	"supply_order_id" integer,
	"need_date" date,
	"qty" numeric(15, 3) NOT NULL,
	CONSTRAINT "mrp_pegs_kind" CHECK ("mrp_pegs"."kind" in ('ORDER', 'SAFETY', 'SHORT', 'SURPLUS')),
	CONSTRAINT "mrp_pegs_shape" CHECK (("mrp_pegs"."kind" = 'ORDER' and "mrp_pegs"."demand_order_id" is not null and "mrp_pegs"."need_date" is not null and "mrp_pegs"."qty" >= 0)
        or ("mrp_pegs"."kind" <> 'ORDER' and "mrp_pegs"."demand_order_id" is null and "mrp_pegs"."need_date" is null and "mrp_pegs"."supply_order_id" is not null and "mrp_pegs"."qty" > 0))
);
--> statement-breakpoint
ALTER TABLE "mrp_planned_orders" ADD COLUMN "mps_week" date;--> statement-breakpoint
ALTER TABLE "mrp_planned_orders" ADD COLUMN "mps_fixed" boolean;--> statement-breakpoint
ALTER TABLE "mrp_runs" ADD COLUMN "has_pegs" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "mrp_pegs" ADD CONSTRAINT "mrp_pegs_run_id_mrp_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."mrp_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mrp_pegs" ADD CONSTRAINT "mrp_pegs_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mrp_pegs" ADD CONSTRAINT "mrp_pegs_demand_order_id_mrp_planned_orders_id_fk" FOREIGN KEY ("demand_order_id") REFERENCES "public"."mrp_planned_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mrp_pegs" ADD CONSTRAINT "mrp_pegs_supply_order_id_mrp_planned_orders_id_fk" FOREIGN KEY ("supply_order_id") REFERENCES "public"."mrp_planned_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mrp_pegs_run_idx" ON "mrp_pegs" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "mrp_pegs_demand_idx" ON "mrp_pegs" USING btree ("demand_order_id");--> statement-breakpoint
CREATE INDEX "mrp_pegs_supply_idx" ON "mrp_pegs" USING btree ("supply_order_id");