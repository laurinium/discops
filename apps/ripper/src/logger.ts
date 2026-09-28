import pino from 'pino';
export function createLogger(ripperId: string) { return pino({ level: process.env.LOG_LEVEL ?? 'info', base: { service: 'ripper', ripperId } }); }
