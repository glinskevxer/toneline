import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../../src/cli/program.js';
import { parseCsv } from '../../src/io/csv.js';
import { readJournal } from '../../src/store/journal.js';

const here = dirname(fileURLToPath(import.meta.url));
const examples = join(here, '..', '..', 'examples');
const CONFIG = join(examples, 'cross-timbers.json');
const FEED = join(examples, 'march-2024.feed');
const DAMAGES = join(examples, 'damages-2024.csv');

/**
 * The files the commands write, checked the way anything downstream would read
 * them: off the disk and parsed, not through the object that produced them.
 *
 * This mirrors the check the worked example job runs in CI. It is here as well
 * because that check once passed on a file it could not actually read: it used
 * `require`, which picks its parser by file extension, and a `.geojson` file
 * went through as javascript.
 */

function collector() {
  return { write: () => {} };
}

async function invoke(argv) {
  return run(argv, { out: collector(), err: collector() });
}

/** Read a json file the way a reader with no extension mapping would. */
function readJsonFile(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

let dir;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'toneline-artefact-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('the postings file', () => {
  it('is json a reader can parse off the disk', async () => {
    const path = join(dir, 'postings.json');
    const code = await invoke([
      'respond',
      '-c',
      CONFIG,
      '-f',
      FEED,
      '-a',
      '2024-03-14T08:00',
      '-b',
      'ci',
      '-o',
      path,
    ]);
    expect(code).toBe(0);
    const postings = readJsonFile(path);
    expect(Array.isArray(postings)).toBe(true);
    expect(postings.length).toBeGreaterThanOrEqual(4);
    expect(postings[0]).toHaveProperty('code');
    expect(postings[0]).toHaveProperty('at');
  });
});

describe('the register file', () => {
  it('is csv with the header the regulator asks for', async () => {
    const path = join(dir, 'register.csv');
    const code = await invoke(['register', '-c', CONFIG, '-f', FEED, '-o', path]);
    expect(code).toBe(0);
    const text = readFileSync(path, 'utf8');
    expect(text.split('\n')[0]).toMatch(/^ticket,type,status/);
    const rows = parseCsv(text);
    expect(rows).toHaveLength(4);
    expect(rows[0].ticket).toMatch(/^B\d{12}$/);
  });
});

describe('the map file', () => {
  it('is a feature collection a reader can parse off the disk', async () => {
    const path = join(dir, 'desk.geojson');
    const code = await invoke(['map', '-c', CONFIG, '-f', FEED, '-o', path]);
    expect(code).toBe(0);
    const map = readJsonFile(path);
    expect(map.type).toBe('FeatureCollection');
    expect(map.features.length).toBeGreaterThanOrEqual(10);
    for (const feature of map.features) {
      expect(feature.type).toBe('Feature');
      expect(['LineString', 'Polygon']).toContain(feature.geometry.type);
    }
  });

  it('does not depend on the extension to be readable', async () => {
    const named = join(dir, 'desk.geojson');
    const plain = join(dir, 'desk.json');
    await invoke(['map', '-c', CONFIG, '-f', FEED, '-o', named]);
    await invoke(['map', '-c', CONFIG, '-f', FEED, '-o', plain]);
    expect(readJsonFile(named)).toEqual(readJsonFile(plain));
  });
});

describe('the journal file', () => {
  it('holds the day and seals to a digest', async () => {
    const path = join(dir, 'journal.json');
    const code = await invoke([
      'book',
      '-c',
      CONFIG,
      '-f',
      FEED,
      '-j',
      path,
      '-a',
      '2024-03-14T08:00',
      '-b',
      'ci',
    ]);
    expect(code).toBe(0);
    const journal = readJsonFile(path);
    expect(journal.tickets).toHaveLength(4);
    expect(journal.auditHead).toMatch(/^[0-9a-f]{64}$/);
    expect(readJournal(journal).audit).toHaveLength(4);
  });

  it('seals the same way when the same day is booked twice', async () => {
    const first = join(dir, 'a.json');
    const second = join(dir, 'b.json');
    const args = (path) => [
      'book',
      '-c',
      CONFIG,
      '-f',
      FEED,
      '-j',
      path,
      '-a',
      '2024-03-14T08:00',
      '-b',
      'ci',
    ];
    await invoke(args(first));
    await invoke(args(second));
    expect(readJsonFile(second).auditHead).toBe(readJsonFile(first).auditHead);
  });
});

describe('the damage register file', () => {
  it('is csv with its own header', async () => {
    const path = join(dir, 'damages.csv');
    const code = await invoke(['damage', '-d', DAMAGES, '-o', path]);
    expect(code).toBe(0);
    const rows = parseCsv(readFileSync(path, 'utf8'));
    expect(rows).toHaveLength(3);
    expect(rows[0].id).toBe('DMG-2024-011');
  });
});

describe('everything written in one run', () => {
  it('leaves four readable files behind', async () => {
    const paths = {
      postings: join(dir, 'postings.json'),
      register: join(dir, 'register.csv'),
      map: join(dir, 'desk.geojson'),
      journal: join(dir, 'journal.json'),
    };
    await invoke([
      'respond',
      '-c',
      CONFIG,
      '-f',
      FEED,
      '-a',
      '2024-03-14T08:00',
      '-b',
      'ci',
      '-o',
      paths.postings,
    ]);
    await invoke(['register', '-c', CONFIG, '-f', FEED, '-o', paths.register]);
    await invoke(['map', '-c', CONFIG, '-f', FEED, '-o', paths.map]);
    await invoke([
      'book',
      '-c',
      CONFIG,
      '-f',
      FEED,
      '-j',
      paths.journal,
      '-a',
      '2024-03-14T08:00',
      '-b',
      'ci',
    ]);
    for (const path of Object.values(paths)) {
      expect(readFileSync(path, 'utf8').length, path).toBeGreaterThan(0);
    }
    expect(readJsonFile(paths.map).type).toBe('FeatureCollection');
    expect(readJsonFile(paths.journal).tickets).toHaveLength(4);
  });
});
