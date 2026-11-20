CREATE TABLE "mps_changes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mps_changes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"item_id" integer NOT NULL,
	"week_start" date NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"before" numeric(15, 3),
	"after" numeric(15, 3),
	"kind" text NOT NULL,
	CONSTRAINT "mps_changes_kind" CHECK ("mps_changes"."kind" in ('EDIT', 'CONFIRM', 'UNCONFIRM')),
	CONSTRAINT "mps_changes_monday" CHECK (extract(isodow from "mps_changes"."week_start") = 1),
	CONSTRAINT "mps_changes_some" CHECK ("mps_changes"."before" is not null or "mps_changes"."after" is not null)
);
--> statement-breakpoint
CREATE TABLE "mps_fixed" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mps_fixed_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"item_id" integer NOT NULL,
	"week_start" date NOT NULL,
	"qty" numeric(15, 3) NOT NULL,
	"fixed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mps_fixed_cell_unique" UNIQUE("item_id","week_start"),
	CONSTRAINT "mps_fixed_monday" CHECK (extract(isodow from "mps_fixed"."week_start") = 1),
	CONSTRAINT "mps_fixed_qty_range" CHECK ("mps_fixed"."qty" >= 0 and "mps_fixed"."qty" <= 99999999)
);
--> statement-breakpoint
ALTER TABLE "mps_changes" ADD CONSTRAINT "mps_changes_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mps_fixed" ADD CONSTRAINT "mps_fixed_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mps_changes_saved_at_idx" ON "mps_changes" USING btree ("saved_at");