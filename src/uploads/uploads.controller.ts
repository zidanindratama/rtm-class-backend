import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadsService } from './uploads.service';

@Controller('uploads')
@ApiTags('Uploads')
@ApiHeader({
  name: 'x-client-domain',
  required: true,
  description: 'Frontend origin domain (example: https://my-domain.com)',
  schema: { type: 'string', default: 'http://localhost:3000' },
})
export class UploadsController {
  constructor(private svc: UploadsService) {}

  @Post()
  @ApiOperation({ summary: 'Upload file to Cloudinary' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file?.buffer) {
      throw new BadRequestException('File is required');
    }

    const res = await this.svc.uploadBuffer(file.buffer);
    return { url: res.secure_url, publicId: res.public_id };
  }
}
