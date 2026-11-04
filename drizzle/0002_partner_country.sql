ALTER TABLE "partners" ADD COLUMN "country_group" text DEFAULT 'COUNTRY' NOT NULL;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "country" text DEFAULT 'KR' NOT NULL;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "foreign_biz_no" text;--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_country_fk" FOREIGN KEY ("country_group","country") REFERENCES "public"."codes"("group_code","code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_country_group_fixed" CHECK ("partners"."country_group" = 'COUNTRY');--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_foreign_biz_no_length" CHECK ("partners"."foreign_biz_no" is null or char_length("partners"."foreign_biz_no") between 1 and 30);--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_biz_no_by_country" CHECK (("partners"."country" = 'KR' and "partners"."foreign_biz_no" is null) or ("partners"."country" <> 'KR' and "partners"."biz_no" is null));