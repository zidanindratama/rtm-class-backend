import { Type } from 'class-transformer';
import { IsBoolean } from 'class-validator';

export class SuspendUserDto {
  @Type(() => Boolean)
  @IsBoolean()
  suspended: boolean;
}
