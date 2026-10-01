import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { atomicPublish, classifyAbcdeFailure, createJobPaths, markInterruptedJobs, prepareFreshJob, sanitizePathSegment, validateCompletedRip } from './armAudio.js';

let root = '';
let oldPath = '';

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'rippy-arm-'));
  oldPath = process.env.PATH ?? '';
  const bin = path.join(root, 'bin');
  mkdirSync(bin);
  writeFileSync(path.join(bin, 'flac'), '#!/bin/sh\n[ "$FLAC_FAIL" = "1" ] && exit 1\nexit 0\n', { mode: 0o755 });
  process.env.PATH = `${bin}:${oldPath}`;
});

afterEach(() => {
  process.env.PATH = oldPath;
  delete process.env.FLAC_FAIL;
  rmSync(root, { recursive: true, force: true });
});

function makeFlacs(count: number) {
  const paths = createJobPaths(root, 'job-a');
  prepareFreshJob(paths);
  const album = path.join(paths.stagingDir, 'Artist', 'Album');
  mkdirSync(album, { recursive: true });
  for (let i = 1; i <= count; i++) writeFileSync(path.join(album, `${String(i).padStart(2, '0')} - Track.flac`), 'fLaC');
  return paths;
}

describe('ARM-style audio orchestration helpers', () => {
  it('completes only when exit is zero, expected tracks exist, FLAC verifies, and publish succeeds', () => {
    const paths = makeFlacs(12);
    const validation = validateCompletedRip(paths, 12, 0);
    expect(validation.ok).toBe(true);
    const library = path.join(root, 'music');
    atomicPublish(paths, library);
    expect(readdirSync(library).find((entry) => entry.startsWith('.rippy-staging-'))).toBeUndefined();
    const secondDisc = makeFlacs(12);
    atomicPublish(secondDisc, library);
    expect(readdirSync(path.join(library, 'Artist')).sort()).toEqual(['Album', 'Album [job-a]']);
  });

  it('fails partial read output and publishes nothing', () => {
    const paths = makeFlacs(8);
    const validation = validateCompletedRip(paths, 12, 1);
    expect(validation.ok).toBe(false);
    expect(validation.failureType).toBe('UNKNOWN_ERROR');
    expect(validation.error).toContain('unclassified');
  });

  it('classifies known abcde and drive failure logs', () => {
    const paths = makeFlacs(0);
    writeFileSync(paths.stderrLog, "Can't connect: Temporary failure in name resolution\n");
    expect(classifyAbcdeFailure(paths)).toEqual({ failureType: 'FAILED_METADATA', reason: 'metadata lookup failed due to network/DNS error' });
    writeFileSync(paths.stderrLog, 'cdparanoia: scsi_read error: MEDIUM ERROR\n');
    expect(classifyAbcdeFailure(paths).failureType).toBe('FAILED_READ');
    writeFileSync(paths.stderrLog, 'Scsi error - NOT READY:MEDIUM NOT PRESENT - TRAY OPEN\n');
    expect(classifyAbcdeFailure(paths).failureType).toBe('FAILED_INTERRUPTED');
  });

  it('fails when abcde creates fewer FLACs despite exit zero', () => {
    const paths = makeFlacs(11);
    const validation = validateCompletedRip(paths, 12, 0);
    expect(validation.ok).toBe(false);
    expect(validation.failureType).toBe('FAILED_VERIFY');
  });

  it('fails when FLAC verification fails', () => {
    process.env.FLAC_FAIL = '1';
    const paths = makeFlacs(12);
    const validation = validateCompletedRip(paths, 12, 0);
    expect(validation.ok).toBe(false);
    expect(validation.failureType).toBe('FAILED_VERIFY');
  });

  it('sanitizes malicious metadata path segments', () => {
    expect(sanitizePathSegment('../../foo')).not.toContain('/');
    expect(sanitizePathSegment('$(touch /tmp/pwned)')).not.toContain('/');
    expect(sanitizePathSegment('Artist/../../../etc')).not.toContain('/');
    expect(sanitizePathSegment('line\nbreak')).toBe('linebreak');
  });

  it('marks stale running jobs interrupted after restart', () => {
    const paths = createJobPaths(root, 'job-crashed');
    prepareFreshJob(paths);
    writeFileSync(path.join(paths.workDir, 'RUNNING'), new Date().toISOString());
    expect(markInterruptedJobs(root)).toEqual(['job-crashed']);
  });
});
