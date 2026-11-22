CREATE TABLE "folder" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "folder_user_parent_name_unique" UNIQUE NULLS NOT DISTINCT("user_id","parent_id","name")
);
--> statement-breakpoint
ALTER TABLE "paper" ADD COLUMN "folder_id" uuid;--> statement-breakpoint
ALTER TABLE "folder" ADD CONSTRAINT "folder_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folder" ADD CONSTRAINT "folder_parent_id_folder_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."folder"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "folder_user_id_index" ON "folder" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "folder_parent_id_index" ON "folder" USING btree ("parent_id");--> statement-breakpoint
ALTER TABLE "paper" ADD CONSTRAINT "paper_folder_id_folder_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folder"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "paper_folder_id_index" ON "paper" USING btree ("folder_id");