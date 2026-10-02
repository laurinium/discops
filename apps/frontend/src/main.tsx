import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, AlertTriangle, Disc3, Download, Eject, ListMusic, Pause, Play, RefreshCw, RotateCcw, Search, Server, Wifi } from 'lucide-react';
import type { DriveSnapshot, HistoryJob, RippedAlbum } from '@rippy/shared';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './components/ui/alert-dialog.js';
import { Badge } from './components/ui/badge.js';
import { Button } from './components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card.js';
import { Input, Select } from './components/ui/form.js';
import { Progress } from './components/ui/progress.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './components/ui/table.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs.js';
import './style.css';

interface ApiState { drives: DriveSnapshot[]; history: HistoryJob[]; albums: RippedAlbum[] }
interface StatusData { time: string; host: Record<string, unknown>; musicBrainz: Record<string, unknown>; drives: Array<Record<string, unknown>> }
interface AlbumGroup { key: string; latest: RippedAlbum; items: RippedAlbum[]; drives: string[] }
interface HistoryGroup { key: string; latest: HistoryJob; items: HistoryJob[] }
const empty: ApiState = { drives: [], history: [], albums: [] };
const apiBase = import.meta.env.VITE_API_BASE ?? '';

function command(ripperId: string, cmd: string): Promise<void> {
  return fetch(`${apiBase}/api/rippers/${encodeURIComponent(ripperId)}/${cmd}`, { method: 'POST' }).then((r) => {
    if (!r.ok) throw new Error(`command failed: ${r.status}`);
  });
}

function debugCommand(cmd: string): Promise<unknown> {
  return fetch(`${apiBase}/api/debug/${cmd}`, { method: 'POST' }).then(async (r) => {
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`debug command failed: ${r.status}`);
    return body;
  });
}

