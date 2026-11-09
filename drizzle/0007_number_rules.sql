CREATE TABLE "number_rule_seqs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "number_rule_seqs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"rule_code" text NOT NULL,
	"period" text DEFAULT '' NOT NULL,
	"last_seq" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "number_rule_seqs_rule_period_unique" UNIQUE("rule_code","period"),
	CONSTRAINT "number_rule_seqs_period_format" CHECK ("number_rule_seqs"."period" ~ '^([0-9]{4}|[0-9]{6}|[0-9]{8})?$'),
	CONSTRAINT "number_rule_seqs_last_seq_positive" CHECK ("number_rule_seqs"."last_seq" >= 1)
);
--> statement-breakpoint
CREATE TABLE "number_rules" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "number_rules_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"code" text NOT NULL,
	"name" text NOT NULL,
	"prefix" text DEFAULT '' NOT NULL,
	"separator" text DEFAULT '' NOT NULL,
	"date_format" text DEFAULT '' NOT NULL,
	"seq_digits" smallint NOT NULL,
	"default_for" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "number_rules_code_unique" UNIQUE("code"),
	CONSTRAINT "number_rules_default_for_unique" UNIQUE("default_for"),
	CONSTRAINT "number_rules_code_format" CHECK ("number_rules"."code" ~ '^[A-Z][A-Z0-9_]{1,19}$'),
	CONSTRAINT "number_rules_name_length" CHECK (char_length("number_rules"."name") between 1 and 50),
	CONSTRAINT "number_rules_prefix_format" CHECK ("number_rules"."prefix" ~ '^[A-Z0-9]{0,6}$'),
	CONSTRAINT "number_rules_separator_values" CHECK ("number_rules"."separator" in ('', '-', '_', '.')),
	CONSTRAINT "number_rules_date_format_values" CHECK ("number_rules"."date_format" in ('', 'YYMMDD', 'YYYYMMDD', 'YYMM')),
	CONSTRAINT "number_rules_seq_digits_range" CHECK ("number_rules"."seq_digits" between 2 and 6),
	CONSTRAINT "number_rules_default_for_values" CHECK ("number_rules"."default_for" in ('SF', 'FG')),
	CONSTRAINT "number_rules_default_active" CHECK ("number_rules"."default_for" is null or "number_rules"."active")
);
--> statement-breakpoint
ALTER TABLE "items" DROP CONSTRAINT "items_code_format";--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "lot_managed" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "lot_rule_code" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "default_in_warehouse_id" integer;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "default_out_warehouse_id" integer;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "default_warehouse_defect" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouses" ADD COLUMN "is_defect" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- 손으로 옮긴 줄 — 품목의 기본 창고 참조가 가리키는 열쇠를 참조보다 먼저 만든다(drizzle-kit 이 뒤에 둔다, PR B 리뷰 1회차).
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_id_defect_unique" UNIQUE("id","is_defect");--> statement-breakpoint
ALTER TABLE "number_rule_seqs" ADD CONSTRAINT "number_rule_seqs_rule_code_number_rules_code_fk" FOREIGN KEY ("rule_code") REFERENCES "public"."number_rules"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_lot_rule_fk" FOREIGN KEY ("lot_rule_code") REFERENCES "public"."number_rules"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_default_in_warehouse_fk" FOREIGN KEY ("default_in_warehouse_id","default_warehouse_defect") REFERENCES "public"."warehouses"("id","is_defect") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_default_out_warehouse_fk" FOREIGN KEY ("default_out_warehouse_id","default_warehouse_defect") REFERENCES "public"."warehouses"("id","is_defect") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_default_warehouse_defect_fixed" CHECK ("items"."default_warehouse_defect" = false);--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_lot_rule_made_only" CHECK ("items"."lot_rule_code" is null or "items"."item_type" in ('SF', 'FG'));--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_code_format" CHECK ("items"."code" ~ '^(RM|SF|FG|SM|CS)-[0-9]{4,}$' and left("items"."code", 2) = "items"."item_type");