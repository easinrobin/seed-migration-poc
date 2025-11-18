CREATE TABLE "seed_versions" (
	"key" varchar(255) PRIMARY KEY NOT NULL,
	"checksum" varchar(255) NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
