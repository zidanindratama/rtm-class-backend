import { faker } from '@faker-js/faker';
import {
  ClassroomMemberRole,
  OtpPurpose,
  Prisma,
  PrismaClient,
  UserRole,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

const COUNTS = {
  admins: 5,
  teachers: 15,
  students: 45,
  blogPosts: 25,
  classrooms: 15,
  otpCodes: 20,
  refreshTokens: 20,
  threadPerClassroom: 2,
  commentsPerThread: 3,
};

const PASSWORD_PLAIN = 'Password123!';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

function pickMany<T>(items: T[], min: number, max: number): T[] {
  if (items.length === 0) return [];
  const amount = faker.number.int({
    min: Math.max(1, min),
    max: Math.min(max, items.length),
  });
  return faker.helpers.arrayElements(items, amount);
}

function createUserInputs(
  role: UserRole,
  count: number,
  passwordHash: string,
): Prisma.UserCreateManyInput[] {
  return Array.from({ length: count }, (_, idx) => {
    const index = idx + 1;
    const roleKey = role.toLowerCase();
    return {
      fullName: faker.person.fullName(),
      email: `${roleKey}.${index}@rtmclass.test`,
      passwordHash,
      role,
      isSuspended: role !== UserRole.ADMIN && faker.datatype.boolean({ probability: 0.05 }),
    };
  });
}

async function clearDatabase() {
  await prisma.forumCommentUpvote.deleteMany();
  await prisma.forumThreadUpvote.deleteMany();
  await prisma.forumComment.deleteMany();
  await prisma.forumThread.deleteMany();
  await prisma.classroomMember.deleteMany();
  await prisma.classroom.deleteMany();
  await prisma.blogPost.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.otp.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.user.deleteMany();
}

async function main() {
  faker.seed(20260303);

  await clearDatabase();

  const passwordHash = await bcrypt.hash(PASSWORD_PLAIN, 10);

  await prisma.user.createMany({
    data: [
      ...createUserInputs(UserRole.ADMIN, COUNTS.admins, passwordHash),
      ...createUserInputs(UserRole.TEACHER, COUNTS.teachers, passwordHash),
      ...createUserInputs(UserRole.STUDENT, COUNTS.students, passwordHash),
    ],
  });

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, role: true, fullName: true, email: true },
  });

  const admins = users.filter((user) => user.role === UserRole.ADMIN);
  const teachers = users.filter((user) => user.role === UserRole.TEACHER);
  const students = users.filter((user) => user.role === UserRole.STUDENT);

  await prisma.profile.createMany({
    data: users.map((user) => ({
      userId: user.id,
      address: `${faker.location.streetAddress()}, ${faker.location.city()}`,
      phoneNumber: faker.helpers.fromRegExp('\\+62[0-9]{10,12}'),
      pictureUrl: faker.image.avatar(),
    })),
  });

  const blogInputs: Prisma.BlogPostCreateManyInput[] = Array.from(
    { length: COUNTS.blogPosts },
    (_, idx) => {
      const title = titleCase(faker.lorem.words({ min: 4, max: 8 }));
      const isPublished = faker.datatype.boolean({ probability: 0.8 });
      const publishedAt = isPublished
        ? faker.date.between({ from: new Date('2025-01-01'), to: new Date() })
        : null;
      return {
        title,
        slug: `${faker.helpers.slugify(title).toLowerCase()}-${idx + 1}`,
        excerpt: faker.lorem.sentence(),
        content: faker.lorem.paragraphs({ min: 2, max: 5 }, '\n\n'),
        isPublished,
        publishedAt,
        authorId: faker.helpers.arrayElement([...admins, ...teachers]).id,
      };
    },
  );
  await prisma.blogPost.createMany({ data: blogInputs });

  const classroomInputs: Prisma.ClassroomCreateManyInput[] = Array.from(
    { length: COUNTS.classrooms },
    (_, idx) => ({
      name: titleCase(`${faker.word.adjective()} ${faker.word.noun()} ${idx + 1}`),
      classCode: `CLS-${faker.string.alphanumeric({ length: 6, casing: 'upper' })}-${idx + 1}`,
      institutionName: faker.company.name(),
      classLevel: faker.helpers.arrayElement(['7', '8', '9', '10', '11', '12']),
      academicYear: faker.helpers.arrayElement(['2024/2025', '2025/2026', '2026/2027']),
      description: faker.lorem.sentences(2),
      teacherId: faker.helpers.arrayElement(teachers).id,
    }),
  );
  await prisma.classroom.createMany({ data: classroomInputs });

  const classrooms = await prisma.classroom.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, teacherId: true },
  });

  const memberKey = new Set<string>();
  const classroomMembers: Prisma.ClassroomMemberCreateManyInput[] = [];
  for (const classroom of classrooms) {
    const pushMember = (userId: string, role: ClassroomMemberRole) => {
      const key = `${classroom.id}:${userId}`;
      if (memberKey.has(key)) return;
      memberKey.add(key);
      classroomMembers.push({
        classroomId: classroom.id,
        userId,
        role,
      });
    };

    pushMember(classroom.teacherId, ClassroomMemberRole.TEACHER);
    for (const student of pickMany(students, 12, 25)) {
      pushMember(student.id, ClassroomMemberRole.STUDENT);
    }
  }
  await prisma.classroomMember.createMany({ data: classroomMembers });

  const membersByClassroom = new Map<string, string[]>();
  for (const member of classroomMembers) {
    const existing = membersByClassroom.get(member.classroomId) ?? [];
    existing.push(member.userId);
    membersByClassroom.set(member.classroomId, existing);
  }

  const threadIds: string[] = [];
  for (const classroom of classrooms) {
    const classroomUsers = membersByClassroom.get(classroom.id) ?? [classroom.teacherId];
    for (let i = 0; i < COUNTS.threadPerClassroom; i++) {
      const thread = await prisma.forumThread.create({
        data: {
          classroomId: classroom.id,
          authorId: faker.helpers.arrayElement(classroomUsers),
          title: titleCase(faker.lorem.sentence({ min: 4, max: 9 })),
          content: faker.lorem.paragraphs({ min: 1, max: 3 }, '\n\n'),
        },
        select: { id: true },
      });
      threadIds.push(thread.id);
    }
  }

  const comments: { id: string; threadId: string }[] = [];
  for (const threadId of threadIds) {
    for (let i = 0; i < COUNTS.commentsPerThread; i++) {
      const existingInThread = comments.filter((comment) => comment.threadId === threadId);
      const parentComment =
        existingInThread.length > 0 && faker.datatype.boolean({ probability: 0.35 })
          ? faker.helpers.arrayElement(existingInThread)
          : null;
      const comment = await prisma.forumComment.create({
        data: {
          threadId,
          authorId: faker.helpers.arrayElement(users).id,
          parentId: parentComment?.id ?? null,
          content: faker.lorem.sentences({ min: 1, max: 3 }),
        },
        select: { id: true, threadId: true },
      });
      comments.push(comment);
    }
  }

  const threadVoteKeys = new Set<string>();
  const threadVotes: Prisma.ForumThreadUpvoteCreateManyInput[] = [];
  for (const threadId of threadIds) {
    const voters = pickMany(users, 3, 10);
    for (const voter of voters) {
      const key = `${threadId}:${voter.id}`;
      if (threadVoteKeys.has(key)) continue;
      threadVoteKeys.add(key);
      threadVotes.push({ threadId, userId: voter.id });
    }
  }
  await prisma.forumThreadUpvote.createMany({ data: threadVotes });

  const commentVoteKeys = new Set<string>();
  const commentVotes: Prisma.ForumCommentUpvoteCreateManyInput[] = [];
  for (const comment of comments) {
    const voters = pickMany(users, 2, 8);
    for (const voter of voters) {
      const key = `${comment.id}:${voter.id}`;
      if (commentVoteKeys.has(key)) continue;
      commentVoteKeys.add(key);
      commentVotes.push({ commentId: comment.id, userId: voter.id });
    }
  }
  await prisma.forumCommentUpvote.createMany({ data: commentVotes });

  await prisma.otp.createMany({
    data: Array.from({ length: COUNTS.otpCodes }, () => {
      const user = faker.helpers.arrayElement(users);
      const code = faker.string.numeric(6);
      return {
        userId: user.id,
        purpose: OtpPurpose.PASSWORD_RESET,
        codeHash: sha256(code),
        expiresAt: faker.date.soon({ days: 7 }),
        consumedAt: faker.datatype.boolean({ probability: 0.25 })
          ? faker.date.recent({ days: 2 })
          : null,
      };
    }),
  });

  await prisma.refreshToken.createMany({
    data: Array.from({ length: COUNTS.refreshTokens }, () => {
      const user = faker.helpers.arrayElement(users);
      const tokenRaw = faker.string.alphanumeric(64);
      return {
        userId: user.id,
        tokenHash: sha256(tokenRaw),
        expiresAt: faker.date.soon({ days: 30 }),
        revokedAt: faker.datatype.boolean({ probability: 0.2 })
          ? faker.date.recent({ days: 5 })
          : null,
      };
    }),
  });

  console.log('Seed completed.');
  console.log(
    JSON.stringify(
      {
        users: users.length,
        profiles: users.length,
        blogPosts: blogInputs.length,
        classrooms: classrooms.length,
        classroomMembers: classroomMembers.length,
        forumThreads: threadIds.length,
        forumComments: comments.length,
        forumThreadUpvotes: threadVotes.length,
        forumCommentUpvotes: commentVotes.length,
        otpCodes: COUNTS.otpCodes,
        refreshTokens: COUNTS.refreshTokens,
        defaultPassword: PASSWORD_PLAIN,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error('Seeding failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
