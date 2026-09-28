import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { statSync } from 'node:fs';

export type MediaStatus = 'present' | 'absent' | 'unknown' | 'unsupported';

export async function checkMedia(device: string): Promise<MediaStatus> {
  try { statSync(device); } catch { return 'unknown'; }
  const args = ['-q', '-d', device, 'discid'];
  return await new Promise((resolve) => {
    const child = spawn('cd-discid', args, { stdio: ['ignore', 'ignore', 'ignore'] });
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve('unknown'); }, 3000);
    child.on('exit', (code) => { clearTimeout(timer); resolve(code === 0 ? 'present' : 'absent'); });
    child.on('error', () => { clearTimeout(timer); resolve('unknown'); });
  });
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
