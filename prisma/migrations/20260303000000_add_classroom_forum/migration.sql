-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "public"."ClassroomMemberRole" AS ENUM ('TEACHER', 'STUDENT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."Classroom" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "classCode" TEXT NOT NULL,
    "institutionName" TEXT,
    "classLevel" TEXT,
    "academicYear" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "teacherId" TEXT NOT NULL,
    CONSTRAINT "Classroom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."ClassroomMember" (
    "id" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "public"."ClassroomMemberRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClassroomMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."ForumThread" (
    "id" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ForumThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."ForumComment" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "parentId" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ForumComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."ForumThreadUpvote" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ForumThreadUpvote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."ForumCommentUpvote" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ForumCommentUpvote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Classroom_classCode_key" ON "public"."Classroom"("classCode");
CREATE INDEX IF NOT EXISTS "Classroom_teacherId_idx" ON "public"."Classroom"("teacherId");
CREATE INDEX IF NOT EXISTS "Classroom_createdAt_idx" ON "public"."Classroom"("createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "ClassroomMember_classroomId_userId_key" ON "public"."ClassroomMember"("classroomId", "userId");
CREATE INDEX IF NOT EXISTS "ClassroomMember_userId_idx" ON "public"."ClassroomMember"("userId");

CREATE INDEX IF NOT EXISTS "ForumThread_classroomId_createdAt_idx" ON "public"."ForumThread"("classroomId", "createdAt");
CREATE INDEX IF NOT EXISTS "ForumThread_authorId_idx" ON "public"."ForumThread"("authorId");

CREATE INDEX IF NOT EXISTS "ForumComment_threadId_createdAt_idx" ON "public"."ForumComment"("threadId", "createdAt");
CREATE INDEX IF NOT EXISTS "ForumComment_authorId_idx" ON "public"."ForumComment"("authorId");
CREATE INDEX IF NOT EXISTS "ForumComment_parentId_idx" ON "public"."ForumComment"("parentId");

CREATE UNIQUE INDEX IF NOT EXISTS "ForumThreadUpvote_threadId_userId_key" ON "public"."ForumThreadUpvote"("threadId", "userId");
CREATE INDEX IF NOT EXISTS "ForumThreadUpvote_userId_idx" ON "public"."ForumThreadUpvote"("userId");

CREATE UNIQUE INDEX IF NOT EXISTS "ForumCommentUpvote_commentId_userId_key" ON "public"."ForumCommentUpvote"("commentId", "userId");
CREATE INDEX IF NOT EXISTS "ForumCommentUpvote_userId_idx" ON "public"."ForumCommentUpvote"("userId");

-- AddForeignKey
ALTER TABLE "public"."Classroom" ADD CONSTRAINT "Classroom_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."ClassroomMember" ADD CONSTRAINT "ClassroomMember_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "public"."Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."ClassroomMember" ADD CONSTRAINT "ClassroomMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."ForumThread" ADD CONSTRAINT "ForumThread_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "public"."Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."ForumThread" ADD CONSTRAINT "ForumThread_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."ForumComment" ADD CONSTRAINT "ForumComment_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "public"."ForumThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."ForumComment" ADD CONSTRAINT "ForumComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."ForumComment" ADD CONSTRAINT "ForumComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."ForumComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."ForumThreadUpvote" ADD CONSTRAINT "ForumThreadUpvote_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "public"."ForumThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."ForumThreadUpvote" ADD CONSTRAINT "ForumThreadUpvote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."ForumCommentUpvote" ADD CONSTRAINT "ForumCommentUpvote_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "public"."ForumComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."ForumCommentUpvote" ADD CONSTRAINT "ForumCommentUpvote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
