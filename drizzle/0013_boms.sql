CREATE TABLE "bom_lines" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bom_lines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"bom_id" integer NOT NULL,
	"parent_item_id" integer NOT NULL,
	"line_no" smallint NOT NULL,
	"child_item_id" integer NOT NULL,
	"qty" numeric(12, 3) NOT NULL,
	"loss_rate" numeric(5, 2) DEFAULT 0 NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bom_lines_line_unique" UNIQUE("bom_id","line_no"),
	CONSTRAINT "bom_lines_line_no_range" CHECK ("bom_lines"."line_no" between 1 and 200),
	CONSTRAINT "bom_lines_not_self" CHECK ("bom_lines"."parent_item_id" <> "bom_lines"."child_item_id"),
	CONSTRAINT "bom_lines_qty_positive" CHECK ("bom_lines"."qty" > 0),
	CONSTRAINT "bom_lines_loss_rate_range" CHECK ("bom_lines"."loss_rate" >= 0 and "bom_lines"."loss_rate" < 100),
	CONSTRAINT "bom_lines_valid_range" CHECK ("bom_lines"."valid_to" is null or "bom_lines"."valid_to" >= "bom_lines"."valid_from"),
	CONSTRAINT "bom_lines_note_length" CHECK (char_length("bom_lines"."note") <= 200)
);
--> statement-breakpoint
CREATE TABLE "boms" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "boms_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"item_id" integer NOT NULL,
	"base_qty" numeric(12, 3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boms_item_id_unique" UNIQUE("item_id"),
	CONSTRAINT "boms_id_item_unique" UNIQUE("id","item_id"),
	CONSTRAINT "boms_base_qty_positive" CHECK ("boms"."base_qty" > 0)
);
--> statement-breakpoint
ALTER TABLE "bom_lines" ADD CONSTRAINT "bom_lines_child_item_id_items_id_fk" FOREIGN KEY ("child_item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_lines" ADD CONSTRAINT "bom_lines_bom_fk" FOREIGN KEY ("bom_id","parent_item_id") REFERENCES "public"."boms"("id","item_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boms" ADD CONSTRAINT "boms_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bom_lines_child_idx" ON "bom_lines" USING btree ("child_item_id");