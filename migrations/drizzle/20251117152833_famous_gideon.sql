CREATE TYPE "public"."templates_status" AS ENUM('draft', 'published', 'shared', 'assigned to product', 'pending approval', 'approved', 'active', 'rejected', 'pending removal');--> statement-breakpoint
CREATE TYPE "public"."dpp_data_type_enum" AS ENUM('string', 'number', 'decimal', 'bool', 'set', 'date', 'file', 'image');--> statement-breakpoint
CREATE TYPE "public"."gui_input_type_enum" AS ENUM('input', 'textarea', 'bool', 'dropdown', 'radio', 'checkbox', 'range', 'date', 'upload');--> statement-breakpoint
CREATE TABLE "defaultField" (
	"id" varchar(25) PRIMARY KEY NOT NULL,
	"industry_id" varchar(25),
	"default_section_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"sequence" integer NOT NULL,
	"dpp_data_type" "dpp_data_type_enum" NOT NULL,
	"gui_input_type" "gui_input_type_enum" NOT NULL,
	"input_options" json DEFAULT '{}'::json,
	"input_rules" json DEFAULT '{}'::json,
	"unit" varchar(100) NOT NULL,
	"unit_symbol" varchar(20) NOT NULL,
	"is_editable" boolean DEFAULT false NOT NULL,
	"is_deletable" boolean DEFAULT false NOT NULL,
	"is_validation_overridable" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "defaultField_id_unique" UNIQUE("id"),
	CONSTRAINT "defaultField_default_section_id_name_unique" UNIQUE("default_section_id","name")
);
--> statement-breakpoint
CREATE TABLE "industries" (
	"id" varchar(25) PRIMARY KEY NOT NULL,
	"name" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "industries_id_unique" UNIQUE("id"),
	CONSTRAINT "industries_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "template" (
	"id" varchar(25) PRIMARY KEY NOT NULL,
	"industry_id" varchar(25) NOT NULL,
	"industry_name" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"status" "templates_status" DEFAULT 'draft' NOT NULL,
	"min_fields" integer DEFAULT 1 NOT NULL,
	"max_fields" integer DEFAULT 300 NOT NULL,
	"min_section_levels" integer DEFAULT 1 NOT NULL,
	"max_section_levels" integer DEFAULT 2 NOT NULL,
	"min_sections" integer DEFAULT 1 NOT NULL,
	"max_sections" integer DEFAULT 20 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "template_id_unique" UNIQUE("id"),
	CONSTRAINT "template_name_industry_id_unique" UNIQUE("name","industry_id")
);
--> statement-breakpoint
ALTER TABLE "defaultField" ADD CONSTRAINT "defaultField_industry_id_industries_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."industries"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "template" ADD CONSTRAINT "template_industry_id_industries_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."industries"("id") ON DELETE cascade ON UPDATE cascade;