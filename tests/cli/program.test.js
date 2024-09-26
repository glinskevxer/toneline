import { describe, expect, it } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { run } from '../../src/cli/program.js';

const here = dirname(fileURLToPath(import.meta.url));
const examples = join(here, '..', '..', 'examples');
const CONFIG = join(examples, 'cross-timbers.json');
const FEED = join(examples, 'march-2024.feed');

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

describe('validate', () => {
  it('prints what it loaded', async () => {
    const result = await invoke(['validate', '-c', CONFIG]);
    expect(result.code).toBe(0);
    expect(result.out).toContain('Cross Timbers Gas and Water');
    expect(result.out).toContain('facilities  10');
    expect(result.err).toBe('');
  });

  it('fails on a configuration that will not do', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'toneline-prog-'));
    const path = join(dir, 'bad.json');
    writeFileSync(path, JSON.stringify({ operator: {}, centre: {}, districts: [] }));
    const result = await invoke(['validate', '-c', path]);
    expect(result.code).toBe(1);
    expect(result.err).toContain('CONFIG_INVALID');
    rmSync(dir, { recursive: true, force: true });
  });

  it('prints warnings without failing unless asked', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'toneline-prog-'));
    const path = join(dir, 'thin.json');
    writeFileSync(
      path,
      JSON.stringify({
        operator: { name: 'Thin Desk', code: 'TD' },
        centre: { prefix: 'B', cutoff: '17:00' },
        districts: [],
      })
    );
    const loose = await invoke(['validate', '-c', path]);
    expect(loose.code).toBe(0);
    expect(loose.err).toContain('warning:');
    const strict = await invoke(['validate', '-c', path, '--strict']);
    expect(strict.code).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });

  it('refuses to run without a configuration', async () => {
    const result = await invoke(['validate']);
    expect(result.code).not.toBe(0);
  });
});

describe('screen', () => {
  it('screens the worked feed', async () => {
    const result = await invoke(['screen', '-c', CONFIG, '-f', FEED]);
    expect(result.code).toBe(0);
    expect(result.out).toContain('screening 4 tickets');
    expect(result.out).toContain('B240313000418');
    expect(result.out).toContain('CENTRAL');
  });

  it('shows the recommended response code', async () => {
    const result = await invoke(['screen', '-c', CONFIG, '-f', FEED]);
    const yukon = result.out.split('\n').find((line) => line.includes('B240318000703'));
    expect(yukon).toMatch(/\s9\s/);
  });

  it('fails on a feed block it cannot read', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'toneline-prog-'));
    const path = join(dir, 'bad.feed');
    writeFileSync(path, 'TRANSMISSION: NORMAL');
    const strict = await invoke(['screen', '-c', CONFIG, '-f', path]);
    expect(strict.code).toBe(1);
    const loose = await invoke(['screen', '-c', CONFIG, '-f', path, '--skip-bad']);
    expect(loose.code).toBe(0);
    expect(loose.err).toContain('block 1:');
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('the program itself', () => {
  it('prints help without failing', async () => {
    const result = await invoke(['--help']);
    expect(result.code).toBe(0);
    expect(result.out).toContain('one call locate ticket handling');
  });

  it('prints its version', async () => {
    const result = await invoke(['--version']);
    expect(result.code).toBe(0);
  });

  it('rejects a command it does not have', async () => {
    const result = await invoke(['nonsense']);
    expect(result.code).not.toBe(0);
  });
});

describe('respond', () => {
  it('answers the worked feed', async () => {
    const result = await invoke([
      'respond',
      '-c',
      CONFIG,
      '-f',
      FEED,
      '-a',
      '2024-03-14T08:00',
      '-b',
      'kmartel',
    ]);
    expect(result.code).toBe(0);
    expect(result.out).toContain('answered 4 tickets');
    expect(result.out).toContain('postings');
  });

  it('writes the postings out when asked', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'toneline-prog-'));
    const path = join(dir, 'postings.json');
    const result = await invoke([
      'respond',
      '-c',
      CONFIG,
      '-f',
      FEED,
      '-a',
      '2024-03-14T08:00',
      '-b',
      'kmartel',
      '-o',
      path,
    ]);
    expect(result.code).toBe(0);
    expect(result.out).toContain('wrote');
    const written = JSON.parse(readFileSync(path, 'utf8'));
    expect(written.length).toBeGreaterThan(4);
    expect(written[0].by).toBe('kmartel');
    rmSync(dir, { recursive: true, force: true });
  });

  it('refuses a timestamp it cannot read', async () => {
    const result = await invoke([
      'respond',
      '-c',
      CONFIG,
      '-f',
      FEED,
      '-a',
      '14 march',
      '-b',
      'kmartel',
    ]);
    expect(result.code).toBe(1);
  });

  it('needs to be told who is answering', async () => {
    const result = await invoke(['respond', '-c', CONFIG, '-f', FEED, '-a', '2024-03-14T08:00']);
    expect(result.code).not.toBe(0);
  });
});
