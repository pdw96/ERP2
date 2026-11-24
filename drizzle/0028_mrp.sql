CREATE TABLE "mrp_gross" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mrp_gross_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"run_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"week_start" date NOT NULL,
	"qty" numeric(15, 3) NOT NULL,
	CONSTRAINT "mrp_gross_unique" UNIQUE("run_id","item_id","week_start"),
	CONSTRAINT "mrp_gross_monday" CHECK (extract(isodow from "mrp_gross"."week_start") = 1),
	CONSTRAINT "mrp_gross_qty" CHECK ("mrp_gross"."qty" > 0)
);
--> statement-breakpoint
CREATE TABLE "mrp_planned_orders" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mrp_planned_orders_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"run_id" integer NOT NULL,
	"number" text NOT NULL,
	"kind" text NOT NULL,
	"item_id" integer NOT NULL,
	"qty" numeric(15, 3) NOT NULL,
	"unit" text NOT NULL,
	"decimals" smallint NOT NULL,
	"due_date" date NOT NULL,
	"planned_start" date NOT NULL,
	"start_date" date NOT NULL,
	"late_days" integer NOT NULL,
	"no_bom" boolean DEFAULT false NOT NULL,
	CONSTRAINT "mrp_planned_orders_number_unique" UNIQUE("number"),
	CONSTRAINT "mrp_planned_orders_number_format" CHECK ("mrp_planned_orders"."number" ~ '^PL-[0-9]{8}-[0-9]{3,}$'),
	CONSTRAINT "mrp_planned_orders_kind" CHECK ("mrp_planned_orders"."kind" in ('MAKE', 'BUY')),
	CONSTRAINT "mrp_planned_orders_qty" CHECK ("mrp_planned_orders"."qty" > 0),
	CONSTRAINT "mrp_planned_orders_late_days" CHECK ("mrp_planned_orders"."late_days" >= 0)
);
--> statement-breakpoint
CREATE TABLE "mrp_run_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mrp_run_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"run_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"from_mps" boolean NOT NULL,
	"available" numeric(15, 3) NOT NULL,
	"safety" numeric(15, 3) NOT NULL,
	"min_lot" numeric(15, 3) NOT NULL,
	"lot_multiple" numeric(15, 3) NOT NULL,
	"lead_time_days" integer NOT NULL,
	"unit" text NOT NULL,
	"decimals" smallint NOT NULL,
	"active" boolean NOT NULL,
	CONSTRAINT "mrp_run_items_unique" UNIQUE("run_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "mrp_runs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mrp_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"ran_at" timestamp with time zone NOT NULL,
	"run_date" date NOT NULL,
	"due_weekday" smallint,
	"seq_end" integer NOT NULL,
	"order_count" integer NOT NULL,
	CONSTRAINT "mrp_runs_due_weekday" CHECK ("mrp_runs"."due_weekday" between 1 and 7)
);
--> statement-breakpoint
CREATE TABLE "mrp_setting_changes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mrp_setting_changes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"before" smallint NOT NULL,
	"after" smallint NOT NULL,
	CONSTRAINT "mrp_setting_changes_before" CHECK ("mrp_setting_changes"."before" between 1 and 7),
	CONSTRAINT "mrp_setting_changes_after" CHECK ("mrp_setting_changes"."after" between 1 and 7)
);
--> statement-breakpoint
CREATE TABLE "mrp_settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"due_weekday" smallint DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mrp_settings_single" CHECK ("mrp_settings"."id" = 1),
	CONSTRAINT "mrp_settings_due_weekday" CHECK ("mrp_settings"."due_weekday" between 1 and 7)
);
--> statement-breakpoint
ALTER TABLE "mrp_gross" ADD CONSTRAINT "mrp_gross_run_id_mrp_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."mrp_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mrp_gross" ADD CONSTRAINT "mrp_gross_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mrp_planned_orders" ADD CONSTRAINT "mrp_planned_orders_run_id_mrp_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."mrp_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mrp_planned_orders" ADD CONSTRAINT "mrp_planned_orders_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mrp_run_items" ADD CONSTRAINT "mrp_run_items_run_id_mrp_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."mrp_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mrp_run_items" ADD CONSTRAINT "mrp_run_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mrp_planned_orders_run_idx" ON "mrp_planned_orders" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "mrp_setting_changes_changed_at_idx" ON "mrp_setting_changes" USING btree ("changed_at");
--> statement-breakpoint
INSERT INTO "mrp_settings" ("id", "due_weekday") VALUES (1, 1) ON CONFLICT DO NOTHING;
