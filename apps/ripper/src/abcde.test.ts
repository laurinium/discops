import { describe, expect, it } from 'vitest';
import { parseProgress } from './abcde.js';

describe('abcde output parser', () => {
  it('extracts track counts and percent', () => {
    expect(parseProgress('Ripping track 4 of 11 67%')).toMatchObject({ currentTrack: 4, totalTracks: 11, progressPercent: 67 });
  });
});
