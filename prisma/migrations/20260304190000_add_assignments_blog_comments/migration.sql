-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "public"."AssignmentType" AS ENUM ('QUIZ_MCQ', 'QUIZ_ESSAY', 'TASK', 'REMEDIAL');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "public"."AssignmentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "public"."SubmissionStatus" AS ENUM ('SUBMITTED', 'GRADED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."BlogComment" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "parentId" TEXT,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BlogComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."Assignment" (
  "id" TEXT NOT NULL,
  "classroomId" TEXT NOT NULL,
  "materialId" TEXT,
  "createdById" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "type" "public"."AssignmentType" NOT NULL,
  "status" "public"."AssignmentStatus" NOT NULL DEFAULT 'DRAFT',
  "content" JSONB,
  "passingScore" INTEGER NOT NULL DEFAULT 70,
  "maxScore" INTEGER NOT NULL DEFAULT 100,
  "dueAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."AssignmentSubmission" (
  "id" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "answers" JSONB,
  "status" "public"."SubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
  "score" DOUBLE PRECISION,
  "feedback" TEXT,
  "gradedById" TEXT,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "gradedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssignmentSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BlogComment_postId_createdAt_idx" ON "public"."BlogComment"("postId", "createdAt");
CREATE INDEX IF NOT EXISTS "BlogComment_authorId_idx" ON "public"."BlogComment"("authorId");
CREATE INDEX IF NOT EXISTS "BlogComment_parentId_idx" ON "public"."BlogComment"("parentId");

CREATE INDEX IF NOT EXISTS "Assignment_classroomId_status_createdAt_idx" ON "public"."Assignment"("classroomId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "Assignment_createdById_idx" ON "public"."Assignment"("createdById");
CREATE INDEX IF NOT EXISTS "Assignment_materialId_idx" ON "public"."Assignment"("materialId");

CREATE UNIQUE INDEX IF NOT EXISTS "AssignmentSubmission_assignmentId_studentId_key" ON "public"."AssignmentSubmission"("assignmentId", "studentId");
CREATE INDEX IF NOT EXISTS "AssignmentSubmission_studentId_submittedAt_idx" ON "public"."AssignmentSubmission"("studentId", "submittedAt");
CREATE INDEX IF NOT EXISTS "AssignmentSubmission_assignmentId_status_idx" ON "public"."AssignmentSubmission"("assignmentId", "status");

-- AddForeignKey
ALTER TABLE "public"."BlogComment"
  ADD CONSTRAINT "BlogComment_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "public"."BlogPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."BlogComment"
  ADD CONSTRAINT "BlogComment_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."BlogComment"
  ADD CONSTRAINT "BlogComment_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "public"."BlogComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."Assignment"
  ADD CONSTRAINT "Assignment_classroomId_fkey"
  FOREIGN KEY ("classroomId") REFERENCES "public"."Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."Assignment"
  ADD CONSTRAINT "Assignment_materialId_fkey"
  FOREIGN KEY ("materialId") REFERENCES "public"."Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."Assignment"
  ADD CONSTRAINT "Assignment_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."AssignmentSubmission"
  ADD CONSTRAINT "AssignmentSubmission_assignmentId_fkey"
  FOREIGN KEY ("assignmentId") REFERENCES "public"."Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."AssignmentSubmission"
  ADD CONSTRAINT "AssignmentSubmission_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."AssignmentSubmission"
  ADD CONSTRAINT "AssignmentSubmission_gradedById_fkey"
  FOREIGN KEY ("gradedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
