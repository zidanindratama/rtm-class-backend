import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/types';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { createMaterialSchema, queryMaterialsSchema } from './materials.schemas';
import { MaterialsService } from './materials.service';

@Controller({ path: 'materials', version: '1' })
@UseGuards(JwtAuthGuard)
@ApiTags('Materials')
@ApiHeader({
  name: 'x-client-domain',
  required: true,
  description: 'Frontend origin domain (example: https://my-domain.com)',
  schema: { type: 'string', default: 'http://localhost:3000' },
})
@ApiBearerAuth('access-token')
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @Get()
  @ApiOperation({ summary: 'List materials accessible by current user' })
  @ApiQuery({ name: 'classId', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'per_page', required: false, example: 10 })
  @ApiQuery({ name: 'search', required: false, example: 'algebra' })
  @ApiQuery({ name: 'sort_by', required: false, enum: ['createdAt', 'title'] })
  @ApiQuery({ name: 'sort_order', required: false, enum: ['asc', 'desc'] })
  listMaterials(
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(queryMaterialsSchema)) query: unknown,
  ) {
    return this.materialsService.listMaterials(user, query as any);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get material detail by id' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  getMaterialById(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.materialsService.getMaterialById(user, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create material metadata' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['classId', 'title', 'fileUrl'],
      properties: {
        classId: { type: 'string', format: 'uuid' },
        title: { type: 'string', example: 'Bab 1 Aljabar Linear' },
        description: { type: 'string', example: 'Materi pertemuan pertama.' },
        fileUrl: { type: 'string', format: 'uri' },
        fileMimeType: { type: 'string', example: 'application/pdf' },
      },
    },
  })
  createMaterial(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createMaterialSchema)) body: unknown,
  ) {
    return this.materialsService.createMaterial(user, body as any);
  }

  @Get(':id/outputs')
  @ApiOperation({ summary: 'List AI outputs for material' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  getMaterialOutputs(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) materialId: string,
  ) {
    return this.materialsService.getMaterialOutputs(user, materialId);
  }
}
