import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readText,
  readJson,
  writeText,
  writeJson,
  exists,
  readConfigWithFacilities,
} from '../../src/io/files.js';
import { ConfigError, FeedParseError } from '../../src/core/errors.js';

let dir;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'toneline-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('readText', () => {
  it('reads a file', () => {
    writeFileSync(join(dir, 'a.txt'), 'hello');
    expect(readText(join(dir, 'a.txt'))).toBe('hello');
  });

  it('names the path it could not read', () => {
    try {
      readText(join(dir, 'missing.txt'));
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(FeedParseError);
      expect(err.details.path).toContain('missing.txt');
      expect(err.details.reason).toBe('ENOENT');
    }
  });
});

describe('readJson', () => {
  it('parses a file', () => {
    writeFileSync(join(dir, 'a.json'), '{"a":1}');
    expect(readJson(join(dir, 'a.json'))).toEqual({ a: 1 });
  });

  it('names the path when the json is broken', () => {
    writeFileSync(join(dir, 'a.json'), '{oops');
    try {
      readJson(join(dir, 'a.json'));
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect(err.details.path).toContain('a.json');
    }
  });
});

describe('writeText and writeJson', () => {
  it('writes and reads back', () => {
    const path = writeText(join(dir, 'out', 'a.txt'), 'hello');
    expect(readText(path)).toBe('hello');
  });

  it('makes the directory above it', () => {
    writeText(join(dir, 'deep', 'deeper', 'a.txt'), 'x');
    expect(exists(join(dir, 'deep', 'deeper', 'a.txt'))).toBe(true);
  });

  it('writes json with a trailing newline', () => {
    const path = writeJson(join(dir, 'a.json'), { a: 1 });
    expect(readText(path)).toBe('{\n  "a": 1\n}\n');
  });

  it('names the path it could not write', () => {
    writeFileSync(join(dir, 'blocked'), 'x');
    expect(() => writeText(join(dir, 'blocked', 'a.txt'), 'x')).toThrow(FeedParseError);
  });
});

describe('exists', () => {
  it('answers both ways', () => {
    writeFileSync(join(dir, 'a.txt'), 'x');
    expect(exists(join(dir, 'a.txt'))).toBe(true);
    expect(exists(join(dir, 'b.txt'))).toBe(false);
  });
});

describe('readConfigWithFacilities', () => {
  function readFacilities(text) {
    return text.trim() === 'bad'
      ? { facilities: [], failures: [{ row: 2 }] }
      : { facilities: [{ id: 'GM-1' }], failures: [] };
  }

  it('reads the extract named beside the configuration', () => {
    writeFileSync(join(dir, 'desk.json'), JSON.stringify({ facilities: 'plant.csv' }));
    writeFileSync(join(dir, 'plant.csv'), 'id\nGM-1');
    const result = readConfigWithFacilities(join(dir, 'desk.json'), { readFacilities });
    expect(result.facilities).toEqual([{ id: 'GM-1' }]);
    expect(result.facilitiesPath).toContain('plant.csv');
  });

  it('reads a path relative to the configuration, not the working directory', () => {
    writeFileSync(join(dir, 'desk.json'), JSON.stringify({ facilities: './plant.csv' }));
    writeFileSync(join(dir, 'plant.csv'), 'id\nGM-1');
    expect(
      readConfigWithFacilities(join(dir, 'desk.json'), { readFacilities }).facilities
    ).toHaveLength(1);
  });

  it('returns nothing when the configuration names no extract', () => {
    writeFileSync(join(dir, 'desk.json'), JSON.stringify({ operator: {} }));
    const result = readConfigWithFacilities(join(dir, 'desk.json'), { readFacilities });
    expect(result.facilities).toEqual([]);
    expect(result.facilitiesPath).toBeNull();
  });

  it('refuses an extract with unreadable rows', () => {
    writeFileSync(join(dir, 'desk.json'), JSON.stringify({ facilities: 'plant.csv' }));
    writeFileSync(join(dir, 'plant.csv'), 'bad');
    expect(() => readConfigWithFacilities(join(dir, 'desk.json'), { readFacilities })).toThrow(
      /rows that cannot be read/
    );
  });
});
