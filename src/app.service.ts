import { Injectable } from '@nestjs/common';

type ParsedDatabaseInfo = {
  provider: string;
  host: string | null;
  database: string | null;
};

export type AppStatusResponse = {
  message: string;
  status: 'ok';
  service: string;
  environment: string;
  version: string;
  timestamp: string;
  uptimeSeconds: number;
  docsUrl: string;
  checks: {
    api: 'up';
    database: ParsedDatabaseInfo;
    redis: {
      host: string;
      port: number;
    };
  };
};

@Injectable()
export class AppService {
  getHello(): AppStatusResponse {
    const port = Number(process.env.PORT ?? 5000);
    const host = process.env.APP_HOST ?? 'localhost';

    return {
      message: 'RTM Class backend server is running.',
      status: 'ok',
      service: 'rtm-class-backend',
      environment: process.env.NODE_ENV ?? 'development',
      version: process.env.npm_package_version ?? '0.0.1',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Number(process.uptime().toFixed(2)),
      docsUrl: `http://${host}:${port}/docs`,
      checks: {
        api: 'up',
        database: this.parseDatabaseInfo(process.env.DATABASE_URL),
        redis: {
          host: process.env.REDIS_HOST ?? 'localhost',
          port: Number(process.env.REDIS_PORT ?? 6379),
        },
      },
    };
  }

  private parseDatabaseInfo(databaseUrl?: string): ParsedDatabaseInfo {
    if (!databaseUrl) {
      return {
        provider: 'unknown',
        host: null,
        database: null,
      };
    }

    try {
      const parsed = new URL(databaseUrl);
      return {
        provider: parsed.protocol.replace(':', ''),
        host: parsed.hostname || null,
        database: parsed.pathname.replace('/', '') || null,
      };
    } catch {
      return {
        provider: 'unknown',
        host: null,
        database: null,
      };
    }
  }
}
