CREATE TABLE "stock_count_lines" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stock_count_lines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"count_id" integer NOT NULL,
	"line_no" smallint NOT NULL,
	"item_id" integer NOT NULL,
	"lot" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'AVAILABLE' NOT NULL,
	"added" boolean DEFAULT false NOT NULL,
	"counted_qty" numeric(14, 3),
	"book_qty" numeric(14, 3),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_count_lines_line_unique" UNIQUE("count_id","line_no"),
	CONSTRAINT "stock_count_lines_key_unique" UNIQUE("count_id","item_id","lot","status"),
	CONSTRAINT "stock_count_lines_line_no_range" CHECK ("stock_count_lines"."line_no" between 1 and 100),
	CONSTRAINT "stock_count_lines_lot_format" CHECK ("stock_count_lines"."lot" ~ '^[A-Za-z0-9._-]{0,30}$'),
	CONSTRAINT "stock_count_lines_status_values" CHECK ("stock_count_lines"."status" in ('AVAILABLE', 'QC')),
	CONSTRAINT "stock_count_lines_added_available" CHECK (not "stock_count_lines"."added" or "stock_count_lines"."status" = 'AVAILABLE'),
	CONSTRAINT "stock_count_lines_counted_not_negative" CHECK ("stock_count_lines"."counted_qty" is null or "stock_count_lines"."counted_qty" >= 0),
	CONSTRAINT "stock_count_lines_book_not_negative" CHECK ("stock_count_lines"."book_qty" is null or "stock_count_lines"."book_qty" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stock_counts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stock_counts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"code" text NOT NULL,
	"count_date" date NOT NULL,
	"warehouse_id" integer NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"baseline_line_id" integer DEFAULT 0 NOT NULL,
	"confirmed_date" date,
	"adjust_move_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_counts_code_unique" UNIQUE("code"),
	CONSTRAINT "stock_counts_adjust_move_id_unique" UNIQUE("adjust_move_id"),
	CONSTRAINT "stock_counts_code_format" CHECK ("stock_counts"."code" ~ '^PI-[0-9]{8}-[0-9]{3,}$'),
	CONSTRAINT "stock_counts_code_date" CHECK (substring("stock_counts"."code" from 4 for 8) = to_char("stock_counts"."count_date", 'YYYYMMDD')),
	CONSTRAINT "stock_counts_status_values" CHECK ("stock_counts"."status" in ('DRAFT', 'CONFIRMED', 'CANCELED')),
	CONSTRAINT "stock_counts_confirmed_date" CHECK (("stock_counts"."status" = 'CONFIRMED') = ("stock_counts"."confirmed_date" is not null)),
	CONSTRAINT "stock_counts_adjust_confirmed_only" CHECK ("stock_counts"."adjust_move_id" is null or "stock_counts"."status" = 'CONFIRMED'),
	CONSTRAINT "stock_counts_baseline_not_negative" CHECK ("stock_counts"."baseline_line_id" >= 0)
);
--> statement-breakpoint
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_count_id_stock_counts_id_fk" FOREIGN KEY ("count_id") REFERENCES "public"."stock_counts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_adjust_move_id_stock_moves_id_fk" FOREIGN KEY ("adjust_move_id") REFERENCES "public"."stock_moves"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stock_counts_one_draft_per_warehouse" ON "stock_counts" USING btree ("warehouse_id") WHERE "stock_counts"."status" = 'DRAFT';