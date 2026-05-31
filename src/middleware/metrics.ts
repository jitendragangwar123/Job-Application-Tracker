import client, { type Registry } from 'prom-client';
import type { NextFunction, Request, Response } from 'express';

export const registry: Registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests processed',
  labelNames: ['method', 'route', 'status'],
  registers: [registry],
});

export const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

export const cronLastRunTimestamp = new client.Gauge({
  name: 'cron_last_run_timestamp_seconds',
  help: 'Unix timestamp of the last successful run, by job name',
  labelNames: ['job'],
  registers: [registry],
});

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  // /metrics itself shouldn't be self-instrumented.
  if (req.path === '/metrics') return next();
  const stop = httpRequestDurationSeconds.startTimer();
  res.on('finish', () => {
    const route = req.route?.path ? `${req.baseUrl ?? ''}${req.route.path}` : req.path;
    const labels = { method: req.method, route, status: String(res.statusCode) };
    httpRequestsTotal.inc(labels);
    stop(labels);
  });
  next();
}