function useAlbumArt(artist?: string, album?: string): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    setUrl(undefined);
    if (!artist || !album) return;
    const controller = new AbortController();
    fetch(`https://itunes.apple.com/search?media=music&entity=album&limit=1&term=${encodeURIComponent(`${artist} ${album}`)}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : undefined))
      .then((data: unknown) => {
        const result = Array.isArray((data as { results?: unknown[] } | undefined)?.results) ? (data as { results: Array<{ artworkUrl100?: string }> }).results[0] : undefined;
        if (result?.artworkUrl100) setUrl(result.artworkUrl100.replace('100x100bb', '600x600bb'));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [artist, album]);
  return url;
}

function statusText(drive: DriveSnapshot): string {
  if (!drive.connected) return 'Offline';
  if (drive.duplicateSuppressed) return 'Auto-rip suppressed';
  if ((drive.state === 'ripping' || drive.state === 'encoding') && drive.currentTrack) {
    return `${drive.state === 'encoding' ? 'Encoding' : 'Ripping'} track ${drive.currentTrack}${drive.totalTracks ? ` of ${drive.totalTracks}` : ''}`;
  }
  if (drive.state === 'reading-metadata') return 'Reading metadata';
  if (drive.state === 'encoding') return 'Encoding';
  if (drive.trayStatus === 'open') return 'Tray open';
  if (!drive.mediaPresent) return 'No disc';
  return drive.state;
}

function progressValue(drive: DriveSnapshot): number {
  if (typeof drive.progressPercent === 'number') return Math.max(0, Math.min(100, Math.round(drive.progressPercent)));
  if (drive.state === 'completed') return 100;
  if (drive.currentTrack && drive.totalTracks && drive.totalTracks > 0) {
    return Math.max(0, Math.min(99, Math.round((drive.currentTrack / drive.totalTracks) * 100)));
  }
  return 0;
}

function driveHardwareLabel(drive: DriveSnapshot): string {
  return [drive.driveInfo?.vendor, drive.driveInfo?.model].filter(Boolean).join(' ') || 'Unknown drive';
}

function shortDiscId(discId?: string): string | undefined {
  return discId ? discId.slice(0, 8) : undefined;
}

function albumGroupKey(album: RippedAlbum): string {
  return [album.ripperId, album.artist ?? '', album.album ?? '', album.discNumber ?? '', album.totalDiscs ?? '', album.releaseDate ?? '', album.tracks.map((track) => `${track.number}:${track.title}`).join('|')].join('::');
}

function groupAlbums(albums: RippedAlbum[]): AlbumGroup[] {
  const grouped = new Map<string, AlbumGroup>();
  for (const album of albums) {
    const key = albumGroupKey(album);
    const existing = grouped.get(key);
    if (existing) {
      existing.items.push(album);
      if (album.completedAt > existing.latest.completedAt) existing.latest = album;
      if (!existing.drives.includes(album.ripperId)) existing.drives.push(album.ripperId);
    } else {
      grouped.set(key, { key, latest: album, items: [album], drives: [album.ripperId] });
    }
  }
  return [...grouped.values()].sort((a, b) => b.latest.completedAt.localeCompare(a.latest.completedAt));
}

function historyGroupKey(job: HistoryJob): string {
  if (job.state !== 'completed') return `job::${job.id}`;
  return [job.ripperId, job.device, job.state, job.artist ?? '', job.album ?? ''].join('::');
}

function groupHistory(history: HistoryJob[]): HistoryGroup[] {
  const grouped = new Map<string, HistoryGroup>();
  for (const job of history) {
    const key = historyGroupKey(job);
    const existing = grouped.get(key);
    if (existing) {
      existing.items.push(job);
      if (job.startedAt > existing.latest.startedAt) existing.latest = job;
    } else {
      grouped.set(key, { key, latest: job, items: [job] });
    }
  }
  return [...grouped.values()].sort((a, b) => b.latest.startedAt.localeCompare(a.latest.startedAt));
}

function DriveCard({ drive }: { drive: DriveSnapshot }) {
  const pct = progressValue(drive);
  const tracks = drive.tracks ?? [];
  const active = drive.state === 'ripping' || drive.state === 'reading-metadata' || drive.state === 'encoding';
  const failed = drive.state.startsWith('failed') || drive.state === 'failed';
  return <Card className={active ? 'border-emerald-500/50 shadow-emerald-950/40' : failed ? 'border-destructive/50' : ''}>
    <CardContent className="space-y-2 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><CardTitle className="truncate text-sm">{drive.ripperId}</CardTitle><Badge variant={drive.connected ? 'success' : 'destructive'}>{drive.connected ? 'on' : 'off'}</Badge></div>
          <div className="truncate text-[11px] text-muted-foreground">{drive.device}{drive.driveInfo?.sgDevice ? ` · ${drive.driveInfo.sgDevice}` : ''}</div>
          <div className="truncate text-[11px] text-muted-foreground">{driveHardwareLabel(drive)}</div>
        </div>
        <DriveDetailsDialog drive={drive} />
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-300"><Activity className="h-3 w-3" />{statusText(drive)}</div>
        <div className="truncate text-sm font-semibold">{drive.album ?? (drive.mediaPresent ? 'Metadata pending…' : 'No album loaded')}</div>
        <div className="truncate text-[11px] text-muted-foreground">{drive.artist ?? 'Unknown artist'}{drive.discNumber ? ` · Disc ${drive.discNumber}${drive.totalDiscs ? `/${drive.totalDiscs}` : ''}` : ''}</div>
      </div>

      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px]">
        <Info label="State" value={drive.state} /><Info label="Tray" value={drive.trayStatus ?? 'unknown'} />
        {drive.currentTrack && <Info label="Track" value={`${drive.currentTrack}/${drive.totalTracks ?? (tracks.length || '?')}`} />}
        {drive.currentJobId && <Info label="Job" value={drive.currentJobId.slice(0, 8)} title={drive.currentJobId} />}
        {drive.discId && <Info label="Disc ID" value={shortDiscId(drive.discId) ?? drive.discId} title={drive.discId} />}
      </div>
      {drive.duplicateSuppressed && <div className="line-clamp-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-1.5 text-[11px] text-amber-100">This disc was already ripped on this drive. Auto-rip was suppressed; use Start to rerip intentionally.</div>}
      {drive.error && <div className="line-clamp-2 rounded-md border border-destructive/40 bg-destructive/10 p-1.5 text-[11px] text-red-200"><AlertTriangle className="mr-1 inline h-3 w-3" />{drive.error}</div>}
      <div className="flex items-center gap-2"><Progress value={pct} className="h-1.5" /><span className="w-8 text-right text-[11px] text-muted-foreground">{pct}%</span></div>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" className="h-7 px-2" onClick={() => void command(drive.ripperId, 'startRip')} disabled={!drive.connected || !drive.mediaPresent || active}><Play className="h-3 w-3" />Start</Button>
        <Button size="sm" className="h-7 px-2" variant="secondary" onClick={() => void command(drive.ripperId, 'cancelRip')} disabled={!active}><Pause className="h-3 w-3" />Cancel</Button>
        <Button size="sm" className="h-7 px-2" variant="outline" onClick={() => void command(drive.ripperId, 'ejectDisc')}><Eject className="h-3 w-3" />{drive.trayStatus === 'open' ? 'Close' : 'Eject'}</Button>
        <Button size="sm" className="h-7 px-2" variant="outline" onClick={() => void command(drive.ripperId, 'refreshDisc')}><RefreshCw className="h-3 w-3" /></Button>
        <AlertDialog><AlertDialogTrigger asChild><Button size="sm" className="h-7 px-2" variant="destructive"><RotateCcw className="h-3 w-3" /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Reset optical drive?</AlertDialogTitle><AlertDialogDescription>This will cancel any active rip on {drive.ripperId} and issue a SCSI device reset. Use only for stuck drives or repeated read errors.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => void command(drive.ripperId, 'resetDrive')}>Reset drive</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      </div>
    </CardContent>
  </Card>;
}

function DriveDetailsDialog({ drive }: { drive: DriveSnapshot }) {
  const art = useAlbumArt(drive.artist, drive.album);
  const tracks = drive.tracks ?? [];
  return <AlertDialog>
    <AlertDialogTrigger asChild><Button size="sm" variant="outline" className="h-7 px-2"><ListMusic className="h-3.5 w-3.5" />Details</Button></AlertDialogTrigger>
    <AlertDialogContent className="max-h-[90vh] overflow-auto">
      <AlertDialogHeader>
        <AlertDialogTitle>{drive.ripperId} · {drive.album ?? 'No album loaded'}</AlertDialogTitle>
        <AlertDialogDescription>{drive.artist ?? 'Unknown artist'} · {drive.device}{drive.discNumber ? ` · Disc ${drive.discNumber}${drive.totalDiscs ? `/${drive.totalDiscs}` : ''}` : ''}</AlertDialogDescription>
      </AlertDialogHeader>
      <div className="space-y-4">
        <div className="flex gap-3">
          <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted text-muted-foreground">{art ? <img src={art} alt="Album cover" className="h-full w-full object-cover" /> : <Disc3 className="h-8 w-8" />}</div>
          <div className="grid flex-1 grid-cols-[6rem_1fr] gap-1 text-sm">
            <Info label="State" value={drive.state} />
            <Info label="Media" value={drive.mediaPresent ? 'present' : 'none'} />
            <Info label="Tray" value={drive.trayStatus ?? 'unknown'} />
            <Info label="Drive" value={driveHardwareLabel(drive)} />
            <Info label="Device" value={drive.device} />
            <Info label="SG" value={drive.driveInfo?.sgDevice ?? 'n/a'} />
            {drive.driveInfo?.revision && <Info label="Revision" value={drive.driveInfo.revision} />}
            {drive.driveInfo?.serial && <Info label="Serial" value={drive.driveInfo.serial} />}
            {drive.discId && <Info label="Disc ID" value={drive.discId} />}
            {drive.currentJobId && <Info label="Job" value={drive.currentJobId} />}
            {drive.currentFile && <Info label="File" value={drive.currentFile} />}
          </div>
        </div>
        {drive.duplicateSuppressed && <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-sm text-amber-100">This disc ID matches the last successfully ripped disc on this drive, so auto-rip was suppressed. Use Start only if you intentionally want another copy.</div>}
        {drive.error && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-red-200"><AlertTriangle className="mr-1 inline h-4 w-4" />{drive.error}</div>}
        <div className="rounded-md border bg-muted/20 p-2"><div className="mb-2 text-xs font-semibold text-muted-foreground">Tracks ({tracks.length})</div>{tracks.length ? tracks.map((track) => <div key={track.number} className={`grid grid-cols-[2.5rem_1fr] rounded px-2 py-1 text-sm ${track.number === drive.currentTrack ? 'bg-emerald-500/20 text-emerald-100' : ''}`}><span className="text-muted-foreground">{String(track.number).padStart(2, '0')}</span><span>{track.title}</span></div>) : <div className="text-sm text-muted-foreground">No tracks captured yet.</div>}</div>
        <pre className="max-h-72 overflow-auto rounded-md border bg-black/30 p-3 font-mono text-xs text-muted-foreground">{drive.logs.slice(-120).join('\n')}</pre>
      </div>
      <AlertDialogFooter><AlertDialogCancel>Close</AlertDialogCancel></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}

function Info({ label, value, title }: { label: string; value: string; title?: string }) { return <><span className="text-muted-foreground">{label}</span><span className="truncate" title={title ?? value}>{value}</span></>; }

function LogViewer({ drives }: { drives: DriveSnapshot[] }) {
  const [selected, setSelected] = useState('all');
  const [query, setQuery] = useState('');
  const [paused, setPaused] = useState(false);
  const [snapshot, setSnapshot] = useState<DriveSnapshot[]>(drives);
  useEffect(() => { if (!paused) setSnapshot(drives); }, [drives, paused]);
  const rows = snapshot.flatMap((drive) => drive.logs.map((line, index) => ({ id: `${drive.ripperId}-${index}-${line}`, ripperId: drive.ripperId, device: drive.device, line }))).filter((row) => (selected === 'all' || row.ripperId === selected) && (!query || `${row.ripperId} ${row.line}`.toLowerCase().includes(query.toLowerCase())));
  const download = () => { const url = URL.createObjectURL(new Blob([rows.map((row) => `[${row.ripperId} ${row.device}] ${row.line}`).join('\n')], { type: 'text/plain' })); const a = document.createElement('a'); a.href = url; a.download = `rippy-logs-${new Date().toISOString()}.txt`; a.click(); URL.revokeObjectURL(url); };
  return <Card><CardHeader><div className="flex items-center justify-between"><div><CardTitle>Logs</CardTitle><CardDescription>{rows.length} matching lines</CardDescription></div><Button variant="outline" onClick={download}><Download className="h-4 w-4" />Download</Button></div></CardHeader><CardContent className="space-y-3"><div className="flex flex-wrap gap-2"><Select value={selected} onChange={(ev) => setSelected(ev.target.value)}><option value="all">All drives</option>{drives.map((drive) => <option key={drive.ripperId} value={drive.ripperId}>{drive.ripperId} · {drive.device}</option>)}</Select><div className="relative min-w-64 flex-1"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" value={query} onChange={(ev) => setQuery(ev.target.value)} placeholder="Filter logs…" /></div><Button variant="secondary" onClick={() => setPaused((v) => !v)}>{paused ? 'Resume live' : 'Pause'}</Button><Button variant="outline" onClick={() => setSnapshot(drives)}>Refresh</Button></div><div className="max-h-[70vh] overflow-auto rounded-md border bg-black/30 font-mono text-xs" role="log" aria-live={paused ? 'off' : 'polite'}>{rows.map((row) => <div className="grid grid-cols-[6rem_1fr] gap-2 border-b px-2 py-1 hover:bg-muted/30" key={row.id}><span className="font-semibold text-emerald-300">{row.ripperId}</span><span className={row.line.toLowerCase().match(/error|failed/) ? 'text-red-300' : 'text-muted-foreground'}>{row.line}</span></div>)}</div></CardContent></Card>;
}

function StatusPage() {
  const [status, setStatus] = useState<StatusData>();
  const [error, setError] = useState<string>();
  useEffect(() => { const load = () => fetch(`${apiBase}/api/status`).then((r) => r.json()).then(setStatus).catch((e: Error) => setError(e.message)); void load(); const timer = setInterval(load, 15000); return () => clearInterval(timer); }, []);
  if (error) return <Card className="border-destructive"><CardContent className="p-4 text-destructive-foreground">{error}</CardContent></Card>;
  if (!status) return <Card><CardHeader><CardTitle>Status</CardTitle><CardDescription>Loading…</CardDescription></CardHeader></Card>;
  return <div className="space-y-4"><div className="grid gap-4 lg:grid-cols-2"><JsonCard icon={<Server className="h-4 w-4" />} title="Host" data={Object.fromEntries(Object.entries(status.host).filter(([k]) => k !== 'cpus'))} /><JsonCard icon={<Wifi className="h-4 w-4" />} title="MusicBrainz" data={status.musicBrainz} /></div><Card><CardHeader><CardTitle>Drives</CardTitle><CardDescription>Hardware and job status reported by rippers</CardDescription></CardHeader><CardContent><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{status.drives.map((drive) => <pre className="max-h-80 overflow-auto rounded-md border bg-black/30 p-3 text-xs" key={String(drive.ripperId)}>{JSON.stringify(drive, null, 2)}</pre>)}</div></CardContent></Card></div>;
}

function JsonCard({ title, data, icon }: { title: string; data: Record<string, unknown>; icon: React.ReactNode }) { return <Card><CardHeader><CardTitle className="flex items-center gap-2">{icon}{title}</CardTitle></CardHeader><CardContent><dl className="grid grid-cols-[9rem_1fr] gap-2 text-sm">{Object.entries(data).map(([k, v]) => <React.Fragment key={k}><dt className="text-muted-foreground">{k}</dt><dd className="truncate" title={String(v)}>{Array.isArray(v) ? v.join(', ') : String(v)}</dd></React.Fragment>)}</dl></CardContent></Card>; }

function AlbumsPage({ albums }: { albums: RippedAlbum[] }) {
  if (albums.length === 0) return <Card><CardHeader><CardTitle>Ripped albums</CardTitle><CardDescription>No successful rips recorded yet.</CardDescription></CardHeader></Card>;
  const groups = groupAlbums(albums);
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
    {groups.map((group) => {
      const album = group.latest;
      return <Card key={group.key}>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><CardTitle className="line-clamp-2 text-lg">{album.album ?? 'Unknown album'}</CardTitle><CardDescription>{album.artist ?? 'Unknown artist'}</CardDescription></div>
            <div className="flex gap-2">{group.items.length > 1 && <Badge variant="secondary">{group.items.length} rips</Badge>}<Badge variant="success">ripped</Badge></div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs"><Info label="Drive" value={`${album.ripperId} · ${album.device}`} /><Info label="Latest" value={album.completedAt} />{album.discNumber && <Info label="Disc" value={`${album.discNumber}${album.totalDiscs ? ` / ${album.totalDiscs}` : ''}`} />}{album.releaseDate && <Info label="Released" value={album.releaseDate} />}{album.musicBrainzReleaseId && <Info label="MB release" value={album.musicBrainzReleaseId.slice(0, 8)} title={album.musicBrainzReleaseId} />}{group.items.length > 1 && <Info label="Attempts" value={String(group.items.length)} />}</div>
          {group.items.length > 1 && <div className="rounded-md border bg-muted/20 p-2 text-xs text-muted-foreground">Grouped rerips on {group.drives.join(', ')}. Latest completion shown above.</div>}
          <div className="max-h-72 overflow-auto rounded-md border bg-muted/20 p-2">
            <div className="mb-2 text-xs font-semibold text-muted-foreground">{album.tracks.length} tracks</div>
            {album.tracks.length ? album.tracks.map((track) => <div key={`${group.key}-${track.number}`} className="grid grid-cols-[2.5rem_1fr] rounded px-2 py-1 text-sm"><span className="text-muted-foreground">{String(track.number).padStart(2, '0')}</span><span className="truncate">{track.title}</span></div>) : <div className="text-sm text-muted-foreground">Track list was not captured for this rip.</div>}
          </div>
        </CardContent>
      </Card>;
    })}
  </div>;
}

function DebugPage({ drives }: { drives: DriveSnapshot[] }) {
  const [result, setResult] = useState<string>();
  const run = (cmd: string, warning?: string) => {
    if (warning && !window.confirm(warning)) return;
    setResult('Running…');
    void debugCommand(cmd).then((body) => setResult(JSON.stringify(body, null, 2))).catch((err: Error) => setResult(err.message));
  };
  const ripping = drives.filter((d) => d.state === 'ripping' || d.state === 'encoding' || d.state === 'reading-metadata');
  return <Card><CardHeader><CardTitle>Debug controls</CardTitle><CardDescription>Broadcast maintenance commands to all connected rippers. Dangerous actions are guarded.</CardDescription></CardHeader><CardContent className="space-y-4">
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <Button variant="destructive" onClick={() => run('stopAllJobs', `Stop ${ripping.length || 'all'} active job(s)? This cancels abcde on every connected ripper.`)}><Pause className="h-4 w-4" />Stop all jobs</Button>
      <Button variant="outline" onClick={() => run('openAllTrays', 'Open all trays? This will cancel any active rip before ejecting.') }><Eject className="h-4 w-4" />Open all trays</Button>
      <Button variant="outline" onClick={() => run('closeAllTrays')}><Eject className="h-4 w-4 rotate-180" />Close all trays</Button>
      <Button variant="secondary" onClick={() => run('refreshAll')}><RefreshCw className="h-4 w-4" />Refresh all drives</Button>
      <Button variant="destructive" onClick={() => run('resetAllDrives', 'Reset every connected optical drive via sg_reset? Use only if multiple drives/controllers are wedged.') }><RotateCcw className="h-4 w-4" />Reset all drives</Button>
    </div>
    <div className="rounded-md border bg-muted/20 p-3 text-sm"><div className="mb-2 font-semibold">Connected drives: {drives.filter((d) => d.connected).length} / {drives.length}</div><div className="grid gap-1 md:grid-cols-2 xl:grid-cols-3">{drives.map((d) => <div key={d.ripperId} className="truncate text-muted-foreground">{d.ripperId} · {d.device} · {d.state} · {d.trayStatus ?? 'unknown'}</div>)}</div></div>
    {result && <pre className="max-h-80 overflow-auto rounded-md border bg-black/30 p-3 text-xs text-muted-foreground">{result}</pre>}
  </CardContent></Card>;
}

function History({ history }: { history: HistoryJob[] }) {
  const groups = groupHistory(history);
  return <Card><CardHeader><CardTitle>History</CardTitle><CardDescription>Recent rip jobs</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Started</TableHead><TableHead>Drive</TableHead><TableHead>Album</TableHead><TableHead>Status</TableHead><TableHead>Error</TableHead></TableRow></TableHeader><TableBody>{groups.map((group) => {
    const j = group.latest;
    return <TableRow key={group.key}><TableCell>{j.startedAt}</TableCell><TableCell>{j.ripperId}</TableCell><TableCell>{[j.artist, j.album].filter(Boolean).join(' - ') || j.id}</TableCell><TableCell><div className="flex items-center gap-2"><Badge variant={j.state === 'completed' ? 'success' : j.state.includes('failed') ? 'destructive' : 'secondary'}>{j.state}</Badge>{group.items.length > 1 && <Badge variant="secondary">{group.items.length}x</Badge>}</div></TableCell><TableCell className="text-red-300">{j.error}</TableCell></TableRow>;
  })}</TableBody></Table></CardContent></Card>;
}

function App() {
  const [state, setState] = useState<ApiState>(empty);
  const [error, setError] = useState<string>();
  useEffect(() => { fetch(`${apiBase}/api/state`).then((r) => r.json()).then(setState).catch((e: Error) => setError(e.message)); const es = new EventSource(`${apiBase}/api/events`); es.onmessage = (ev) => { setState(JSON.parse(ev.data) as ApiState); setError(undefined); }; es.onerror = () => setError('live connection interrupted'); return () => es.close(); }, []);
  const drives = useMemo(() => state.drives, [state.drives]);
  return <main className="mx-auto max-w-[1800px] space-y-6 p-4 md:p-6"><header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><h1 className="text-3xl font-bold tracking-tight md:text-4xl">DiscOps</h1><p className="text-muted-foreground">Multi-drive abcde ripping dashboard</p></div></header>{error && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-red-200">{error}</div>}<Tabs defaultValue="dashboard" className="space-y-4"><TabsList><TabsTrigger value="dashboard">Dashboard</TabsTrigger><TabsTrigger value="albums">Albums</TabsTrigger><TabsTrigger value="logs">Logs</TabsTrigger><TabsTrigger value="status">Status</TabsTrigger><TabsTrigger value="debug">Debug</TabsTrigger></TabsList><TabsContent value="dashboard" className="space-y-4"><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">{drives.length ? drives.map((d) => <DriveCard key={d.ripperId} drive={d} />) : <Card><CardContent className="p-6 text-muted-foreground">No rippers connected yet.</CardContent></Card>}</div><History history={state.history} /></TabsContent><TabsContent value="albums"><AlbumsPage albums={state.albums ?? []} /></TabsContent><TabsContent value="logs"><LogViewer drives={drives} /></TabsContent><TabsContent value="status"><StatusPage /></TabsContent><TabsContent value="debug"><DebugPage drives={drives} /></TabsContent></Tabs></main>;
}

createRoot(document.getElementById('root')!).render(<App />);
