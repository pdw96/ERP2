ALTER TABLE "items" ADD COLUMN "cls1_group" text DEFAULT 'ITEM_CLS1' NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "cls1" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "cls2_group" text DEFAULT 'ITEM_CLS2' NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "cls2" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "cls3_group" text DEFAULT 'ITEM_CLS3' NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "cls3" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "ceo" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "biz_type" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "biz_item" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "address" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "contact_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "contact_phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_cls1_fk" FOREIGN KEY ("cls1_group","cls1") REFERENCES "public"."codes"("group_code","code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_cls2_fk" FOREIGN KEY ("cls2_group","cls2") REFERENCES "public"."codes"("group_code","code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_cls3_fk" FOREIGN KEY ("cls3_group","cls3") REFERENCES "public"."codes"("group_code","code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_cls1_group_fixed" CHECK ("items"."cls1_group" = 'ITEM_CLS1');--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_cls2_group_fixed" CHECK ("items"."cls2_group" = 'ITEM_CLS2');--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_cls3_group_fixed" CHECK ("items"."cls3_group" = 'ITEM_CLS3');--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_note_length" CHECK (char_length("items"."note") <= 500);--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_ceo_length" CHECK (char_length("partners"."ceo") <= 50);--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_biz_type_length" CHECK (char_length("partners"."biz_type") <= 50);--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_biz_item_length" CHECK (char_length("partners"."biz_item") <= 50);--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_address_length" CHECK (char_length("partners"."address") <= 200);--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_contact_name_length" CHECK (char_length("partners"."contact_name") <= 50);--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_note_length" CHECK (char_length("partners"."note") <= 500);--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_phone_format" CHECK ("partners"."phone" = '' or ("partners"."phone" ~ '^[0-9+() -]{1,20}$' and "partners"."phone" ~ '[0-9]'));--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_contact_phone_format" CHECK ("partners"."contact_phone" = '' or ("partners"."contact_phone" ~ '^[0-9+() -]{1,20}$' and "partners"."contact_phone" ~ '[0-9]'));--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_email_format" CHECK ("partners"."email" = '' or (char_length("partners"."email") <= 100 and "partners"."email" ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'));