import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import multipart from '@fastify/multipart';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { configureSwagger } from './swagger';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );
  await app.register(multipart as any);
  configureApp(app);
  configureSwagger(app);

  const port = Number(process.env.PORT ?? 5000);
  await app.listen(port, '0.0.0.0');
  Logger.log(
    `RTM Class backend is running on http://localhost:${port}/api/v1`,
    'Bootstrap',
  );
  Logger.log(
    `Swagger docs available at http://localhost:${port}/docs`,
    'Bootstrap',
  );
}
bootstrap();
