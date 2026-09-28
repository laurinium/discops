import Database from 'better-sqlite3';
import type { HistoryJob, JobState } from '@rippy/shared';

export class Store {
  private db: Database.Database;
  constructor(path: string) {
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY, ripper_id TEXT NOT NULL, device TEXT NOT NULL, state TEXT NOT NULL,
      artist TEXT, album TEXT, started_at TEXT NOT NULL, finished_at TEXT, error TEXT
    )`);
  }
  upsertJob(job: HistoryJob): void {
    this.db.prepare(`INSERT INTO jobs(id,ripper_id,device,state,artist,album,started_at,finished_at,error)
      VALUES (@id,@ripperId,@device,@state,@artist,@album,@startedAt,@finishedAt,@error)
      ON CONFLICT(id) DO UPDATE SET state=@state,artist=@artist,album=@album,finished_at=@finishedAt,error=@error`).run({
        ...job,
        artist: job.artist ?? null,
        album: job.album ?? null,
        finishedAt: job.finishedAt ?? null,
        error: job.error ?? null,
      });
  }
  finishJob(id: string, state: JobState, error?: string): void {
    this.db.prepare('UPDATE jobs SET state=?, finished_at=?, error=COALESCE(?, error) WHERE id=?').run(state, new Date().toISOString(), error, id);
  }
  listJobs(limit = 100): HistoryJob[] {
    const rows = this.db.prepare('SELECT * FROM jobs ORDER BY started_at DESC LIMIT ?').all(limit) as Array<Record<string, string | null>>;
    return rows.map((r) => {
      const job: HistoryJob = {
        id: String(r.id),
        ripperId: String(r.ripper_id),
        device: String(r.device),
        state: String(r.state) as JobState,
        startedAt: String(r.started_at),
      };
      if (r.artist) job.artist = r.artist;
      if (r.album) job.album = r.album;
      if (r.finished_at) job.finishedAt = r.finished_at;
      if (r.error) job.error = r.error;
      return job;
    });
  }
  close(): void { this.db.close(); }
}
