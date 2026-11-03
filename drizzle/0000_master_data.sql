CREATE TABLE "code_groups" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "code_groups_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "code_groups_code_unique" UNIQUE("code"),
	CONSTRAINT "code_groups_code_format" CHECK ("code_groups"."code" ~ '^[A-Z][A-Z0-9_]{1,19}$'),
	CONSTRAINT "code_groups_name_length" CHECK (char_length("code_groups"."name") between 1 and 50)
);
--> statement-breakpoint
CREATE TABLE "codes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "codes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"group_code" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "codes_group_code_code_unique" UNIQUE("group_code","code"),
	CONSTRAINT "codes_code_format" CHECK ("codes"."code" ~ '^[A-Z0-9][A-Z0-9_]{0,19}$'),
	CONSTRAINT "codes_name_length" CHECK (char_length("codes"."name") between 1 and 50),
	CONSTRAINT "codes_sort_order_range" CHECK ("codes"."sort_order" between 0 and 999)
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"code" text NOT NULL,
	"name" text NOT NULL,
	"spec" text DEFAULT '' NOT NULL,
	"item_type_group" text DEFAULT 'ITEM_TYPE' NOT NULL,
	"item_type" text NOT NULL,
	"procurement_group" text DEFAULT 'PROC_TYPE' NOT NULL,
	"procurement" text NOT NULL,
	"unit_group" text DEFAULT 'UNIT' NOT NULL,
	"unit" text NOT NULL,
	"inspect_in" boolean DEFAULT false NOT NULL,
	"inspect_out" boolean DEFAULT false NOT NULL,
	"lead_time_days" integer DEFAULT 0 NOT NULL,
	"safety_stock" numeric(12, 3) DEFAULT 0 NOT NULL,
	"min_lot" numeric(12, 3) DEFAULT 0 NOT NULL,
	"lot_multiple" numeric(12, 3) DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_code_unique" UNIQUE("code"),
	CONSTRAINT "items_item_type_group_fixed" CHECK ("items"."item_type_group" = 'ITEM_TYPE'),
	CONSTRAINT "items_procurement_group_fixed" CHECK ("items"."procurement_group" = 'PROC_TYPE'),
	CONSTRAINT "items_unit_group_fixed" CHECK ("items"."unit_group" = 'UNIT'),
	CONSTRAINT "items_code_format" CHECK ("items"."code" ~ '^(RM|SF|FG)-[0-9]{4,}$' and left("items"."code", 2) = "items"."item_type"),
	CONSTRAINT "items_name_length" CHECK (char_length("items"."name") between 1 and 100),
	CONSTRAINT "items_spec_length" CHECK (char_length("items"."spec") <= 100),
	CONSTRAINT "items_lead_time_range" CHECK ("items"."lead_time_days" between 0 and 365),
	CONSTRAINT "items_quantities_not_negative" CHECK ("items"."safety_stock" >= 0 and "items"."min_lot" >= 0 and "items"."lot_multiple" >= 0)
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "partners_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_supplier" boolean DEFAULT false NOT NULL,
	"is_customer" boolean DEFAULT false NOT NULL,
	"biz_no" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partners_code_unique" UNIQUE("code"),
	CONSTRAINT "partners_code_format" CHECK ("partners"."code" ~ '^BP-[0-9]{4,}$'),
	CONSTRAINT "partners_name_length" CHECK (char_length("partners"."name") between 1 and 100),
	CONSTRAINT "partners_role_required" CHECK ("partners"."is_supplier" or "partners"."is_customer"),
	CONSTRAINT "partners_biz_no_format" CHECK ("partners"."biz_no" is null or "partners"."biz_no" ~ '^[0-9]{3}-[0-9]{2}-[0-9]{5}$')
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "warehouses_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"code" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "warehouses_code_unique" UNIQUE("code"),
	CONSTRAINT "warehouses_code_format" CHECK ("warehouses"."code" ~ '^WH-[0-9]{2,}$'),
	CONSTRAINT "warehouses_name_length" CHECK (char_length("warehouses"."name") between 1 and 50)
);
--> statement-breakpoint
ALTER TABLE "codes" ADD CONSTRAINT "codes_group_code_code_groups_code_fk" FOREIGN KEY ("group_code") REFERENCES "public"."code_groups"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_item_type_fk" FOREIGN KEY ("item_type_group","item_type") REFERENCES "public"."codes"("group_code","code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_procurement_fk" FOREIGN KEY ("procurement_group","procurement") REFERENCES "public"."codes"("group_code","code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_unit_fk" FOREIGN KEY ("unit_group","unit") REFERENCES "public"."codes"("group_code","code") ON DELETE no action ON UPDATE no action;