import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
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
import {
  createMaterialSchema,
  materialJobsQuerySchema,
  queryMaterialsSchema,
  updateMaterialSchema,
} from './materials.schemas';
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
  @ApiQuery({
    name: 'classId',
    required: false,
    schema: { type: 'string', format: 'uuid' },
  })
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

  @Patch(':id')
  @ApiOperation({ summary: 'Update material metadata' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string', example: 'Bab 1 Aljabar Linear (Revisi)' },
        description: {
          type: 'string',
          example: 'Materi pertemuan pertama versi update.',
        },
        fileUrl: { type: 'string', format: 'uri' },
        fileMimeType: { type: 'string', example: 'application/pdf' },
      },
    },
  })
  updateMaterial(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(updateMaterialSchema)) body: unknown,
  ) {
    return this.materialsService.updateMaterial(user, id, body as any);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete material (owner/admin)' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  deleteMaterial(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.materialsService.deleteMaterial(user, id);
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

  @Get(':id/jobs')
  @ApiOperation({ summary: 'List AI jobs for material (with optional overview)' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiQuery({
    name: 'includeOverview',
    required: false,
    schema: { type: 'boolean', default: false },
  })
  getMaterialJobs(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) materialId: string,
    @Query(new ZodValidationPipe(materialJobsQuerySchema)) query: unknown,
  ) {
    return this.materialsService.getMaterialJobs(user, materialId, query as any);
  }

  @Get(':id/ai-overview')
  @ApiOperation({ summary: 'Get AI progress overview for one material' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  getMaterialAiOverview(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) materialId: string,
  ) {
    return this.materialsService.getMaterialAiOverview(user, materialId);
  }
}
