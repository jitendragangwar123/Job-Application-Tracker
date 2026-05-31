import pinoHttp from 'pino-http';
import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import { logger } from '../logger';

export const requestContext = pinoHttp({
  logger,
  genReqId: (req: IncomingMessage, res: ServerResponse) => {
    const headerId =
      (Array.isArray(req.headers['x-request-id'])
        ? req.headers['x-request-id'][0]
        : req.headers['x-request-id']) ?? randomUUID();
    res.setHeader('X-Request-Id', headerId);
    return headerId;
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      remoteAddress: req.remoteAddress,
    }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});
