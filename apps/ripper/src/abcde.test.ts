import { describe, expect, it } from 'vitest';
import { parseAbcdeTrackListCount, parseProgress, parseTracksQueuedCount } from './abcde.js';

describe('abcde output parser', () => {
  it('extracts track counts and percent', () => {
    expect(parseProgress('Ripping track 4 of 11 67%')).toMatchObject({ currentTrack: 4, totalTracks: 11, progressPercent: 67 });
  });

  it('counts abcde audio track list output', () => {
    expect(parseAbcdeTrackListCount(' 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15')).toBe(15);
    expect(parseTracksQueuedCount('Tracks queued:  01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16')).toBe(16);
  });
});
