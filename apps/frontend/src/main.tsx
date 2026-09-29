import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { DriveSnapshot, HistoryJob } from '@rippy/shared';
import './style.css';

interface ApiState { drives: DriveSnapshot[]; history: HistoryJob[] }
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
    const term = encodeURIComponent(`${artist} ${album}`);
    fetch(`https://itunes.apple.com/search?media=music&entity=album&limit=1&term=${term}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : undefined))
      .then((data: unknown) => {
        const result = Array.isArray((data as { results?: unknown[] } | undefined)?.results)
          ? (data as { results: Array<{ artworkUrl100?: string }> }).results[0]
          : undefined;
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
  const resetDrive = () => {
    const warning = `Reset optical drive ${drive.ripperId} (${drive.device})?\n\nThis will cancel any active rip and issue a SCSI device reset. Use only when the drive/controller appears stuck or is returning repeated read errors.`;
    if (window.confirm(warning)) void command(drive.ripperId, 'resetDrive');
  };
  const art = useAlbumArt(drive.artist, drive.album);
  const tracks = drive.tracks ?? [];
  return <section className={`card state-${drive.state}`}>
    <div className="cardHead">
      <div><h2>{drive.ripperId}</h2><div className="muted">{drive.device}</div></div>
      <span className={drive.connected ? 'pill okPill' : 'pill badPill'}>{drive.connected ? 'connected' : 'offline'}</span>
    </div>

    <div className="nowPlaying">
      <div className="cover">{art ? <img src={art} alt={`${drive.artist ?? 'Unknown'} - ${drive.album ?? 'album'} cover`} /> : <span>♪</span>}</div>
      <div className="summary">
        <div className="statusLine">{statusText(drive)}</div>
        <div className="albumTitle">{drive.album ?? (drive.mediaPresent ? 'Metadata pending…' : 'No album loaded')}</div>
        <div className="artistName">{drive.artist ?? 'Unknown artist'}</div>
      </div>
    </div>

    <dl>
      <dt>Status</dt><dd>{drive.state}</dd>
      <dt>Media</dt><dd>{drive.mediaPresent ? 'present' : 'none'}</dd>
      <dt>Tray</dt><dd>{drive.trayStatus ?? 'unknown'}</dd>
      {drive.currentTrack && <><dt>Track</dt><dd>{drive.currentTrack} / {drive.totalTracks ?? (tracks.length || '?')}</dd></>}
      {drive.currentFile && <><dt>Current</dt><dd>{drive.currentFile}</dd></>}
      {drive.error && <><dt>Error</dt><dd className="badText">{drive.error}</dd></>}
    </dl>

    <div className="bar"><div style={{ width: `${pct}%` }} /></div><div className="muted progressText">{pct}%</div>
    <div className="buttons">
      <button onClick={() => void command(drive.ripperId, 'startRip')} disabled={!drive.connected || !drive.mediaPresent || drive.state === 'ripping'}>Start</button>
      <button onClick={() => void command(drive.ripperId, 'cancelRip')} disabled={drive.state !== 'ripping'}>Cancel</button>
      <button onClick={() => void command(drive.ripperId, 'ejectDisc')}>{drive.trayStatus === 'open' ? 'Close tray' : 'Eject'}</button>
      <button onClick={() => void command(drive.ripperId, 'refreshDisc')}>Refresh</button>
      <button className="danger" onClick={resetDrive}>Reset drive</button>
    </div>

    {tracks.length > 0 && <section className="tracks"><h3>Tracks</h3><ol>{tracks.map((track) => <li key={track.number} className={track.number === drive.currentTrack ? 'activeTrack' : ''}><span>{String(track.number).padStart(2, '0')}</span>{track.title}</li>)}</ol></section>}

    <h3>Recent log</h3>
    <pre>{drive.logs.slice(-32).join('\n')}</pre>
  </section>;
}

function App() {
  const [state, setState] = useState<ApiState>(empty);
  const [error, setError] = useState<string>();
  useEffect(() => {
    fetch(`${apiBase}/api/state`).then((r) => r.json()).then(setState).catch((e: Error) => setError(e.message));
    const es = new EventSource(`${apiBase}/api/events`);
    es.onmessage = (ev) => { setState(JSON.parse(ev.data) as ApiState); setError(undefined); };
    es.onerror = () => setError('live connection interrupted');
    return () => es.close();
  }, []);
  const drives = useMemo(() => state.drives, [state.drives]);
  return <main>
    <header><h1>CD Ripper</h1><p>Automatic abcde ripping dashboard</p></header>
    {error && <div className="error">{error}</div>}
    <div className="grid">{drives.length ? drives.map((d) => <DriveCard key={d.ripperId} drive={d} />) : <p>No rippers connected yet.</p>}</div>
    <section className="history"><h2>History</h2><table><thead><tr><th>Started</th><th>Drive</th><th>Album</th><th>Status</th><th>Error</th></tr></thead><tbody>{state.history.map((j) => <tr key={j.id}><td>{j.startedAt}</td><td>{j.ripperId}</td><td>{[j.artist, j.album].filter(Boolean).join(' - ') || j.id}</td><td>{j.state}</td><td>{j.error}</td></tr>)}</tbody></table></section>
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
