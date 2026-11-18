CREATE TABLE "defect_type_processes" (
	"defect_type_id" integer NOT NULL,
	"process_id" integer NOT NULL,
	CONSTRAINT "defect_type_processes_defect_type_id_process_id_pk" PRIMARY KEY("defect_type_id","process_id")
);
--> statement-breakpoint
CREATE TABLE "defect_types" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "defect_types_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"code" text NOT NULL,
	"name" text NOT NULL,
	"cls_group" text DEFAULT 'DEFECT_CLS' NOT NULL,
	"cls" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "defect_types_code_unique" UNIQUE("code"),
	CONSTRAINT "defect_types_code_format" CHECK ("defect_types"."code" ~ '^[A-Z](-?[A-Z0-9])+$' and char_length("defect_types"."code") between 2 and 10),
	CONSTRAINT "defect_types_name_length" CHECK (char_length("defect_types"."name") between 1 and 50),
	CONSTRAINT "defect_types_note_length" CHECK (char_length("defect_types"."note") <= 500),
	CONSTRAINT "defect_types_cls_group_fixed" CHECK ("defect_types"."cls_group" = 'DEFECT_CLS')
);
--> statement-breakpoint
ALTER TABLE "defect_type_processes" ADD CONSTRAINT "defect_type_processes_defect_type_id_defect_types_id_fk" FOREIGN KEY ("defect_type_id") REFERENCES "public"."defect_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "defect_type_processes" ADD CONSTRAINT "defect_type_processes_process_id_processes_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."processes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "defect_types" ADD CONSTRAINT "defect_types_cls_fk" FOREIGN KEY ("cls_group","cls") REFERENCES "public"."codes"("group_code","code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "defect_type_processes_process_idx" ON "defect_type_processes" USING btree ("process_id");