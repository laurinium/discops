import { describe, expect, it } from 'vitest';
import { ripProgressPatch } from './grpc.js';

describe('ripProgressPatch', () => {
  it('keeps absent fields out of the patch so existing UI metadata is preserved', () => {
    expect(ripProgressPatch({ type: 'RIP_PROGRESS', phase: 'RIPPING' })).toEqual({ state: 'ripping' });
  });

  it('includes provided metadata and progress fields', () => {
    expect(ripProgressPatch({
      type: 'RIP_PROGRESS',
      phase: 'ENCODING',
      currentTrack: 3,
      totalTracks: 11,
      progressPercent: 42,
      currentFile: 'track03.wav',
      artist: 'Artist',
      album: 'Album',
      discNumber: 1,
      totalDiscs: 2,
    })).toEqual({
      state: 'encoding',
      currentTrack: 3,
      totalTracks: 11,
      progressPercent: 42,
      currentFile: 'track03.wav',
      artist: 'Artist',
      album: 'Album',
      discNumber: 1,
      totalDiscs: 2,
    });
  });
});
