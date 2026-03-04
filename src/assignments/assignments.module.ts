import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ClassesModule } from '../classes/classes.module';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';

@Module({
  imports: [ClassesModule],
  controllers: [AssignmentsController],
  providers: [AssignmentsService, RolesGuard],
  exports: [AssignmentsService],
})
export class AssignmentsModule {}
