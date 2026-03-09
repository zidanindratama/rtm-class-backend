-- CreateEnum
CREATE TYPE "public"."AssignmentQuestionType" AS ENUM ('MCQ', 'ESSAY', 'TASK', 'REMEDIAL', 'GENERIC');

-- CreateTable
CREATE TABLE "public"."AssignmentSubmissionAttempt" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "answers" JSONB,
    "status" "public"."SubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "score" DOUBLE PRECISION,
    "feedback" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentSubmissionAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AssignmentSubmissionAttachment" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "attemptId" TEXT,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT,
    "fileMimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentSubmissionAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AssignmentQuestionGrade" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "attemptId" TEXT,
    "questionId" TEXT NOT NULL,
    "questionType" "public"."AssignmentQuestionType" NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "maxScore" DOUBLE PRECISION NOT NULL,
    "isCorrect" BOOLEAN,
    "feedback" TEXT,
    "gradedById" TEXT,
    "gradedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentQuestionGrade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssignmentSubmissionAttempt_submissionId_submittedAt_idx" ON "public"."AssignmentSubmissionAttempt"("submissionId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentSubmissionAttempt_submissionId_attemptNumber_key" ON "public"."AssignmentSubmissionAttempt"("submissionId", "attemptNumber");

-- CreateIndex
CREATE INDEX "AssignmentSubmissionAttachment_submissionId_idx" ON "public"."AssignmentSubmissionAttachment"("submissionId");

-- CreateIndex
CREATE INDEX "AssignmentSubmissionAttachment_attemptId_idx" ON "public"."AssignmentSubmissionAttachment"("attemptId");

-- CreateIndex
CREATE INDEX "AssignmentQuestionGrade_submissionId_questionId_idx" ON "public"."AssignmentQuestionGrade"("submissionId", "questionId");

-- CreateIndex
CREATE INDEX "AssignmentQuestionGrade_attemptId_idx" ON "public"."AssignmentQuestionGrade"("attemptId");

-- CreateIndex
CREATE INDEX "AssignmentQuestionGrade_gradedById_idx" ON "public"."AssignmentQuestionGrade"("gradedById");

-- AddForeignKey
ALTER TABLE "public"."AssignmentSubmissionAttempt" ADD CONSTRAINT "AssignmentSubmissionAttempt_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "public"."AssignmentSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AssignmentSubmissionAttachment" ADD CONSTRAINT "AssignmentSubmissionAttachment_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "public"."AssignmentSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AssignmentSubmissionAttachment" ADD CONSTRAINT "AssignmentSubmissionAttachment_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "public"."AssignmentSubmissionAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AssignmentQuestionGrade" ADD CONSTRAINT "AssignmentQuestionGrade_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "public"."AssignmentSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AssignmentQuestionGrade" ADD CONSTRAINT "AssignmentQuestionGrade_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "public"."AssignmentSubmissionAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AssignmentQuestionGrade" ADD CONSTRAINT "AssignmentQuestionGrade_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
