import os from 'node:os';
import * as grpc from '@grpc/grpc-js';
import { loadProto } from '@rippy/proto';
import type { DriveSnapshot, HistoryJob, JobState } from '@rippy/shared';
import type { AppState } from './state.js';
import { logger } from './logger.js';

type Event = Record<string, unknown>;
function pkg(): grpc.ServiceClientConstructor & { service: grpc.ServiceDefinition } {
  const loaded = loadProto() as Record<string, unknown>;
  const service = (((loaded.rippy as Record<string, unknown>).v1 as Record<string, unknown>).RipperService) as grpc.ServiceClientConstructor & { service: grpc.ServiceDefinition };
  return service;
}
function str(v: unknown): string | undefined { return typeof v === 'string' && v.length > 0 ? v : undefined; }
function num(v: unknown): number | undefined { return typeof v === 'number' ? v : undefined; }
function defined<T extends object>(value: Record<string, unknown>): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

export function startGrpc(state: AppState, port: number): grpc.Server {
  const server = new grpc.Server();
  server.addService(pkg().service, {
    connect(stream: grpc.ServerDuplexStream<Event, Event>) {
      let ripperId = 'unknown';
      stream.on('data', (msg: Event) => {
        ripperId = str(msg.ripperId) ?? ripperId;
        if ('hello' in msg && msg.hello && typeof msg.hello === 'object') {
          const hello = msg.hello as Event;
          state.attach(ripperId, stream as never);
          state.patch(ripperId, { device: str(hello.device) ?? 'unknown', connected: true, state: 'idle' });
          logger.info({ ripperId, device: hello.device, event: 'ripper_connected' });
        }
        if ('heartbeat' in msg) state.patch(ripperId, { connected: true });
        if ('driveState' in msg && msg.driveState && typeof msg.driveState === 'object') {
          const d = msg.driveState as Event;
          state.patch(ripperId, defined<Partial<DriveSnapshot>>({
            device: str(d.device) ?? 'unknown', mediaPresent: Boolean(d.mediaPresent), state: (str(d.state) ?? 'idle') as JobState,
            discId: str(d.discId), artist: str(d.artist), album: str(d.album), currentTrack: num(d.currentTrack), totalTracks: num(d.totalTracks),
            progressPercent: num(d.progressPercent), currentFile: str(d.currentFile), error: str(d.error),
          }));
        }
        if ('discEvent' in msg && msg.discEvent && typeof msg.discEvent === 'object') {
          const d = msg.discEvent as Event;
          const type = str(d.type);
          state.patch(ripperId, defined<Partial<DriveSnapshot>>({ mediaPresent: type !== 'DISC_REMOVED', state: type === 'UNSUPPORTED_MEDIA' ? 'unsupported' : type === 'DISC_REMOVED' ? 'ejected' : 'disc-detected', error: str(d.reason) }));
        }
        if ('ripLog' in msg && msg.ripLog && typeof msg.ripLog === 'object') {
          const l = msg.ripLog as Event;
          state.appendLog(ripperId, `[${str(l.stream) ?? 'out'}] ${str(l.line) ?? ''}`);
        }
        if ('ripEvent' in msg && msg.ripEvent && typeof msg.ripEvent === 'object') {
          const r = msg.ripEvent as Event;
          const type = str(r.type);
          const jobId = str(r.jobId) ?? 'unknown';
          if (type === 'RIP_STARTED') state.recordJob(defined<HistoryJob>({ id: jobId, ripperId, device: state.listDrives().find((d) => d.ripperId === ripperId)?.device ?? 'unknown', state: 'ripping', startedAt: new Date().toISOString() }));
          if (type === 'RIP_PROGRESS') state.patch(ripperId, defined<Partial<DriveSnapshot>>({ state: 'ripping', currentTrack: num(r.currentTrack), totalTracks: num(r.totalTracks), progressPercent: num(r.progressPercent), currentFile: str(r.currentFile) }));
          if (type === 'RIP_COMPLETED') { state.patch(ripperId, { state: 'completed', progressPercent: 100 }); state.finishJob(jobId, 'completed'); }
          if (type === 'RIP_FAILED') { state.patch(ripperId, defined<Partial<DriveSnapshot>>({ state: 'failed', error: str(r.error) })); state.finishJob(jobId, 'failed', str(r.error)); }
          if (type === 'RIP_CANCELLED') { state.patch(ripperId, { state: 'cancelled' }); state.finishJob(jobId, 'cancelled'); }
        }
      });
      stream.on('error', (err) => logger.warn({ ripperId, err, event: 'ripper_stream_error' }));
      stream.on('close', () => { logger.warn({ ripperId, event: 'ripper_disconnected', host: os.hostname() }); state.detach(ripperId); });
    },
  });
  server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (err) => {
    if (err) throw err;
    server.start();
    logger.info({ port, event: 'grpc_started' });
  });
  return server;
}
