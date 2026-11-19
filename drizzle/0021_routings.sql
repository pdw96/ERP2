CREATE TABLE "routing_changes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "routing_changes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"item_id" integer NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"seq" smallint,
	"material_item_id" integer,
	"before" jsonb,
	"after" jsonb,
	CONSTRAINT "routing_changes_kind" CHECK ("routing_changes"."kind" in ('ROUTING_ADD', 'ROUTING_DEL', 'STEP_ADD', 'STEP_DEL', 'STEP_EDIT', 'MAT_ADD', 'MAT_MOVE', 'MAT_DEL')),
	CONSTRAINT "routing_changes_material_kinds" CHECK (("routing_changes"."kind" like 'MAT_%') = ("routing_changes"."material_item_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "routing_materials" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "routing_materials_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"routing_id" integer NOT NULL,
	"seq" smallint NOT NULL,
	"item_id" integer NOT NULL,
	CONSTRAINT "routing_materials_item_unique" UNIQUE("routing_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "routing_steps" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "routing_steps_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"routing_id" integer NOT NULL,
	"seq" smallint NOT NULL,
	"process_id" integer NOT NULL,
	"work_center_id" integer NOT NULL,
	"setup_min" integer NOT NULL,
	"run_ms" integer NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	CONSTRAINT "routing_steps_seq_unique" UNIQUE("routing_id","seq"),
	CONSTRAINT "routing_steps_seq_range" CHECK ("routing_steps"."seq" between 10 and 500 and "routing_steps"."seq" % 10 = 0),
	CONSTRAINT "routing_steps_setup_range" CHECK ("routing_steps"."setup_min" between 0 and 1440),
	CONSTRAINT "routing_steps_run_range" CHECK ("routing_steps"."run_ms" between 0 and 3600000),
	CONSTRAINT "routing_steps_note_length" CHECK (char_length("routing_steps"."note") <= 200)
);
--> statement-breakpoint
CREATE TABLE "routings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "routings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"item_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "routings_item_id_unique" UNIQUE("item_id")
);
--> statement-breakpoint
ALTER TABLE "work_centers" ADD CONSTRAINT "work_centers_id_process_unique" UNIQUE("id","process_id");--> statement-breakpoint
ALTER TABLE "routing_changes" ADD CONSTRAINT "routing_changes_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_changes" ADD CONSTRAINT "routing_changes_material_item_id_items_id_fk" FOREIGN KEY ("material_item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_materials" ADD CONSTRAINT "routing_materials_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_materials" ADD CONSTRAINT "routing_materials_step_fk" FOREIGN KEY ("routing_id","seq") REFERENCES "public"."routing_steps"("routing_id","seq") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_steps" ADD CONSTRAINT "routing_steps_routing_id_routings_id_fk" FOREIGN KEY ("routing_id") REFERENCES "public"."routings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_steps" ADD CONSTRAINT "routing_steps_process_id_processes_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."processes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_steps" ADD CONSTRAINT "routing_steps_work_center_fk" FOREIGN KEY ("work_center_id","process_id") REFERENCES "public"."work_centers"("id","process_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routings" ADD CONSTRAINT "routings_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "routing_changes_item_idx" ON "routing_changes" USING btree ("item_id","saved_at");--> statement-breakpoint
CREATE INDEX "routing_steps_work_center_idx" ON "routing_steps" USING btree ("work_center_id");--> statement-breakpoint
CREATE INDEX "routing_steps_process_idx" ON "routing_steps" USING btree ("process_id");
