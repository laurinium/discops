import express from 'express';
import cors from 'cors';
import type { AppState } from './state.js';

export function createHttp(state: AppState, corsOrigin: string): express.Express {
  const app = express();
  app.use(cors({ origin: corsOrigin === '*' ? true : corsOrigin }));
  app.use(express.json({ limit: '64kb' }));
  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  app.get('/api/state', (_req, res) => res.json({ drives: state.listDrives(), history: state.history() }));
  app.post('/api/rippers/:ripperId/:command', (req, res, next) => {
    try {
      const { ripperId, command } = req.params;
      if (!['startRip', 'cancelRip', 'ejectDisc', 'refreshDisc'].includes(command ?? '')) {
        res.status(404).json({ error: 'unknown command' });
        return;
      }
      state.sendCommand({ ripperId: ripperId ?? '', command: command as never });
      res.status(202).json({ ok: true });
    } catch (err) { next(err); }
  });
  app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream'); res.setHeader('Cache-Control', 'no-cache'); res.setHeader('Connection', 'keep-alive');
    const send = () => res.write(`data: ${JSON.stringify({ drives: state.listDrives(), history: state.history() })}\n\n`);
    send(); state.on('change', send); req.on('close', () => state.off('change', send));
  });
  return app;
}
