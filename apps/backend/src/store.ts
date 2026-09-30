import Database from 'better-sqlite3';
import type { HistoryJob, JobState, RippedAlbum } from '@rippy/shared';

export class Store {
  private db: Database.Database;
  constructor(path: string) {
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY, ripper_id TEXT NOT NULL, device TEXT NOT NULL, state TEXT NOT NULL,
      artist TEXT, album TEXT, started_at TEXT NOT NULL, finished_at TEXT, error TEXT
    );
    CREATE TABLE IF NOT EXISTS ripped_albums (
      job_id TEXT PRIMARY KEY, ripper_id TEXT NOT NULL, device TEXT NOT NULL,
      artist TEXT, album TEXT, release_date TEXT, musicbrainz_disc_id TEXT, musicbrainz_release_id TEXT,
      disc_number INTEGER, total_discs INTEGER, tracks_json TEXT NOT NULL, completed_at TEXT NOT NULL
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
  upsertRippedAlbum(album: RippedAlbum): void {
    this.db.prepare(`INSERT INTO ripped_albums(job_id,ripper_id,device,artist,album,release_date,musicbrainz_disc_id,musicbrainz_release_id,disc_number,total_discs,tracks_json,completed_at)
      VALUES (@jobId,@ripperId,@device,@artist,@album,@releaseDate,@musicBrainzDiscId,@musicBrainzReleaseId,@discNumber,@totalDiscs,@tracksJson,@completedAt)
      ON CONFLICT(job_id) DO UPDATE SET artist=@artist,album=@album,release_date=@releaseDate,musicbrainz_disc_id=@musicBrainzDiscId,musicbrainz_release_id=@musicBrainzReleaseId,disc_number=@discNumber,total_discs=@totalDiscs,tracks_json=@tracksJson,completed_at=@completedAt`).run({
        ...album,
        artist: album.artist ?? null,
        album: album.album ?? null,
        releaseDate: album.releaseDate ?? null,
        musicBrainzDiscId: album.musicBrainzDiscId ?? null,
        musicBrainzReleaseId: album.musicBrainzReleaseId ?? null,
        discNumber: album.discNumber ?? null,
        totalDiscs: album.totalDiscs ?? null,
        tracksJson: JSON.stringify(album.tracks),
      });
    this.db.prepare('UPDATE jobs SET artist=COALESCE(?, artist), album=COALESCE(?, album) WHERE id=?').run(album.artist ?? null, album.album ?? null, album.jobId);
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
  listRippedAlbums(limit = 100): RippedAlbum[] {
    const rows = this.db.prepare('SELECT * FROM ripped_albums ORDER BY completed_at DESC LIMIT ?').all(limit) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      jobId: String(r.job_id), ripperId: String(r.ripper_id), device: String(r.device),
      ...(r.artist ? { artist: String(r.artist) } : {}), ...(r.album ? { album: String(r.album) } : {}),
      ...(r.release_date ? { releaseDate: String(r.release_date) } : {}), ...(r.musicbrainz_disc_id ? { musicBrainzDiscId: String(r.musicbrainz_disc_id) } : {}),
      ...(r.musicbrainz_release_id ? { musicBrainzReleaseId: String(r.musicbrainz_release_id) } : {}),
      ...(typeof r.disc_number === 'number' ? { discNumber: r.disc_number } : {}), ...(typeof r.total_discs === 'number' ? { totalDiscs: r.total_discs } : {}),
      tracks: JSON.parse(String(r.tracks_json)) as RippedAlbum['tracks'], completedAt: String(r.completed_at),
    }));
  }
  close(): void { this.db.close(); }
}
