import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class ClientDomainGuard implements CanActivate {
  constructor(private readonly allowedDomains: string[]) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const url = req.url ?? '';
    const pathOnly = url.split('?')[0];

    if (
      req.method === 'OPTIONS' ||
      url.startsWith('/docs') ||
      url.startsWith('/docs-json') ||
      /\/api\/v\d+\/ai\/jobs\/[^/]+\/callback$/.test(pathOnly)
    ) {
      return true;
    }

    const rawHeader = req.headers['x-client-domain'];
    const clientDomain = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    if (!clientDomain) {
      throw new BadRequestException({
        message: 'Missing required header: x-client-domain',
        details: {
          required_header: 'x-client-domain',
          example: 'https://my-domain.com',
        },
      });
    }

    let normalizedDomain: string;
    try {
      const parsed = new URL(clientDomain);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Invalid protocol');
      }
      normalizedDomain = parsed.origin.toLowerCase();
    } catch {
      throw new BadRequestException({
        message: 'Invalid x-client-domain header value',
        details: {
          required_format: 'absolute URL origin, e.g. https://my-domain.com',
        },
      });
    }

    if (
      this.allowedDomains.length > 0 &&
      !this.allowedDomains.includes(normalizedDomain)
    ) {
      throw new ForbiddenException({
        message: 'Client domain is not allowed',
        details: {
          provided: normalizedDomain,
          allowed: this.allowedDomains,
        },
      });
    }

    return true;
  }
}
