import os from 'node:os';
import type { AppState } from './state.js';

export async function buildStatus(state: AppState): Promise<object> {
  const mb = await checkMusicBrainz();
  return {
    service: 'backend',
    time: new Date().toISOString(),
    host: {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      uptimeSeconds: os.uptime(),
      loadAverage: os.loadavg(),
      totalMemoryBytes: os.totalmem(),
      freeMemoryBytes: os.freemem(),
      cpuCount: os.cpus().length,
      cpus: os.cpus().map((cpu) => ({ model: cpu.model, speedMHz: cpu.speed })),
    },
    musicBrainz: mb,
    drives: state.listDrives().map((drive) => ({
      ripperId: drive.ripperId,
      device: drive.device,
      connected: drive.connected,
      state: drive.state,
      mediaPresent: drive.mediaPresent,
      trayStatus: drive.trayStatus,
      lastSeenAt: drive.lastSeenAt,
      driveInfo: drive.driveInfo,
      currentJob: {
        jobId: drive.currentJobId,
        running: ['reading-metadata', 'ripping', 'encoding'].includes(drive.state),
        artist: drive.artist,
        album: drive.album,
        discNumber: drive.discNumber,
        totalDiscs: drive.totalDiscs,
        currentTrack: drive.currentTrack,
        totalTracks: drive.totalTracks,
        error: drive.error,
      },
    })),
  };
}

async function checkMusicBrainz(): Promise<object> {
  const started = Date.now();
  try {
    const res = await fetch('https://musicbrainz.org/ws/2/?fmt=json', {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'rippymcripface/0.1.0 (https://github.com/laurinium/discops)' },
    });
    return { ok: res.ok, status: res.status, latencyMs: Date.now() - started };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - started, error: err instanceof Error ? err.message : String(err) };
  }
}
