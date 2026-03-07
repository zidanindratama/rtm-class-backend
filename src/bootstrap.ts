import {
  INestApplication,
  VersioningType,
} from '@nestjs/common';
import helmet from 'helmet';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ClientDomainGuard } from './common/guards/client-domain.guard';
import { ApiResponseInterceptor } from './common/interceptors/api-response.interceptor';

export function configureApp(app: INestApplication): void {
  const corsOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const normalizedCorsOrigins = corsOrigins.map((origin) =>
    origin.toLowerCase().replace(/\/$/, ''),
  );

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "default-src": ["'self'"],
          "img-src": ["'self'", 'data:', 'https:'],
          "script-src": ["'self'", "'unsafe-inline'"],
          "style-src": ["'self'", "'unsafe-inline'"],
        },
      },
    }),
  );
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-client-domain'],
  });
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  app.useGlobalGuards(new ClientDomainGuard(normalizedCorsOrigins));
  app.useGlobalInterceptors(new ApiResponseInterceptor());
  app.useGlobalFilters(new GlobalExceptionFilter());
}
