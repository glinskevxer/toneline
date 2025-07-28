import { describe, expect, it } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { run, buildProgram } from '../../src/cli/program.js';

const here = dirname(fileURLToPath(import.meta.url));
const examples = join(here, '..', '..', 'examples');
const CONFIG = join(examples, 'cross-timbers.json');
const FEED = join(examples, 'march-2024.feed');
const DAMAGES = join(examples, 'damages-2024.csv');
const ROSTER = join(examples, 'roster.json');

function collector() {
  const chunks = [];
  return { stream: { write: (text) => chunks.push(text) }, text: () => chunks.join('') };
}

async function invoke(argv) {
  const out = collector();
  const err = collector();
  const code = await run(argv, { out: out.stream, err: err.stream });
  return { code, out: out.text(), err: err.text() };
}

/**
 * Every command has to fail the same way: a non zero exit, a code and a message
 * on the error stream, and nothing half written. A command that throws a raw
 * stack at somebody is a command nobody will run again.
 */

const AT = '2024-03-15T09:00';

const INVOCATIONS = [
  ['validate', ['-c', CONFIG]],
  ['screen', ['-c', CONFIG, '-f', FEED]],
  ['respond', ['-c', CONFIG, '-f', FEED, '-a', AT, '-b', 'ci']],
  ['find', ['-c', CONFIG, '-f', FEED, '-n', '000418']],
  ['age', ['-c', CONFIG, '-f', FEED, '-a', AT]],
  ['queue', ['-c', CONFIG, '-f', FEED, '-a', AT]],
  ['brief', ['-c', CONFIG, '-f', FEED, '-a', AT]],
  ['exceptions', ['-c', CONFIG, '-f', FEED, '-a', AT]],
  ['capacity', ['-c', CONFIG, '-f', FEED, '-r', ROSTER]],
  ['register', ['-c', CONFIG, '-f', FEED]],
  ['invoice', ['-c', CONFIG, '-f', FEED, '-p', '2024-03', '-a', AT]],
  ['month', ['-c', CONFIG, '-f', FEED, '-p', '2024-03', '-a', AT]],
  ['coverage', ['-c', CONFIG, '-f', FEED]],
  ['map', ['-c', CONFIG, '-f', FEED]],
];

describe('every command', () => {
  it('runs against the worked desk', async () => {
    for (const [name, args] of INVOCATIONS) {
      const result = await invoke([name, ...args]);
      expect(result.code, `${name}: ${result.err}`).toBe(0);
    }
  });

  it('fails cleanly on a configuration that is not there', async () => {
    for (const [name, args] of INVOCATIONS) {
      const swapped = args.map((arg) => (arg === CONFIG ? '/nowhere/desk.json' : arg));
      const result = await invoke([name, ...swapped]);
      expect(result.code, name).toBe(1);
      expect(result.err, name).toMatch(/^[A-Z_]+: /);
      expect(result.err, name).not.toContain('at Object.');
    }
  });

  it('fails cleanly on a feed that is not there', async () => {
    for (const [name, args] of INVOCATIONS) {
      if (!args.includes(FEED)) continue;
      const swapped = args.map((arg) => (arg === FEED ? '/nowhere/feed.txt' : arg));
      const result = await invoke([name, ...swapped]);
      expect(result.code, name).toBe(1);
      expect(result.err, name).toContain('FEED_UNREADABLE');
    }
  });

  it('fails cleanly on a configuration that is not json', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'toneline-fail-'));
    const path = join(dir, 'desk.json');
    writeFileSync(path, 'this is not json');
    for (const [name, args] of INVOCATIONS.slice(0, 5)) {
      const swapped = args.map((arg) => (arg === CONFIG ? path : arg));
      const result = await invoke([name, ...swapped]);
      expect(result.code, name).toBe(1);
      expect(result.err, name).toContain('CONFIG_INVALID');
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it('refuses to run without the options it needs', async () => {
    for (const [name] of INVOCATIONS) {
      const result = await invoke([name]);
      expect(result.code, name).not.toBe(0);
    }
  });

  it('writes nothing to the output stream when it fails', async () => {
    const result = await invoke(['screen', '-c', '/nowhere/desk.json', '-f', FEED]);
    expect(result.out).toBe('');
  });
});

describe('the damage command', () => {
  it('runs and fails cleanly the same way', async () => {
    expect((await invoke(['damage', '-d', DAMAGES])).code).toBe(0);
    const missing = await invoke(['damage', '-d', '/nowhere/damages.csv']);
    expect(missing.code).toBe(1);
    expect(missing.err).toContain('FEED_UNREADABLE');
  });
});

describe('the program itself', () => {
  it('lists every command it carries', () => {
    const names = buildProgram().commands.map((command) => command.name());
    for (const [name] of INVOCATIONS) {
      expect(names, name).toContain(name);
    }
    expect(names).toContain('book');
    expect(names).toContain('damage');
  });

  it('gives every command at least one required option', () => {
    for (const command of buildProgram().commands) {
      const required = command.options.filter((option) => option.required || option.mandatory);
      expect(required.length, command.name()).toBeGreaterThan(0);
    }
  });
});
