CREATE TABLE "work_centers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "work_centers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"code" text NOT NULL,
	"name" text NOT NULL,
	"process_id" integer NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_centers_code_unique" UNIQUE("code"),
	CONSTRAINT "work_centers_code_format" CHECK ("work_centers"."code" ~ '^[A-Z](-?[A-Z0-9])+$' and char_length("work_centers"."code") between 2 and 10),
	CONSTRAINT "work_centers_name_length" CHECK (char_length("work_centers"."name") between 1 and 50),
	CONSTRAINT "work_centers_note_length" CHECK (char_length("work_centers"."note") <= 500)
);
--> statement-breakpoint
ALTER TABLE "work_centers" ADD CONSTRAINT "work_centers_process_id_processes_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."processes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "work_centers_process_idx" ON "work_centers" USING btree ("process_id");