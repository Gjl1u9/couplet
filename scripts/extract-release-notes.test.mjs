import { describe, expect, it } from 'vitest';
import { extractReleaseNotes } from './extract-release-notes.mjs';

const CHANGELOG = `# Changelog

## [Unreleased]

- Not out yet.

## [0.2.0] - 2026-12-01

### Fixed

- A fix.

## [0.1.0] - 2026-11-10

### Added

- The first release.
`;

describe('extractReleaseNotes', () => {
  it('returns only the section of that version', () => {
    expect(extractReleaseNotes(CHANGELOG, 'v0.2.0')).toBe(
      '### Fixed\n\n- A fix.',
    );
  });

  it('reads the last section up to the end of the file', () => {
    expect(extractReleaseNotes(CHANGELOG, 'v0.1.0')).toBe(
      '### Added\n\n- The first release.',
    );
  });

  it('does not take a version for one that only starts the same', () => {
    expect(extractReleaseNotes(CHANGELOG, 'v0.1')).toBeUndefined();
  });

  it('finds nothing for a missing version or an empty section', () => {
    expect(extractReleaseNotes(CHANGELOG, 'v9.9.9')).toBeUndefined();
    expect(
      extractReleaseNotes('## [1.0.0]\n\n## [0.9.0]\n\n- Old.', 'v1.0.0'),
    ).toBeUndefined();
  });
});
