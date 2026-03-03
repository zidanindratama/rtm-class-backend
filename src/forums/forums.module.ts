import { Module } from '@nestjs/common';
import { ClassesModule } from '../classes/classes.module';
import { ForumsController } from './forums.controller';
import { ForumsService } from './forums.service';

@Module({
  imports: [ClassesModule],
  controllers: [ForumsController],
  providers: [ForumsService],
})
export class ForumsModule {}
