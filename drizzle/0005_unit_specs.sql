CREATE TABLE "unit_specs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "unit_specs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"unit_group" text DEFAULT 'UNIT' NOT NULL,
	"unit" text NOT NULL,
	"base_unit" text NOT NULL,
	"factor" numeric(18, 6) NOT NULL,
	"decimals" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unit_specs_unit_unique" UNIQUE("unit"),
	CONSTRAINT "unit_specs_unit_base_unique" UNIQUE("unit","base_unit"),
	CONSTRAINT "unit_specs_unit_group_fixed" CHECK ("unit_specs"."unit_group" = 'UNIT'),
	CONSTRAINT "unit_specs_factor_positive" CHECK ("unit_specs"."factor" > 0),
	CONSTRAINT "unit_specs_base_factor_one" CHECK ("unit_specs"."unit" <> "unit_specs"."base_unit" or "unit_specs"."factor" = 1),
	CONSTRAINT "unit_specs_decimals_range" CHECK ("unit_specs"."decimals" between 0 and 3)
);
--> statement-breakpoint
ALTER TABLE "unit_specs" ADD CONSTRAINT "unit_specs_unit_fk" FOREIGN KEY ("unit_group","unit") REFERENCES "public"."codes"("group_code","code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_specs" ADD CONSTRAINT "unit_specs_base_fk" FOREIGN KEY ("base_unit","base_unit") REFERENCES "public"."unit_specs"("unit","base_unit") ON DELETE no action ON UPDATE no action;