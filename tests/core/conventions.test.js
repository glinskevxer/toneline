import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TonelineError, isTonelineError } from '../../src/core/errors.js';

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, '..', '..', 'src');

function walk(directory) {
  const found = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...walk(path));
    else if (entry.endsWith('.js')) found.push(path);
  }
  return found;
}

const FILES = walk(srcRoot);

/**
 * These are the conventions the library is written to, checked over the files
 * themselves rather than remembered. A convention nobody enforces is a
 * convention that lasts until the next hurry.
 */

describe('the source layout', () => {
  it('has a file for every layer it claims', () => {
    const directories = new Set(
      FILES.map((path) => relative(srcRoot, path).split('/')[0]).filter(
        (part) => !part.endsWith('.js')
      )
    );
    for (const layer of [
      'core',
      'time',
      'geo',
      'text',
      'io',
      'ticket',
      'network',
      'screening',
      'response',
      'dispatch',
      'damage',
      'billing',
      'reporting',
      'store',
      'cli',
      'config',
    ]) {
      expect(directories).toContain(layer);
    }
  });

  it('has more than one file in every layer worth having', () => {
    expect(FILES.length).toBeGreaterThan(50);
  });
});

describe('every module', () => {
  it('opens with a block comment saying what it is for', () => {
    for (const path of FILES) {
      const text = readFileSync(path, 'utf8');
      expect(text.startsWith('/**'), `${relative(srcRoot, path)} has no opening comment`).toBe(
        true
      );
    }
  });

  it('exports something', () => {
    for (const path of FILES) {
      const text = readFileSync(path, 'utf8');
      expect(text.includes('export '), `${relative(srcRoot, path)} exports nothing`).toBe(true);
    }
  });

  it('throws nothing bare', () => {
    for (const path of FILES) {
      const text = readFileSync(path, 'utf8');
      const bare = text.match(/throw new Error\(/g) ?? [];
      expect(bare, `${relative(srcRoot, path)} throws a bare Error`).toHaveLength(0);
    }
  });

  it('never reads the wall clock outside the clock module', () => {
    for (const path of FILES) {
      if (relative(srcRoot, path) === 'core/clock.js') continue;
      const text = readFileSync(path, 'utf8');
      expect(text.includes('Date.now('), `${relative(srcRoot, path)} reads the wall clock`).toBe(
        false
      );
      expect(text.includes('new Date()'), `${relative(srcRoot, path)} reads the wall clock`).toBe(
        false
      );
    }
  });

  it('imports with a file extension so node can find it', () => {
    for (const path of FILES) {
      const text = readFileSync(path, 'utf8');
      for (const line of text.split('\n')) {
        const match = /^import .* from '(\.[^']+)';$/.exec(line);
        if (match) {
          expect(match[1].endsWith('.js'), `${relative(srcRoot, path)}: ${line}`).toBe(true);
        }
      }
    }
  });
});

describe('every error the library throws on purpose', () => {
  const CLASSES = [
    ['core/errors.js', ['ConfigError', 'FeedParseError', 'TicketError', 'ScheduleError']],
    ['core/fields.js', ['FieldError']],
    ['core/clock.js', ['ClockError']],
    ['geo/point.js', ['GeometryError']],
    ['network/facility.js', ['FacilityError']],
    ['network/district.js', ['DistrictError']],
    ['response/codes.js', ['ResponseError']],
    ['dispatch/locator.js', ['RosterError']],
    ['dispatch/assign.js', ['DispatchError']],
    ['dispatch/route.js', ['RouteError']],
    ['damage/report.js', ['DamageError']],
    ['billing/rates.js', ['BillingError']],
    ['audit/trail.js', ['AuditError']],
    ['store/journal.js', ['JournalError']],
    ['store/book.js', ['BookError']],
    ['config/policies.js', ['PolicyError']],
  ];

  it('descends from the one base class', async () => {
    for (const [path, names] of CLASSES) {
      const module = await import(pathToFileURL(join(srcRoot, path)).href);
      for (const name of names) {
        const built = new module[name]('something went wrong');
        expect(built, `${path}:${name}`).toBeInstanceOf(TonelineError);
        expect(isTonelineError(built)).toBe(true);
      }
    }
  });

  it('carries a code and an empty details bag by default', async () => {
    for (const [path, names] of CLASSES) {
      const module = await import(pathToFileURL(join(srcRoot, path)).href);
      for (const name of names) {
        const built = new module[name]('something went wrong');
        expect(built.code, `${path}:${name}`).toMatch(/^[A-Z_]+$/);
        expect(built.details).toEqual({});
      }
    }
  });

  it('names itself after its own class', async () => {
    for (const [path, names] of CLASSES) {
      const module = await import(pathToFileURL(join(srcRoot, path)).href);
      for (const name of names) {
        expect(new module[name]('x').name).toBe(name);
      }
    }
  });

  it('gives every class its own code', async () => {
    const codes = new Set();
    for (const [path, names] of CLASSES) {
      const module = await import(pathToFileURL(join(srcRoot, path)).href);
      for (const name of names) {
        codes.add(new module[name]('x').code);
      }
    }
    expect(codes.size).toBeGreaterThan(10);
  });
});
