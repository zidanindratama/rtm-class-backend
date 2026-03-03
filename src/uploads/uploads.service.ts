import { Injectable, Inject } from '@nestjs/common';
import { v2 as Cloudinary, UploadApiResponse } from 'cloudinary';

@Injectable()
export class UploadsService {
  constructor(@Inject('CLOUDINARY') private cloud: typeof Cloudinary) {}

  async uploadBuffer(
    buffer: Buffer,
    folder = 'inventory',
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const stream = this.cloud.uploader.upload_stream(
        { folder },
        (err, result) => {
          if (err) return reject(err);
          resolve(result!);
        },
      );
      stream.end(buffer);
    });
  }
}
