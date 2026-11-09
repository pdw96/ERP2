CREATE TABLE "stock_balances" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stock_balances_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"item_id" integer NOT NULL,
	"warehouse_id" integer NOT NULL,
	"lot" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'AVAILABLE' NOT NULL,
	"qty" numeric(14, 3) DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_balances_key_unique" UNIQUE("item_id","warehouse_id","lot","status"),
	CONSTRAINT "stock_balances_qty_not_negative" CHECK ("stock_balances"."qty" >= 0),
	CONSTRAINT "stock_balances_lot_format" CHECK ("stock_balances"."lot" ~ '^[A-Za-z0-9._-]{0,30}$'),
	CONSTRAINT "stock_balances_status_values" CHECK ("stock_balances"."status" in ('AVAILABLE', 'QC'))
);
--> statement-breakpoint
CREATE TABLE "stock_move_lines" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stock_move_lines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"move_id" integer NOT NULL,
	"line_no" smallint NOT NULL,
	"move_date" date NOT NULL,
	"item_id" integer NOT NULL,
	"lot" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'AVAILABLE' NOT NULL,
	"from_warehouse_id" integer,
	"to_warehouse_id" integer,
	"qty" numeric(14, 3) NOT NULL,
	"entered_qty" numeric(14, 3) NOT NULL,
	"entered_unit_group" text DEFAULT 'UNIT' NOT NULL,
	"entered_unit" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_move_lines_move_line_unique" UNIQUE("move_id","line_no"),
	CONSTRAINT "stock_move_lines_line_no_range" CHECK ("stock_move_lines"."line_no" between 1 and 100),
	CONSTRAINT "stock_move_lines_lot_format" CHECK ("stock_move_lines"."lot" ~ '^[A-Za-z0-9._-]{0,30}$'),
	CONSTRAINT "stock_move_lines_status_values" CHECK ("stock_move_lines"."status" in ('AVAILABLE', 'QC')),
	CONSTRAINT "stock_move_lines_warehouse_required" CHECK ("stock_move_lines"."from_warehouse_id" is not null or "stock_move_lines"."to_warehouse_id" is not null),
	CONSTRAINT "stock_move_lines_warehouses_differ" CHECK ("stock_move_lines"."from_warehouse_id" is distinct from "stock_move_lines"."to_warehouse_id"),
	CONSTRAINT "stock_move_lines_qty_positive" CHECK ("stock_move_lines"."qty" > 0 and "stock_move_lines"."entered_qty" > 0),
	CONSTRAINT "stock_move_lines_entered_unit_group_fixed" CHECK ("stock_move_lines"."entered_unit_group" = 'UNIT')
);
--> statement-breakpoint
CREATE TABLE "stock_moves" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stock_moves_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"code" text NOT NULL,
	"move_date" date NOT NULL,
	"move_type_group" text DEFAULT 'MOVE_TYPE' NOT NULL,
	"move_type" text NOT NULL,
	"reason_group" text DEFAULT 'ADJ_REASON' NOT NULL,
	"reason" text,
	"note" text DEFAULT '' NOT NULL,
	"cancels_move_id" integer,
	"is_cancel" boolean GENERATED ALWAYS AS (cancels_move_id is not null) STORED NOT NULL,
	"cancels_cancel" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_moves_code_unique" UNIQUE("code"),
	CONSTRAINT "stock_moves_cancels_move_id_unique" UNIQUE("cancels_move_id"),
	CONSTRAINT "stock_moves_id_cancel_unique" UNIQUE("id","is_cancel"),
	CONSTRAINT "stock_moves_code_format" CHECK ("stock_moves"."code" ~ '^IV-[0-9]{8}-[0-9]{3,}$'),
	CONSTRAINT "stock_moves_code_date" CHECK (substring("stock_moves"."code" from 4 for 8) = to_char("stock_moves"."move_date", 'YYYYMMDD')),
	CONSTRAINT "stock_moves_move_type_group_fixed" CHECK ("stock_moves"."move_type_group" = 'MOVE_TYPE'),
	CONSTRAINT "stock_moves_reason_group_fixed" CHECK ("stock_moves"."reason_group" = 'ADJ_REASON'),
	CONSTRAINT "stock_moves_reason_adjust_only" CHECK (("stock_moves"."move_type" = 'ADJ') = ("stock_moves"."reason" is not null)),
	CONSTRAINT "stock_moves_note_length" CHECK (char_length("stock_moves"."note") <= 200),
	CONSTRAINT "stock_moves_cancels_cancel_fixed" CHECK ("stock_moves"."cancels_cancel" = false),
	CONSTRAINT "stock_moves_cancel_not_self" CHECK ("stock_moves"."cancels_move_id" is null or "stock_moves"."cancels_move_id" <> "stock_moves"."id")
);
--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_move_lines" ADD CONSTRAINT "stock_move_lines_move_id_stock_moves_id_fk" FOREIGN KEY ("move_id") REFERENCES "public"."stock_moves"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_move_lines" ADD CONSTRAINT "stock_move_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_move_lines" ADD CONSTRAINT "stock_move_lines_from_warehouse_id_warehouses_id_fk" FOREIGN KEY ("from_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_move_lines" ADD CONSTRAINT "stock_move_lines_to_warehouse_id_warehouses_id_fk" FOREIGN KEY ("to_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_move_lines" ADD CONSTRAINT "stock_move_lines_entered_unit_fk" FOREIGN KEY ("entered_unit_group","entered_unit") REFERENCES "public"."codes"("group_code","code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_cancels_fk" FOREIGN KEY ("cancels_move_id","cancels_cancel") REFERENCES "public"."stock_moves"("id","is_cancel") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_move_type_fk" FOREIGN KEY ("move_type_group","move_type") REFERENCES "public"."codes"("group_code","code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_reason_fk" FOREIGN KEY ("reason_group","reason") REFERENCES "public"."codes"("group_code","code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_balances_warehouse_idx" ON "stock_balances" USING btree ("warehouse_id");--> statement-breakpoint
CREATE INDEX "stock_move_lines_to_key_idx" ON "stock_move_lines" USING btree ("item_id","to_warehouse_id","lot","status","move_date","id");--> statement-breakpoint
CREATE INDEX "stock_move_lines_from_key_idx" ON "stock_move_lines" USING btree ("item_id","from_warehouse_id","lot","status","move_date","id");