import { z } from 'zod';

export const jobStates = [
  'idle',
  'disc-detected',
  'reading-metadata',
  'ready',
  'ripping',
  'encoding',
  'completed',
  'failed',
  'cancelled',
  'ejected',
  'unsupported',
] as const;
export type JobState = (typeof jobStates)[number];

export const RipperCommandSchema = z.object({
  ripperId: z.string().min(1),
  command: z.enum(['startRip', 'cancelRip', 'ejectDisc', 'refreshDisc']),
});
export type RipperCommandRequest = z.infer<typeof RipperCommandSchema>;

export interface DriveSnapshot {
  ripperId: string;
  device: string;
  connected: boolean;
  state: JobState;
  mediaPresent: boolean;
  discId?: string;
  artist?: string;
  album?: string;
  currentTrack?: number;
  totalTracks?: number;
  progressPercent?: number;
  currentFile?: string;
  lastSeenAt: string;
  logs: string[];
  error?: string;
}

export interface HistoryJob {
  id: string;
  ripperId: string;
  device: string;
  state: JobState;
  artist?: string;
  album?: string;
  startedAt: string;
  finishedAt?: string;
  error?: string;
}

export function canTransition(from: JobState, to: JobState): boolean {
  if (from === to) return true;
  const terminal: JobState[] = ['completed', 'failed', 'cancelled', 'ejected', 'unsupported'];
  if (terminal.includes(from)) return to === 'disc-detected' || to === 'idle';
  const allowed: Record<JobState, JobState[]> = {
    idle: ['disc-detected', 'ready'],
    'disc-detected': ['reading-metadata', 'ready', 'ripping', 'unsupported', 'ejected', 'failed'],
    'reading-metadata': ['ready', 'ripping', 'failed', 'unsupported', 'ejected'],
    ready: ['ripping', 'ejected', 'failed'],
    ripping: ['encoding', 'completed', 'failed', 'cancelled', 'ejected'],
    encoding: ['completed', 'failed', 'cancelled', 'ejected'],
    completed: ['idle', 'disc-detected'],
    failed: ['idle', 'disc-detected'],
    cancelled: ['idle', 'disc-detected'],
    ejected: ['idle', 'disc-detected'],
    unsupported: ['idle', 'disc-detected'],
  };
  return allowed[from].includes(to);
}

export function nextStateOrThrow(from: JobState, to: JobState): JobState {
  if (!canTransition(from, to)) throw new Error(`invalid job transition ${from} -> ${to}`);
  return to;
}
