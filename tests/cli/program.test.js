import { describe, expect, it } from 'vitest';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
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

describe('age', () => {
  it('shows the open work with its buckets', async () => {
    const result = await invoke(['age', '-c', CONFIG, '-f', FEED, '-a', '2024-03-15T09:00']);
    expect(result.code).toBe(0);
    expect(result.out).toContain('open work at 2024-03-15T09:00');
    expect(result.out).toContain('breached');
    expect(result.out).toContain('B240313000418');
  });

  it('refuses a moment it cannot read', async () => {
    const result = await invoke(['age', '-c', CONFIG, '-f', FEED, '-a', 'now']);
    expect(result.code).toBe(1);
  });
});

describe('queue', () => {
  it('orders the open work', async () => {
    const result = await invoke(['queue', '-c', CONFIG, '-f', FEED, '-a', '2024-03-15T09:00']);
    expect(result.code).toBe(0);
    expect(result.out).toContain('work queue at 2024-03-15T09:00');
    expect(result.out).toContain('emergency');
  });

  it('honours the row limit', async () => {
    const result = await invoke([
      'queue',
      '-c',
      CONFIG,
      '-f',
      FEED,
      '-a',
      '2024-03-15T09:00',
      '-n',
      '1',
    ]);
    const body = result.out.split('work queue')[1];
    const ticketLines = body.split('\n').filter((line) => /^B\d{12}/.test(line));
    expect(ticketLines).toHaveLength(1);
  });
});

describe('register', () => {
  it('prints the register', async () => {
    const result = await invoke(['register', '-c', CONFIG, '-f', FEED]);
    expect(result.code).toBe(0);
    expect(result.out).toContain('register of 4 tickets');
    expect(result.out).toContain('lawful start');
  });

  it('fills the response column when told when the desk answered', async () => {
    const result = await invoke(['register', '-c', CONFIG, '-f', FEED, '-a', '2024-03-14T08:00']);
    expect(result.out).toMatch(/\s9\s/);
  });

  it('writes the register out as csv', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'toneline-prog-'));
    const path = join(dir, 'register.csv');
    const result = await invoke(['register', '-c', CONFIG, '-f', FEED, '-o', path]);
    expect(result.code).toBe(0);
    expect(readFileSync(path, 'utf8').split('\n')[0]).toContain('ticket,type,status');
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('invoice', () => {
  it('bills the month the desk answered in', async () => {
    const result = await invoke([
      'invoice',
      '-c',
      CONFIG,
      '-f',
      FEED,
      '-p',
      '2024-03',
      '-a',
      '2024-03-14T08:00',
    ]);
    expect(result.code).toBe(0);
    expect(result.out).toContain('invoice for 2024-03');
    expect(result.out).toContain('total');
  });

  it('bills nothing for a month with no work', async () => {
    const result = await invoke([
      'invoice',
      '-c',
      CONFIG,
      '-f',
      FEED,
      '-p',
      '2024-05',
      '-a',
      '2024-03-14T08:00',
    ]);
    expect(result.code).toBe(0);
    expect(result.err).toContain('answered in another month');
  });

  it('refuses a period that is not a month', async () => {
    const result = await invoke([
      'invoice',
      '-c',
      CONFIG,
      '-f',
      FEED,
      '-p',
      'march',
      '-a',
      '2024-03-14T08:00',
    ]);
    expect(result.code).toBe(1);
  });
});

describe('brief', () => {
  it('prints the morning brief', async () => {
    const result = await invoke(['brief', '-c', CONFIG, '-f', FEED, '-a', '2024-03-15T09:00']);
    expect(result.code).toBe(0);
    expect(result.out).toContain('Cross Timbers Gas and Water at 2024-03-15T09:00');
    expect(result.out).toContain('open');
    expect(result.out).toContain('escalate');
  });

  it('prints the brief as json when asked', async () => {
    const result = await invoke([
      'brief',
      '-c',
      CONFIG,
      '-f',
      FEED,
      '-a',
      '2024-03-15T09:00',
      '--json',
    ]);
    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.out);
    expect(parsed.open).toBe(4);
    expect(parsed.operator).toBe('Cross Timbers Gas and Water');
  });

  it('leaves the escalation table out when there is nothing to chase', async () => {
    const quiet = await invoke(['brief', '-c', CONFIG, '-f', FEED, '-a', '2024-03-13T09:20']);
    expect(quiet.code).toBe(0);
    expect(quiet.out).not.toMatch(/^escalate\b/m);
    const busy = await invoke(['brief', '-c', CONFIG, '-f', FEED, '-a', '2024-03-15T09:00']);
    expect(busy.out).toMatch(/^escalate\b/m);
  });
});

