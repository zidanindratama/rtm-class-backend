import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { BlogsModule } from './blogs/blogs.module';
import { ClassesModule } from './classes/classes.module';
import { ForumsModule } from './forums/forums.module';
import { PrismaModule } from './prisma/prisma.module';
import { UploadsModule } from './uploads/uploads.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    PrismaModule,
    AuthModule,
    UploadsModule,
    UsersModule,
    BlogsModule,
    ClassesModule,
    ForumsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
