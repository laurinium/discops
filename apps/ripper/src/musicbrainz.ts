import { spawnSync } from 'node:child_process';

export interface MusicBrainzDiscMetadata {
  musicBrainzDiscId: string;
  releaseId?: string;
  artist?: string;
  album?: string;
  releaseDate?: string;
  discNumber?: number;
  totalDiscs?: number;
  expectedTracks?: number;
}

export async function lookupMusicBrainzDisc(device: string): Promise<MusicBrainzDiscMetadata | undefined> {
  const musicBrainzDiscId = readMusicBrainzDiscId(device);
  if (!musicBrainzDiscId) return undefined;
  const url = `https://musicbrainz.org/ws/2/discid/${encodeURIComponent(musicBrainzDiscId)}?inc=artist-credits+recordings&fmt=json`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'rippymcripface/0.1.0 (https://github.com/laurinium/discops)' },
  });
  if (!response.ok) return { musicBrainzDiscId };
  const data = (await response.json()) as Record<string, unknown>;
  return parseMusicBrainzDiscMetadata(musicBrainzDiscId, data);
}

function readMusicBrainzDiscId(device: string): string | undefined {
  const script = 'import sys\ntry:\n import libdiscid\n print(libdiscid.read(sys.argv[1]).id)\nexcept ImportError:\n from discid import read\n print(read(sys.argv[1]).id)' ;
  const result = spawnSync('python3', ['-c', script, device], { encoding: 'utf8', timeout: 10_000 });
  if (result.status !== 0) return undefined;
  const id = result.stdout.trim();
  return /^[A-Za-z0-9_.-]{20,}$/.test(id) ? id : undefined;
}

function parseMusicBrainzDiscMetadata(musicBrainzDiscId: string, data: Record<string, unknown>): MusicBrainzDiscMetadata {
  const releases = Array.isArray(data.releases) ? data.releases : [];
  for (const releaseValue of releases) {
    if (!releaseValue || typeof releaseValue !== 'object') continue;
    const release = releaseValue as Record<string, unknown>;
    const media = Array.isArray(release.media) ? release.media : [];
    const mediumIndex = media.findIndex((mediumValue) => mediumMatchesDisc(mediumValue, musicBrainzDiscId));
    if (mediumIndex < 0) continue;
    const medium = media[mediumIndex] as Record<string, unknown>;
    const metadata: MusicBrainzDiscMetadata = {
      musicBrainzDiscId,
      discNumber: numberValue(medium.position) ?? mediumIndex + 1,
    };
    const releaseId = stringValue(release.id);
    const artist = artistCredit(release['artist-credit']);
    const album = stringValue(release.title);
    const releaseDate = stringValue(release.date);
    const expectedTracks = numberValue(medium['track-count']) ?? (Array.isArray(medium.tracks) ? medium.tracks.length : undefined);
    if (releaseId) metadata.releaseId = releaseId;
    if (artist) metadata.artist = artist;
    if (album) metadata.album = album;
    if (releaseDate) metadata.releaseDate = releaseDate;
    if (media.length) metadata.totalDiscs = media.length;
    if (expectedTracks) metadata.expectedTracks = expectedTracks;
    return metadata;
  }
  return { musicBrainzDiscId };
}

function mediumMatchesDisc(value: unknown, discId: string): boolean {
  if (!value || typeof value !== 'object') return false;
  const medium = value as Record<string, unknown>;
  const discs = Array.isArray(medium.discs) ? medium.discs : [];
  return discs.some((discValue) => !!discValue && typeof discValue === 'object' && stringValue((discValue as Record<string, unknown>).id) === discId);
}

function artistCredit(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((part) => {
    if (!part || typeof part !== 'object') return '';
    const record = part as Record<string, unknown>;
    const artist = record.artist && typeof record.artist === 'object' ? record.artist as Record<string, unknown> : undefined;
    return `${stringValue(artist?.name) ?? stringValue(record.name) ?? ''}${stringValue(record.joinphrase) ?? ''}`;
  }).join('').trim() || undefined;
}

function stringValue(value: unknown): string | undefined { return typeof value === 'string' && value.length > 0 ? value : undefined; }
function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return undefined;
}
