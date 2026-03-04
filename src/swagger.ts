import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const swaggerHelperScript = `
(() => {
  const SECURITY_KEY = 'access-token';
  const TOKEN_KEY = 'rtm_docs_access_token';
  const DOMAIN_KEY = 'rtm_docs_client_domain';
  const DEFAULT_DOMAIN = 'http://localhost:3000';

  const preauthorize = (token) => {
    if (!token) return;
    const ui = window.ui;
    if (ui && typeof ui.preauthorizeApiKey === 'function') {
      ui.preauthorizeApiKey(SECURITY_KEY, token);
    }
  };

  const restoreToken = () => {
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      if (token) preauthorize(token);
    } catch (_) {}
  };

  const getClientDomain = () => {
    try {
      const saved = localStorage.getItem(DOMAIN_KEY);
      if (saved) return saved;
      localStorage.setItem(DOMAIN_KEY, DEFAULT_DOMAIN);
      return DEFAULT_DOMAIN;
    } catch (_) {
      return DEFAULT_DOMAIN;
    }
  };

  const setClientDomain = (value) => {
    if (typeof value !== 'string' || value.trim().length === 0) return;
    try {
      localStorage.setItem(DOMAIN_KEY, value.trim());
    } catch (_) {}
  };

  const syncDomainParameterInputs = () => {
    const rows = document.querySelectorAll('table.parameters tbody tr');
    rows.forEach((row) => {
      const nameCell = row.querySelector('.parameters-col_name');
      if (!nameCell) return;
      const key = (nameCell.textContent || '').toLowerCase();
      if (!key.includes('x-client-domain')) return;

      const input = row.querySelector('input');
      if (!(input instanceof HTMLInputElement)) return;

      if (!input.value || input.value.trim().length === 0) {
        const value = getClientDomain();
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }

      if (!input.dataset.rtmDomainBound) {
        input.dataset.rtmDomainBound = '1';
        input.addEventListener('input', (event) => {
          const target = event.target;
          if (target instanceof HTMLInputElement) {
            setClientDomain(target.value);
          }
        });
      }
    });
  };

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    let url = '';
    if (typeof input === 'string') url = input;
    else if (input && typeof input.url === 'string') url = input.url;

    const isApiRequest = url.includes('/api/');
    let nextInput = input;
    let nextInit = init || {};

    if (isApiRequest) {
      const baseHeaders =
        (init && init.headers) ||
        (typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined);
      const headers = new Headers(baseHeaders);
      if (!headers.get('x-client-domain')) {
        headers.set('x-client-domain', getClientDomain());
      }
      nextInit = { ...(init || {}), headers };
      if (typeof Request !== 'undefined' && input instanceof Request) {
        nextInput = new Request(input, nextInit);
        nextInit = undefined;
      }
    }

    const response = await originalFetch(nextInput, nextInit);

    try {
      const shouldCaptureToken =
        /\\/api\\/v1\\/auth\\/(sign-in|sign-up|refresh)/.test(url) && response.ok;
      if (shouldCaptureToken) {
        const clone = response.clone();
        const contentType = clone.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const payload = await clone.json();
          const token = payload?.data?.access_token;
          if (typeof token === 'string' && token.length > 0) {
            localStorage.setItem(TOKEN_KEY, token);
            preauthorize(token);
          }
        }
      }
    } catch (_) {}

    return response;
  };

  let retry = 0;
  const timer = setInterval(() => {
    retry += 1;
    restoreToken();
    syncDomainParameterInputs();
    if (window.ui || retry > 20) clearInterval(timer);
  }, 500);

  const observer = new MutationObserver(() => syncDomainParameterInputs());
  observer.observe(document.body, { childList: true, subtree: true });
})();
`;

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

function hasPaginationQuery(operation: any): boolean {
  if (!Array.isArray(operation?.parameters)) return false;

  return operation.parameters.some((parameter: any) => {
    if (!parameter || typeof parameter !== 'object' || '$ref' in parameter)
      return false;
    return (
      parameter.in === 'query' &&
      (parameter.name === 'page' || parameter.name === 'per_page')
    );
  });
}

function isProtectedOperation(operation: any): boolean {
  return Array.isArray(operation?.security) && operation.security.length > 0;
}

function buildSuccessExample(operation: any, method: string) {
  const summary =
    typeof operation?.summary === 'string' &&
    operation.summary.trim().length > 0
      ? operation.summary.trim()
      : 'Request';
  const isListEndpoint = method === 'get' && hasPaginationQuery(operation);

  return {
    message: `${summary} successful`,
    data: isListEndpoint
      ? [
          {
            id: 'sample_id_123',
            name: 'Sample Data',
          },
        ]
      : {
          id: 'sample_id_123',
          name: 'Sample Data',
        },
    meta: isListEndpoint
      ? {
          current_page: 1,
          total_pages: 1,
          total_items: 1,
        }
      : null,
    error: null,
  };
}

