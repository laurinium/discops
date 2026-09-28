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

function DriveCard({ drive }: { drive: DriveSnapshot }) {
  const pct = Math.round(drive.progressPercent ?? 0);
  return <section className="card">
    <div className="cardHead"><h2>{drive.ripperId}</h2><span className={drive.connected ? 'ok' : 'bad'}>{drive.connected ? 'connected' : 'offline'}</span></div>
    <div className="muted">{drive.device}</div>
    <dl>
      <dt>Status</dt><dd>{drive.state}</dd>
      <dt>Media</dt><dd>{drive.mediaPresent ? 'present' : 'none'}</dd>
      {drive.artist && <><dt>Artist</dt><dd>{drive.artist}</dd></>}
      {drive.album && <><dt>Album</dt><dd>{drive.album}</dd></>}
      {drive.currentTrack && <><dt>Track</dt><dd>{drive.currentTrack} / {drive.totalTracks ?? '?'}</dd></>}
      {drive.currentFile && <><dt>Current</dt><dd>{drive.currentFile}</dd></>}
      {drive.error && <><dt>Error</dt><dd className="badText">{drive.error}</dd></>}
    </dl>
    <div className="bar"><div style={{ width: `${pct}%` }} /></div><div className="muted">{pct}%</div>
    <div className="buttons">
      <button onClick={() => void command(drive.ripperId, 'startRip')}>Start</button>
      <button onClick={() => void command(drive.ripperId, 'cancelRip')}>Cancel</button>
      <button onClick={() => void command(drive.ripperId, 'ejectDisc')}>Eject</button>
      <button onClick={() => void command(drive.ripperId, 'refreshDisc')}>Refresh</button>
    </div>
    <h3>Recent log</h3>
    <pre>{drive.logs.slice(-24).join('\n')}</pre>
  </section>;
}

function App() {
  const [state, setState] = useState<ApiState>(empty);
  const [error, setError] = useState<string>();
  useEffect(() => {
    fetch(`${apiBase}/api/state`).then((r) => r.json()).then(setState).catch((e: Error) => setError(e.message));
    const es = new EventSource(`${apiBase}/api/events`);
    es.onmessage = (ev) => setState(JSON.parse(ev.data) as ApiState);
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
