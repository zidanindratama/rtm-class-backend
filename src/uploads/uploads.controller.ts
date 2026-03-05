import {
  BadRequestException,
  Controller,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UploadsService } from './uploads.service';

type MultipartRequestLike = {
  file: () => Promise<{ toBuffer: () => Promise<Buffer> } | undefined>;
};

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
  async upload(@Req() request: MultipartRequestLike) {
    const file = await request.file();
    const buffer = file ? await file.toBuffer() : null;

    if (!buffer) {
      throw new BadRequestException('File is required');
    }

    const res = await this.svc.uploadBuffer(buffer);
    return { url: res.secure_url, publicId: res.public_id };
  }
}
