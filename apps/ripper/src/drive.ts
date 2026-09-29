import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { statSync } from 'node:fs';

export type MediaStatus = 'present' | 'absent' | 'unknown' | 'unsupported';
export type TrayStatus = 'open' | 'closed' | 'unknown';
export interface DriveProbe {
  mediaStatus: MediaStatus;
  trayStatus: TrayStatus;
}

async function runProbeCommand(command: string, args: string[], timeoutMs: number): Promise<{ code: number | null; output: string; error?: string }> {
  return await new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ code: null, output, error: 'timeout' });
    }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { output += chunk; });
    child.stderr.on('data', (chunk: string) => { output += chunk; });
    child.on('exit', (code) => { clearTimeout(timer); resolve({ code, output }); });
    child.on('error', (err) => { clearTimeout(timer); resolve({ code: null, output, error: err.message }); });
  });
}

export async function probeDrive(device: string): Promise<DriveProbe> {
  try { statSync(device); } catch { return { mediaStatus: 'unknown', trayStatus: 'unknown' }; }

  const sg = await runProbeCommand('sg_turs', ['-v', device], 3000);
  const sgText = sg.output.toLowerCase();
  if (!sg.error) {
    if (sgText.includes('tray open')) {
      return { mediaStatus: 'absent', trayStatus: 'open' };
    }
    if (sgText.includes('medium not present') || sgText.includes('no medium')) {
      return { mediaStatus: 'absent', trayStatus: 'closed' };
    }
    if (sgText.includes('not ready') || sgText.includes('device not ready')) {
      return { mediaStatus: 'absent', trayStatus: 'unknown' };
    }
    if (sg.code === 0) return { mediaStatus: 'present', trayStatus: 'closed' };
  }

  const discid = await runProbeCommand('cd-discid', [device], 3000);
  if (/^[a-fA-F0-9]+\s+\d+\s+/.test(discid.output.trim())) return { mediaStatus: 'present', trayStatus: 'closed' };
  return { mediaStatus: 'absent', trayStatus: 'unknown' };
}

export async function checkMedia(device: string): Promise<MediaStatus> {
  return (await probeDrive(device)).mediaStatus;
}

export class UdevMonitor extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | undefined;
  private last = 0;
  constructor(private device: string) { super(); }
  start(): void {
    this.child = spawn('udevadm', ['monitor', '--udev', '--subsystem-match=block']);
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk: string) => this.handle(chunk));
    this.child.on('error', (err) => this.emit('error', err));
    this.child.on('exit', () => this.emit('exit'));
  }
  private handle(chunk: string): void {
    const name = this.device.split('/').pop();
    if (!name || !chunk.includes(name)) return;
    const now = Date.now();
    if (now - this.last < 1500) return;
    this.last = now;
    this.emit('change');
  }
  stop(): void { this.child?.kill('SIGTERM'); }
}
