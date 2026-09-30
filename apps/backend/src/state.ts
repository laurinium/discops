import { EventEmitter } from 'node:events';
import type { ServerWritableStream } from '@grpc/grpc-js';
import type { DriveSnapshot, HistoryJob, JobState, RipperCommandRequest } from '@rippy/shared';
import { RipperCommandSchema } from '@rippy/shared';
import type { Store } from './store.js';

type Command = { commandId: string; timestampUnixMs: number; startRip?: object; cancelRip?: { reason: string }; ejectDisc?: object; refreshDisc?: object; resetDrive?: object };
type Stream = ServerWritableStream<unknown, Command>;

export class AppState extends EventEmitter {
  private drives = new Map<string, DriveSnapshot>();
  private streams = new Map<string, Stream>();
  constructor(private store: Store) { super(); }

  listDrives(): DriveSnapshot[] { return [...this.drives.values()].sort((a, b) => a.ripperId.localeCompare(b.ripperId)); }
  getDrive(ripperId: string): DriveSnapshot | undefined { return this.drives.get(ripperId); }
  ensureDrive(ripperId: string, device: string, sgDevice?: string): void {
    if (this.drives.has(ripperId)) return;
    const now = new Date().toISOString();
    const drive: DriveSnapshot = { ripperId, device, connected: false, state: 'idle', mediaPresent: false, lastSeenAt: now, logs: [] };
    if (sgDevice) drive.driveInfo = { sgDevice };
    this.drives.set(ripperId, drive);
  }
  history(): HistoryJob[] { return this.store.listJobs(); }
  attach(ripperId: string, stream: Stream): void { this.streams.set(ripperId, stream); this.patch(ripperId, { connected: true }); }
  detach(ripperId: string): void { this.streams.delete(ripperId); this.patch(ripperId, { connected: false }); }

  patch(ripperId: string, patch: Partial<DriveSnapshot>): void {
    const now = new Date().toISOString();
    const prev = this.drives.get(ripperId) ?? { ripperId, device: patch.device ?? 'unknown', connected: false, state: 'idle', mediaPresent: false, lastSeenAt: now, logs: [] };
    const next = { ...prev, ...patch, lastSeenAt: now };
    this.drives.set(ripperId, next);
    this.emit('change');
  }

  appendLog(ripperId: string, line: string): void {
    const prev = this.drives.get(ripperId);
    const logs = [...(prev?.logs ?? []), line].slice(-200);
    this.patch(ripperId, { logs });
  }

  recordJob(job: HistoryJob): void { this.store.upsertJob(job); this.emit('change'); }
  finishJob(id: string, state: JobState, error?: string): void { this.store.finishJob(id, state, error); this.emit('change'); }

  sendCommand(input: RipperCommandRequest): void {
    const req = RipperCommandSchema.parse(input);
    const stream = this.streams.get(req.ripperId);
    if (!stream) throw new Error(`ripper ${req.ripperId} is not connected`);
    const base = { commandId: crypto.randomUUID(), timestampUnixMs: Date.now() };
    if (req.command === 'startRip') stream.write({ ...base, startRip: {} });
    if (req.command === 'cancelRip') stream.write({ ...base, cancelRip: { reason: 'user-request' } });
    if (req.command === 'ejectDisc') stream.write({ ...base, ejectDisc: {} });
    if (req.command === 'refreshDisc') stream.write({ ...base, refreshDisc: {} });
    if (req.command === 'resetDrive') stream.write({ ...base, resetDrive: {} });
  }
}
