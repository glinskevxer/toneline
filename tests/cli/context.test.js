import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { formatOf, makeWriters, openDesk, readFeed, runCommand } from '../../src/cli/context.js';
import { ConfigError } from '../../src/core/errors.js';

const here = dirname(fileURLToPath(import.meta.url));
const examples = join(here, '..', '..', 'examples');

function collector() {
  const lines = [];
  return { stream: { write: (text) => lines.push(text) }, lines };
}

let dir;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'toneline-cli-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('makeWriters', () => {
  it('writes text and lines to the stream it was given', () => {
    const out = collector();
    const err = collector();
    const writers = makeWriters({ out: out.stream, err: err.stream });
    writers.write('a');
    writers.line('b');
    writers.line();
    writers.warn('c');
    expect(out.lines).toEqual(['a', 'b\n', '\n']);
    expect(err.lines).toEqual(['c\n']);
  });
});

describe('openDesk', () => {
  it('loads the worked configuration and its plant', () => {
    const { desk, facilitiesPath } = openDesk(join(examples, 'cross-timbers.json'));
    expect(desk.network.size).toBe(10);
    expect(facilitiesPath).toContain('cross-timbers-plant.csv');
  });

  it('refuses a configuration that will not do', () => {
    writeFileSync(
      join(dir, 'bad.json'),
      JSON.stringify({ operator: {}, centre: {}, districts: [] })
    );
    expect(() => openDesk(join(dir, 'bad.json'))).toThrow(ConfigError);
  });

  it('can be told to refuse warnings as well', () => {
    writeFileSync(
      join(dir, 'thin.json'),
      JSON.stringify({
        operator: { name: 'x', code: 'X' },
        centre: { prefix: 'B', cutoff: '17:00' },
        districts: [],
      })
    );
    expect(() => openDesk(join(dir, 'thin.json'), { failOnWarning: true })).toThrow(/warnings/);
    expect(openDesk(join(dir, 'thin.json')).desk.districts).toEqual([]);
  });
});

describe('readFeed', () => {
  it('reads the worked feed', () => {
    expect(readFeed(join(examples, 'march-2024.feed')).tickets).toHaveLength(4);
  });

  it('throws on a bad block unless told to skip', () => {
    writeFileSync(join(dir, 'bad.feed'), 'TRANSMISSION: NORMAL');
    expect(() => readFeed(join(dir, 'bad.feed'))).toThrow(/missing a required field/);
    expect(readFeed(join(dir, 'bad.feed'), { skipBad: true }).failures).toHaveLength(1);
  });
});

describe('runCommand', () => {
  it('returns zero when the body says nothing', () => {
    const err = collector();
    const writers = makeWriters({ out: collector().stream, err: err.stream });
    expect(runCommand(writers, () => undefined)).toBe(0);
    expect(err.lines).toEqual([]);
  });

  it('passes a number the body returns straight back', () => {
    const writers = makeWriters({ out: collector().stream, err: collector().stream });
    expect(runCommand(writers, () => 2)).toBe(2);
  });

  it('prints the code and the message on a failure', () => {
    const err = collector();
    const writers = makeWriters({ out: collector().stream, err: err.stream });
    const code = runCommand(writers, () => {
      throw new ConfigError('the configuration cannot be used', { errors: ['a', 'b'] });
    });
    expect(code).toBe(1);
    expect(err.lines[0]).toBe('CONFIG_INVALID: the configuration cannot be used\n');
    expect(err.lines[1]).toBe('  errors: a, b\n');
  });

  it('shortens a long detail list', () => {
    const err = collector();
    const writers = makeWriters({ out: collector().stream, err: err.stream });
    runCommand(writers, () => {
      throw new ConfigError('nope', { errors: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] });
    });
    expect(err.lines[1]).toContain('and 2 more');
  });

  it('renders an object detail as json', () => {
    const err = collector();
    const writers = makeWriters({ out: collector().stream, err: err.stream });
    runCommand(writers, () => {
      throw new ConfigError('nope', { where: { line: 4 } });
    });
    expect(err.lines[1]).toBe('  where: {"line":4}\n');
  });

  it('wraps a native error', () => {
    const err = collector();
    const writers = makeWriters({ out: collector().stream, err: err.stream });
    expect(
      runCommand(writers, () => {
        throw new TypeError('not a function');
      })
    ).toBe(1);
    expect(err.lines[0]).toBe('INTERNAL: not a function\n');
  });
});

describe('feed formats', () => {
  it('takes the format from the file name', () => {
    expect(formatOf('march.feed')).toBe('transmission');
    expect(formatOf('/tmp/MARCH.CSV')).toBe('csv');
    expect(formatOf('march.txt')).toBe('transmission');
  });

  it('reads a csv feed', () => {
    writeFileSync(
      join(dir, 'feed.csv'),
      [
        'ticket,transmission,taken,address',
        'B240315000420,NORMAL,03/15/2024 07:42,1420 NW 23RD ST',
      ].join('\n')
    );
    const { tickets } = readFeed(join(dir, 'feed.csv'));
    expect(tickets).toHaveLength(1);
    expect(tickets[0].number).toBe('B240315000420');
  });

  it('can be told the format when the name does not say', () => {
    writeFileSync(
      join(dir, 'feed.dat'),
      [
        'ticket,transmission,taken,address',
        'B240315000420,NORMAL,03/15/2024 07:42,1420 NW 23RD ST',
      ].join('\n')
    );
    expect(readFeed(join(dir, 'feed.dat'), { format: 'csv' }).tickets).toHaveLength(1);
  });

  it('refuses a format it does not read', () => {
    writeFileSync(join(dir, 'feed.dat'), 'anything');
    expect(() => readFeed(join(dir, 'feed.dat'), { format: 'xml' })).toThrow(/not a feed format/);
  });

  it('collects failures out of a csv feed too', () => {
    writeFileSync(
      join(dir, 'bad.csv'),
      ['ticket,transmission,taken', 'BAD,NORMAL,never'].join('\n')
    );
    expect(() => readFeed(join(dir, 'bad.csv'))).toThrow();
    expect(readFeed(join(dir, 'bad.csv'), { skipBad: true }).failures).toHaveLength(1);
  });
});
