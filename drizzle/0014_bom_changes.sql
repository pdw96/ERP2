CREATE TABLE "bom_changes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bom_changes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parent_item_id" integer NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"child_item_id" integer,
	"line_no" smallint,
	"before" jsonb,
	"after" jsonb,
	CONSTRAINT "bom_changes_kind" CHECK ("bom_changes"."kind" in ('BOM_ADD', 'BOM_DEL', 'BASE', 'LINE_ADD', 'LINE_DEL', 'LINE_EDIT')),
	CONSTRAINT "bom_changes_line_kinds" CHECK (("bom_changes"."kind" in ('LINE_ADD', 'LINE_DEL', 'LINE_EDIT')) = ("bom_changes"."child_item_id" is not null and "bom_changes"."line_no" is not null)),
	CONSTRAINT "bom_changes_line_no_range" CHECK ("bom_changes"."line_no" is null or "bom_changes"."line_no" between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "bom_changes" ADD CONSTRAINT "bom_changes_parent_item_id_items_id_fk" FOREIGN KEY ("parent_item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_changes" ADD CONSTRAINT "bom_changes_child_item_id_items_id_fk" FOREIGN KEY ("child_item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bom_changes_parent_idx" ON "bom_changes" USING btree ("parent_item_id","saved_at");