function buildErrorExample(code: string, message: string, details?: unknown) {
  return {
    message,
    data: null,
    meta: null,
    error: {
      code,
      details: details ?? null,
    },
  };
}

function enrichSwaggerDocument(document: any): void {
  document.components ??= {};
  document.components.schemas ??= {};

  document.components.schemas.ApiMeta = {
    type: 'object',
    nullable: true,
    properties: {
      current_page: { type: 'number', example: 1 },
      total_pages: { type: 'number', example: 4 },
      total_items: { type: 'number', example: 37 },
    },
  };

  document.components.schemas.ApiError = {
    type: 'object',
    nullable: true,
    properties: {
      code: { type: 'string', example: 'BAD_REQUEST' },
      details: {
        nullable: true,
        oneOf: [
          { type: 'string' },
          { type: 'object', additionalProperties: true },
        ],
      },
    },
  };

  const paths = document.paths ?? {};

  Object.keys(paths).forEach((pathKey) => {
    const pathItem = paths[pathKey];

    HTTP_METHODS.forEach((method) => {
      const operation = pathItem?.[method];
      if (!operation) return;

      if (!operation.description || operation.description.trim().length === 0) {
        operation.description = [
          'Returns response envelope with `message`, `data`, `meta`, and `error`.',
          'Required header: `x-client-domain`.',
          isProtectedOperation(operation)
            ? 'This endpoint also requires `Authorization: Bearer <access_token>`.'
            : 'This endpoint is publicly accessible.',
        ].join('\n');
      }

      operation.responses ??= {};
      const successStatus = method === 'post' ? '201' : '200';

      if (!operation.responses[successStatus]) {
        operation.responses[successStatus] = {
          description: 'Successful response',
          content: {
            'application/json': {
              example: buildSuccessExample(operation, method),
            },
          },
        };
      }

      if (!operation.responses['400']) {
        operation.responses['400'] = {
          description: 'Validation error or bad request',
          content: {
            'application/json': {
              example: buildErrorExample('BAD_REQUEST', 'Validation failed', {
                fieldErrors: {
                  email: ['Invalid email address'],
                },
              }),
            },
          },
        };
      }

      if (isProtectedOperation(operation)) {
        if (!operation.responses['401']) {
          operation.responses['401'] = {
            description: 'Authentication required or token invalid',
            content: {
              'application/json': {
                example: buildErrorExample(
                  'UNAUTHORIZED',
                  'Unauthorized access',
                ),
              },
            },
          };
        }

        if (!operation.responses['403']) {
          operation.responses['403'] = {
            description:
              'Authenticated but not allowed to access this resource',
            content: {
              'application/json': {
                example: buildErrorExample('FORBIDDEN', 'Forbidden'),
              },
            },
          };
        }
      }

      if (pathKey.includes('{') && !operation.responses['404']) {
        operation.responses['404'] = {
          description: 'Requested resource not found',
          content: {
            'application/json': {
              example: buildErrorExample('NOT_FOUND', 'Resource not found'),
            },
          },
        };
      }

      if (
        (method === 'post' || method === 'put' || method === 'patch') &&
        !operation.responses['409']
      ) {
        operation.responses['409'] = {
          description: 'Conflict, usually duplicate data',
          content: {
            'application/json': {
              example: buildErrorExample('CONFLICT', 'Data already exists'),
            },
          },
        };
      }

      if (!operation.responses['500']) {
        operation.responses['500'] = {
          description: 'Unexpected server error',
          content: {
            'application/json': {
              example: buildErrorExample(
                'INTERNAL_SERVER_ERROR',
                'Unexpected server error',
              ),
            },
          },
        };
      }
    });
  });
}

export function configureSwagger(app: INestApplication): void {
  const docsConfig = new DocumentBuilder()
    .setTitle('RTM Class API')
    .setDescription(
      [
        'Backend API documentation for RTM Class.',
        '',
        '## Global Request Rules',
        '- Every request must include header `x-client-domain` (e.g. `https://my-domain.com`).',
        '- For protected endpoints, also include `Authorization: Bearer <access_token>`.',
        '- Standard response format for all endpoints:',
      ].join('\n'),
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT access token',
      },
      'access-token',
    )
    .build();

  const swaggerDocument = SwaggerModule.createDocument(app, docsConfig);
  enrichSwaggerDocument(swaggerDocument);

  SwaggerModule.setup('docs', app, swaggerDocument, {
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
    },
    customJsStr: swaggerHelperScript,
  });
}
