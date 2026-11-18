CREATE TABLE "processes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "processes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"code" text NOT NULL,
	"name" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processes_code_unique" UNIQUE("code"),
	CONSTRAINT "processes_code_format" CHECK ("processes"."code" ~ '^[A-Z][A-Z0-9]{1,5}$'),
	CONSTRAINT "processes_name_length" CHECK (char_length("processes"."name") between 1 and 50),
	CONSTRAINT "processes_note_length" CHECK (char_length("processes"."note") <= 500)
);
