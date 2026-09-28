import { describe, expect, it } from 'vitest';
import { canTransition, nextStateOrThrow } from './index.js';

describe('job state machine', () => {
  it('allows normal ripping path', () => {
    expect(canTransition('idle', 'disc-detected')).toBe(true);
    expect(canTransition('disc-detected', 'ripping')).toBe(true);
    expect(canTransition('ripping', 'completed')).toBe(true);
  });

  it('rejects impossible transitions', () => {
    expect(() => nextStateOrThrow('idle', 'completed')).toThrow();
  });
});
