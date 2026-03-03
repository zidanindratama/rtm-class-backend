import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  const port = Number(process.env.PORT ?? 5000);
  await app.listen(port, '0.0.0.0');
  Logger.log(
    `SmartClass backend is running on http://localhost:${port}/api/v1`,
    'Bootstrap',
  );
}
bootstrap();
