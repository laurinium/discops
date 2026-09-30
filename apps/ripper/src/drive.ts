import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { readFileSync, statSync } from 'node:fs';

export type MediaStatus = 'present' | 'absent' | 'unknown' | 'unsupported';
export type TrayStatus = 'open' | 'closed' | 'unknown';
export interface DriveProbe {
  mediaStatus: MediaStatus;
  trayStatus: TrayStatus;
}

export interface LocalDriveInfo {
  vendor?: string;
  model?: string;
  revision?: string;
  canOpenTray?: boolean;
  canCloseTray?: boolean;
  canLockTray?: boolean;
  canReadDvd?: boolean;
  canWriteCdr?: boolean;
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

export function readLocalDriveInfo(device: string): LocalDriveInfo {
  const name = device.split('/').pop();
  const info: LocalDriveInfo = {};
  if (!name) return info;
  try {
    const vendor = readFileSync(`/sys/block/${name}/device/vendor`, 'utf8').trim();
    const model = readFileSync(`/sys/block/${name}/device/model`, 'utf8').trim();
    const revision = readFileSync(`/sys/block/${name}/device/rev`, 'utf8').trim();
    if (vendor) info.vendor = vendor;
    if (model) info.model = model;
    if (revision) info.revision = revision;
  } catch { /* best effort */ }
  try {
    const cdromInfo = readFileSync('/proc/sys/dev/cdrom/info', 'utf8');
    const lines = Object.fromEntries(cdromInfo.split('\n').map((line) => {
      const [key, rest] = line.split(':');
      return [key?.trim(), rest?.trim().split(/\s+/) ?? []];
    }));
    const drives = lines['drive name'] ?? [];
    const idx = drives.indexOf(name);
    const boolAt = (key: string): boolean | undefined => idx >= 0 && lines[key]?.[idx] !== undefined ? lines[key][idx] === '1' : undefined;
    const canCloseTray = boolAt('Can close tray');
    const canOpenTray = boolAt('Can open tray');
    const canLockTray = boolAt('Can lock tray');
    const canReadDvd = boolAt('Can read DVD');
    const canWriteCdr = boolAt('Can write CD-R');
    if (canCloseTray !== undefined) info.canCloseTray = canCloseTray;
    if (canOpenTray !== undefined) info.canOpenTray = canOpenTray;
    if (canLockTray !== undefined) info.canLockTray = canLockTray;
    if (canReadDvd !== undefined) info.canReadDvd = canReadDvd;
    if (canWriteCdr !== undefined) info.canWriteCdr = canWriteCdr;
  } catch { /* best effort */ }
  return info;
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
