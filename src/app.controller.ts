import { Controller, Get } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService, AppStatusResponse } from './app.service';

@Controller()
@ApiTags('System')
@ApiHeader({
  name: 'x-client-domain',
  required: true,
  description: 'Frontend origin domain (example: https://my-domain.com)',
  schema: { type: 'string', default: 'http://localhost:3000' },
})
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'System status / welcome endpoint' })
  getHello(): AppStatusResponse {
    return this.appService.getHello();
  }
}
