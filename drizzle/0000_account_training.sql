CREATE TABLE "fitt_account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fitt_auth_rate_limits" (
	"id" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fitt_session" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "fitt_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "fitt_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fitt_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "fitt_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fitt_training_mutations" (
	"user_id" text NOT NULL,
	"mutation_id" varchar(128) NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"revision" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fitt_training_mutations_user_id_mutation_id_pk" PRIMARY KEY("user_id","mutation_id"),
	CONSTRAINT "fitt_training_mutation_revision_valid" CHECK ("fitt_training_mutations"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "fitt_training_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"profile" jsonb NOT NULL,
	"preferences" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fitt_training_revision_valid" CHECK ("fitt_training_profiles"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "fitt_training_routines" (
	"user_id" text NOT NULL,
	"id" varchar(128) NOT NULL,
	"position" integer NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "fitt_training_routines_user_id_id_pk" PRIMARY KEY("user_id","id"),
	CONSTRAINT "fitt_training_routine_position_valid" CHECK ("fitt_training_routines"."position" between 0 and 99)
);
--> statement-breakpoint
CREATE TABLE "fitt_training_workout_sets" (
	"user_id" text NOT NULL,
	"workout_id" varchar(128) NOT NULL,
	"id" varchar(128) NOT NULL,
	"exercise_id" varchar(128) NOT NULL,
	"exercise_index" integer NOT NULL,
	"set_index" integer NOT NULL,
	"target" double precision NOT NULL,
	"reps" double precision NOT NULL,
	"load" double precision NOT NULL,
	"target_load" double precision NOT NULL,
	"effort" varchar(8) NOT NULL,
	"done" boolean NOT NULL,
	CONSTRAINT "fitt_training_workout_sets_user_id_workout_id_id_pk" PRIMARY KEY("user_id","workout_id","id"),
	CONSTRAINT "fitt_training_set_position_valid" CHECK ("fitt_training_workout_sets"."exercise_index" between 0 and 29 and "fitt_training_workout_sets"."set_index" between 0 and 9),
	CONSTRAINT "fitt_training_set_reps_valid" CHECK ("fitt_training_workout_sets"."reps" between 0 and 600 and "fitt_training_workout_sets"."target" between 1 and 600),
	CONSTRAINT "fitt_training_set_load_valid" CHECK ("fitt_training_workout_sets"."load" between 0 and 300 and "fitt_training_workout_sets"."target_load" between 0 and 300),
	CONSTRAINT "fitt_training_set_effort_valid" CHECK ("fitt_training_workout_sets"."effort" in ('easy', 'good', 'hard'))
);
--> statement-breakpoint
CREATE TABLE "fitt_training_workouts" (
	"user_id" text NOT NULL,
	"id" varchar(128) NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"duration" double precision NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "fitt_training_workouts_user_id_id_pk" PRIMARY KEY("user_id","id"),
	CONSTRAINT "fitt_training_workout_duration_valid" CHECK ("fitt_training_workouts"."duration" between 1 and 180)
);
--> statement-breakpoint
ALTER TABLE "fitt_account" ADD CONSTRAINT "fitt_account_user_id_fitt_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."fitt_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fitt_session" ADD CONSTRAINT "fitt_session_user_id_fitt_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."fitt_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fitt_training_mutations" ADD CONSTRAINT "fitt_training_mutations_user_id_fitt_training_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."fitt_training_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fitt_training_profiles" ADD CONSTRAINT "fitt_training_profiles_user_id_fitt_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."fitt_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fitt_training_routines" ADD CONSTRAINT "fitt_training_routines_user_id_fitt_training_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."fitt_training_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fitt_training_workout_sets" ADD CONSTRAINT "fitt_training_workout_sets_workout_fk" FOREIGN KEY ("user_id","workout_id") REFERENCES "public"."fitt_training_workouts"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fitt_training_workouts" ADD CONSTRAINT "fitt_training_workouts_user_id_fitt_training_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."fitt_training_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fitt_account_user_idx" ON "fitt_account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fitt_account_provider_idx" ON "fitt_account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "fitt_auth_rate_limits_reset_idx" ON "fitt_auth_rate_limits" USING btree ("reset_at");--> statement-breakpoint
CREATE INDEX "fitt_session_user_idx" ON "fitt_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "fitt_verification_identifier_idx" ON "fitt_verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "fitt_training_mutations_recent_idx" ON "fitt_training_mutations" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "fitt_training_workout_sets_position_idx" ON "fitt_training_workout_sets" USING btree ("user_id","workout_id","exercise_index","set_index");--> statement-breakpoint
CREATE INDEX "fitt_training_workout_sets_exercise_idx" ON "fitt_training_workout_sets" USING btree ("user_id","exercise_id");--> statement-breakpoint
CREATE INDEX "fitt_training_workouts_completed_idx" ON "fitt_training_workouts" USING btree ("user_id","completed_at");