-- Rename old enum and recreate with provider-native statuses
ALTER TYPE "public"."AIJobStatus" RENAME TO "AIJobStatus_old";

CREATE TYPE "public"."AIJobStatus" AS ENUM (
  'accepted',
  'processing',
  'succeeded',
  'failed_processing',
  'failed_delivery'
);

-- Convert existing rows from old statuses to the new enum values
ALTER TABLE "public"."AIJob"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "public"."AIJobStatus"
  USING (
    CASE
      WHEN "status"::text = 'QUEUED' THEN 'accepted'
      WHEN "status"::text = 'RUNNING' THEN 'processing'
      WHEN "status"::text = 'COMPLETED' THEN 'succeeded'
      WHEN "status"::text = 'FAILED' THEN 'failed_processing'
      WHEN "status"::text = 'accepted' THEN 'accepted'
      WHEN "status"::text = 'processing' THEN 'processing'
      WHEN "status"::text = 'succeeded' THEN 'succeeded'
      WHEN "status"::text = 'failed_processing' THEN 'failed_processing'
      WHEN "status"::text = 'failed_delivery' THEN 'failed_delivery'
      ELSE 'failed_processing'
    END
  )::"public"."AIJobStatus",
  ALTER COLUMN "status" SET DEFAULT 'accepted';

DROP TYPE "public"."AIJobStatus_old";
