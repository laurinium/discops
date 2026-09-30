import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, AlertTriangle, Disc3, Download, Eject, Pause, Play, RefreshCw, RotateCcw, Search, Server, Wifi } from 'lucide-react';
import type { DriveSnapshot, HistoryJob } from '@rippy/shared';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './components/ui/alert-dialog.js';
import { Badge } from './components/ui/badge.js';
import { Button } from './components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card.js';
import { Input, Select } from './components/ui/form.js';
import { Progress } from './components/ui/progress.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './components/ui/table.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs.js';
import './style.css';

interface ApiState { drives: DriveSnapshot[]; history: HistoryJob[] }
interface StatusData { time: string; host: Record<string, unknown>; musicBrainz: Record<string, unknown>; drives: Array<Record<string, unknown>> }
const empty: ApiState = { drives: [], history: [] };
const apiBase = import.meta.env.VITE_API_BASE ?? '';

function command(ripperId: string, cmd: string): Promise<void> {
  return fetch(`${apiBase}/api/rippers/${encodeURIComponent(ripperId)}/${cmd}`, { method: 'POST' }).then((r) => {
    if (!r.ok) throw new Error(`command failed: ${r.status}`);
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
  if (drive.state === 'ripping' && drive.currentTrack) return `Ripping track ${drive.currentTrack}`;
  if (drive.state === 'reading-metadata') return 'Reading metadata';
  if (drive.trayStatus === 'open') return 'Tray open';
  if (!drive.mediaPresent) return 'No disc';
  return drive.state;
}

function DriveCard({ drive }: { drive: DriveSnapshot }) {
  const pct = Math.round(drive.progressPercent ?? 0);
  const art = useAlbumArt(drive.artist, drive.album);
  const tracks = drive.tracks ?? [];
  const active = drive.state === 'ripping' || drive.state === 'reading-metadata';
  return <Card className={active ? 'border-emerald-500/50 shadow-emerald-950/40' : ''}>
    <CardHeader className="pb-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><CardTitle className="truncate text-base">{drive.ripperId}</CardTitle><CardDescription>{drive.device}{drive.driveInfo?.sgDevice ? ` · ${drive.driveInfo.sgDevice}` : ''}</CardDescription></div>
        <Badge variant={drive.connected ? 'success' : 'destructive'}>{drive.connected ? 'online' : 'offline'}</Badge>
      </div>
    </CardHeader>
    <CardContent className="space-y-3">
      <div className="flex gap-3">
        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted text-muted-foreground">
          {art ? <img src={art} alt={`${drive.artist ?? 'Unknown'} - ${drive.album ?? 'album'} cover`} className="h-full w-full object-cover" /> : <Disc3 className="h-7 w-7" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-emerald-300"><Activity className="h-3 w-3" />{statusText(drive)}</div>
          <div className="mt-1 line-clamp-2 text-sm font-semibold leading-tight">{drive.album ?? (drive.mediaPresent ? 'Metadata pending…' : 'No album loaded')}</div>
          <div className="mt-1 truncate text-xs text-muted-foreground">{drive.artist ?? 'Unknown artist'}{drive.discNumber ? ` · Disc ${drive.discNumber}${drive.totalDiscs ? `/${drive.totalDiscs}` : ''}` : ''}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <Info label="State" value={drive.state} /><Info label="Media" value={drive.mediaPresent ? 'present' : 'none'} /><Info label="Tray" value={drive.trayStatus ?? 'unknown'} />
        {drive.currentJobId && <Info label="Job" value={drive.currentJobId.slice(0, 8)} title={drive.currentJobId} />}
        {drive.currentTrack && <Info label="Track" value={`${drive.currentTrack} / ${drive.totalTracks ?? (tracks.length || '?')}`} />}
        {drive.currentFile && <Info label="File" value={drive.currentFile} />}
      </div>
      {drive.error && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive-foreground"><AlertTriangle className="mr-1 inline h-3 w-3" />{drive.error}</div>}
      <div><Progress value={pct} /><div className="mt-1 text-right text-xs text-muted-foreground">{pct}%</div></div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void command(drive.ripperId, 'startRip')} disabled={!drive.connected || !drive.mediaPresent || drive.state === 'ripping'}><Play className="h-3.5 w-3.5" />Start</Button>
        <Button size="sm" variant="secondary" onClick={() => void command(drive.ripperId, 'cancelRip')} disabled={drive.state !== 'ripping'}><Pause className="h-3.5 w-3.5" />Cancel</Button>
        <Button size="sm" variant="outline" onClick={() => void command(drive.ripperId, 'ejectDisc')}><Eject className="h-3.5 w-3.5" />{drive.trayStatus === 'open' ? 'Close' : 'Eject'}</Button>
        <Button size="sm" variant="outline" onClick={() => void command(drive.ripperId, 'refreshDisc')}><RefreshCw className="h-3.5 w-3.5" />Refresh</Button>
        <AlertDialog><AlertDialogTrigger asChild><Button size="sm" variant="destructive"><RotateCcw className="h-3.5 w-3.5" />Reset</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Reset optical drive?</AlertDialogTitle><AlertDialogDescription>This will cancel any active rip on {drive.ripperId} and issue a SCSI device reset. Use only for stuck drives or repeated read errors.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => void command(drive.ripperId, 'resetDrive')}>Reset drive</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      </div>
      {tracks.length > 0 && <div className="max-h-44 overflow-auto rounded-md border bg-muted/20 p-2"><div className="mb-1 text-xs font-semibold text-muted-foreground">Tracks</div>{tracks.map((track) => <div key={track.number} className={`grid grid-cols-[2rem_1fr] rounded px-2 py-1 text-xs ${track.number === drive.currentTrack ? 'bg-emerald-500/20 text-emerald-100' : ''}`}><span className="text-muted-foreground">{String(track.number).padStart(2, '0')}</span><span className="truncate">{track.title}</span></div>)}</div>}
      <pre className="max-h-32 overflow-auto rounded-md border bg-black/30 p-2 font-mono text-[11px] text-muted-foreground">{drive.logs.slice(-24).join('\n')}</pre>
    </CardContent>
  </Card>;
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

function History({ history }: { history: HistoryJob[] }) { return <Card><CardHeader><CardTitle>History</CardTitle><CardDescription>Recent rip jobs</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Started</TableHead><TableHead>Drive</TableHead><TableHead>Album</TableHead><TableHead>Status</TableHead><TableHead>Error</TableHead></TableRow></TableHeader><TableBody>{history.map((j) => <TableRow key={j.id}><TableCell>{j.startedAt}</TableCell><TableCell>{j.ripperId}</TableCell><TableCell>{[j.artist, j.album].filter(Boolean).join(' - ') || j.id}</TableCell><TableCell><Badge variant={j.state === 'completed' ? 'success' : j.state.includes('failed') ? 'destructive' : 'secondary'}>{j.state}</Badge></TableCell><TableCell className="text-red-300">{j.error}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>; }

function App() {
  const [state, setState] = useState<ApiState>(empty);
  const [error, setError] = useState<string>();
  useEffect(() => { fetch(`${apiBase}/api/state`).then((r) => r.json()).then(setState).catch((e: Error) => setError(e.message)); const es = new EventSource(`${apiBase}/api/events`); es.onmessage = (ev) => { setState(JSON.parse(ev.data) as ApiState); setError(undefined); }; es.onerror = () => setError('live connection interrupted'); return () => es.close(); }, []);
  const drives = useMemo(() => state.drives, [state.drives]);
  return <main className="mx-auto max-w-[1800px] space-y-6 p-4 md:p-6"><header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><h1 className="text-3xl font-bold tracking-tight md:text-4xl">DiscOps</h1><p className="text-muted-foreground">Multi-drive abcde ripping dashboard</p></div></header>{error && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-red-200">{error}</div>}<Tabs defaultValue="dashboard" className="space-y-4"><TabsList><TabsTrigger value="dashboard">Dashboard</TabsTrigger><TabsTrigger value="logs">Logs</TabsTrigger><TabsTrigger value="status">Status</TabsTrigger></TabsList><TabsContent value="dashboard" className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{drives.length ? drives.map((d) => <DriveCard key={d.ripperId} drive={d} />) : <Card><CardContent className="p-6 text-muted-foreground">No rippers connected yet.</CardContent></Card>}</div><History history={state.history} /></TabsContent><TabsContent value="logs"><LogViewer drives={drives} /></TabsContent><TabsContent value="status"><StatusPage /></TabsContent></Tabs></main>;
}

createRoot(document.getElementById('root')!).render(<App />);
