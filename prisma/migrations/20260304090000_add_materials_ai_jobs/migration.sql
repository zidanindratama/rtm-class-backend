-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "public"."MaterialStatus" AS ENUM ('UPLOADED', 'PROCESSING', 'READY', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "public"."AIJobType" AS ENUM ('MCQ', 'ESSAY', 'SUMMARY', 'LKPD', 'REMEDIAL', 'DISCUSSION_TOPIC');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "public"."AIJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."Material" (
    "id" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fileUrl" TEXT NOT NULL,
    "fileMimeType" TEXT,
    "status" "public"."MaterialStatus" NOT NULL DEFAULT 'UPLOADED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."AIJob" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "type" "public"."AIJobType" NOT NULL,
    "status" "public"."AIJobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "parameters" JSONB,
    "externalJobId" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "AIJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."AIOutput" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "type" "public"."AIJobType" NOT NULL,
    "content" JSONB NOT NULL,
    "editedContent" JSONB,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AIOutput_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Material_classroomId_createdAt_idx" ON "public"."Material"("classroomId", "createdAt");
CREATE INDEX IF NOT EXISTS "Material_uploadedById_idx" ON "public"."Material"("uploadedById");
CREATE INDEX IF NOT EXISTS "AIJob_status_createdAt_idx" ON "public"."AIJob"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "AIJob_materialId_idx" ON "public"."AIJob"("materialId");
CREATE INDEX IF NOT EXISTS "AIJob_requestedById_idx" ON "public"."AIJob"("requestedById");
CREATE UNIQUE INDEX IF NOT EXISTS "AIOutput_jobId_key" ON "public"."AIOutput"("jobId");
CREATE INDEX IF NOT EXISTS "AIOutput_materialId_type_idx" ON "public"."AIOutput"("materialId", "type");

-- AddForeignKey
ALTER TABLE "public"."Material" ADD CONSTRAINT "Material_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "public"."Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."Material" ADD CONSTRAINT "Material_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."AIJob" ADD CONSTRAINT "AIJob_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "public"."Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."AIJob" ADD CONSTRAINT "AIJob_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."AIOutput" ADD CONSTRAINT "AIOutput_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "public"."Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."AIOutput" ADD CONSTRAINT "AIOutput_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."AIJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