describe('damage', () => {
  const DAMAGES = join(examples, 'damages-2024.csv');

  it('reports on the worked extract', async () => {
    const result = await invoke(['damage', '-d', DAMAGES]);
    expect(result.code).toBe(0);
    expect(result.out).toContain('3 damages');
    expect(result.out).toContain('NOTIFICATION');
    expect(result.out).toContain('DMG-2024-011');
  });

  it('works the rate out when it is told the ticket count', async () => {
    const result = await invoke(['damage', '-d', DAMAGES, '-f', FEED]);
    expect(result.out).toContain('ratePerThousand  750');
  });

  it('writes the register out as csv', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'toneline-prog-'));
    const path = join(dir, 'damages.csv');
    const result = await invoke(['damage', '-d', DAMAGES, '-o', path]);
    expect(result.code).toBe(0);
    expect(readFileSync(path, 'utf8').split('\n')[0]).toContain('id,at,ticket');
    rmSync(dir, { recursive: true, force: true });
  });

  it('fails on an extract row it cannot read unless told to skip', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'toneline-prog-'));
    const path = join(dir, 'bad.csv');
    writeFileSync(path, 'id,at,type,reported_by\nBAD,not a date,gas,loc-1\n');
    expect((await invoke(['damage', '-d', path])).code).toBe(1);
    const loose = await invoke(['damage', '-d', path, '--skip-bad']);
    expect(loose.code).toBe(0);
    expect(loose.err).toContain('row 2:');
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('coverage', () => {
  it('reports what was ours and what was touched', async () => {
    const result = await invoke(['coverage', '-c', CONFIG, '-f', FEED]);
    expect(result.code).toBe(0);
    expect(result.out).toContain('coverage over 4 tickets');
    expect(result.out).toMatch(/facilities\s+10/);
    expect(result.out).toMatch(/touched\s+\d/);
    expect(result.out).toContain('YUKON');
  });

  it('warns about a place the centre keeps sending work for', async () => {
    const result = await invoke(['coverage', '-c', CONFIG, '-f', FEED]);
    expect(result.err).toBe('');
  });

  it('checks the plant extract when asked', async () => {
    const plain = await invoke(['coverage', '-c', CONFIG, '-f', FEED]);
    const checked = await invoke(['coverage', '-c', CONFIG, '-f', FEED, '--quality']);
    expect(checked.code).toBe(0);
    expect(checked.out).toContain('GAS');
    expect(checked.out.length).toBeGreaterThan(plain.out.length);
  });

  it('names the plant that never came up', async () => {
    const result = await invoke(['coverage', '-c', CONFIG, '-f', FEED, '--quality']);
    expect(result.out).toMatch(/WATER\s+\d/);
  });
});

describe('book', () => {
  function journalPath() {
    return join(mkdtempSync(join(tmpdir(), 'toneline-book-')), 'journal.json');
  }

  it('posts a day into a new journal', async () => {
    const path = journalPath();
    const result = await invoke([
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
      'kmartel',
    ]);
    expect(result.code).toBe(0);
    expect(result.out).toContain('posting 4 tickets');
    expect(result.out).toContain('0 to 4');
    const journal = JSON.parse(readFileSync(path, 'utf8'));
    expect(journal.tickets).toHaveLength(4);
    expect(journal.audit).toHaveLength(4);
    rmSync(dirname(path), { recursive: true, force: true });
  });

  it('writes nothing on a dry run', async () => {
    const path = journalPath();
    const result = await invoke([
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
      'kmartel',
      '--dry-run',
    ]);
    expect(result.code).toBe(0);
    expect(result.out).toContain('dry run');
    expect(existsSync(path)).toBe(false);
    rmSync(dirname(path), { recursive: true, force: true });
  });

  it('appends onto a journal that is already there', async () => {
    const path = journalPath();
    const args = [
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
      'k',
    ];
    await invoke(args);
    const second = await invoke(args);
    expect(second.out).toContain('4 to 4');
    const journal = JSON.parse(readFileSync(path, 'utf8'));
    expect(journal.tickets).toHaveLength(4);
    expect(journal.responses.length).toBeGreaterThan(4);
    rmSync(dirname(path), { recursive: true, force: true });
  });

  it('refuses a journal it cannot read', async () => {
    const path = journalPath();
    writeFileSync(path, '{"version":99}');
    const result = await invoke([
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
      'k',
    ]);
    expect(result.code).toBe(1);
    expect(result.err).toContain('JOURNAL_INVALID');
    rmSync(dirname(path), { recursive: true, force: true });
  });
});
