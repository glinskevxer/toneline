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

describe('month', () => {
  const DAMAGES = join(examples, 'damages-2024.csv');

  it('packs the month', async () => {
    const result = await invoke([
      'month',
      '-c',
      CONFIG,
      '-f',
      FEED,
      '-p',
      '2024-03',
      '-a',
      '2024-03-20T08:00',
    ]);
    expect(result.code).toBe(0);
    expect(result.out).toContain('monthly pack 2024-03');
    expect(result.out).toContain('Cross Timbers Gas and Water, 2024-03');
    expect(result.out).toContain('on time');
  });

  it('takes the damages into the pack', async () => {
    const result = await invoke([
      'month',
      '-c',
      CONFIG,
      '-f',
      FEED,
      '-p',
      '2024-03',
      '-a',
      '2024-03-20T08:00',
      '-d',
      DAMAGES,
      '--json',
    ]);
    const pack = JSON.parse(result.out);
    expect(pack.damages.damages).toBe(1);
    expect(pack.tickets).toBe(4);
  });

  it('refuses a period that is not a month', async () => {
    const result = await invoke([
      'month',
      '-c',
      CONFIG,
      '-f',
      FEED,
      '-p',
      'march',
      '-a',
      '2024-03-20T08:00',
    ]);
    expect(result.code).toBe(1);
  });
});

describe('map', () => {
  it('writes the network and the tickets together', async () => {
    const result = await invoke(['map', '-c', CONFIG, '-f', FEED]);
    expect(result.code).toBe(0);
    const geo = JSON.parse(result.out);
    expect(geo.type).toBe('FeatureCollection');
    expect(geo.features.length).toBeGreaterThan(10);
  });

  it('writes only the network when asked', async () => {
    const result = await invoke(['map', '-c', CONFIG, '--only', 'network']);
    const geo = JSON.parse(result.out);
    expect(geo.features).toHaveLength(10);
    expect(geo.features.every((feature) => feature.geometry.type === 'LineString')).toBe(true);
  });

  it('writes only the tickets when asked', async () => {
    const result = await invoke(['map', '-c', CONFIG, '-f', FEED, '--only', 'tickets']);
    const geo = JSON.parse(result.out);
    expect(geo.features.every((feature) => feature.geometry.type === 'Polygon')).toBe(true);
  });

  it('warns when there is nothing to draw', async () => {
    const result = await invoke(['map', '-c', CONFIG, '--only', 'tickets']);
    expect(result.code).toBe(0);
    expect(result.err).toContain('no feed was given');
  });

  it('refuses an option it does not understand', async () => {
    const result = await invoke(['map', '-c', CONFIG, '--only', 'everything']);
    expect(result.code).toBe(1);
    expect(result.err).toContain('--only must be');
  });

  it('writes to a file when asked', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'toneline-prog-'));
    const path = join(dir, 'desk.geojson');
    const result = await invoke(['map', '-c', CONFIG, '-f', FEED, '-o', path]);
    expect(result.out).toContain('features to');
    expect(JSON.parse(readFileSync(path, 'utf8')).type).toBe('FeatureCollection');
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('find', () => {
  it('finds a ticket by part of its number', async () => {
    const result = await invoke(['find', '-c', CONFIG, '-f', FEED, '-n', '000502']);
    expect(result.code).toBe(0);
    expect(result.out).toContain('1 tickets matched');
    expect(result.out).toContain('B240314000502');
  });

  it('finds by street however it is spelled', async () => {
    const result = await invoke(['find', '-c', CONFIG, '-f', FEED, '-s', 'northwest 23 street']);
    expect(result.out).toContain('B240313000418');
  });

  it('finds by excavator', async () => {
    const result = await invoke(['find', '-c', CONFIG, '-f', FEED, '-e', 'sooner']);
    expect(result.out).toContain('B240314000502');
  });

  it('says plainly when nothing matched', async () => {
    const result = await invoke(['find', '-c', CONFIG, '-f', FEED, '-n', 'zzz']);
    expect(result.code).toBe(0);
    expect(result.err).toContain('nothing matched');
  });

  it('explains the screening when asked', async () => {
    const result = await invoke(['find', '-c', CONFIG, '-f', FEED, '-n', '000418', '--explain']);
    expect(result.out).toContain('ticket B240313000418');
    expect(result.out).toContain('family:');
  });

  it('returns nothing when no term was given', async () => {
    const result = await invoke(['find', '-c', CONFIG, '-f', FEED]);
    expect(result.err).toContain('nothing matched');
  });
});

describe('capacity', () => {
  const ROSTER = join(examples, 'roster.json');

  it('says whether the day fits', async () => {
    const result = await invoke(['capacity', '-c', CONFIG, '-f', FEED, '-r', ROSTER]);
    expect(result.code).toBe(0);
    expect(result.out).toContain('capacity for');
    expect(result.out).toContain('the day fits');
  });

  it('lists who is free', async () => {
    const result = await invoke(['capacity', '-c', CONFIG, '-f', FEED, '-r', ROSTER]);
    expect(result.out).toContain('LOC-14');
    expect(result.out).toContain('LOC-22');
  });

  it('shows the demand by skill', async () => {
    const result = await invoke([
      'capacity',
      '-c',
      CONFIG,
      '-f',
      FEED,
      '-r',
      ROSTER,
      '-a',
      '2024-03-15T09:00',
    ]);
    expect(result.out).toContain('skill');
    expect(result.out).toContain('GAS');
  });

  it('refuses a roster it cannot read', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'toneline-prog-'));
    const path = join(dir, 'roster.json');
    writeFileSync(path, JSON.stringify([{ id: 'loc-1' }]));
    const result = await invoke(['capacity', '-c', CONFIG, '-f', FEED, '-r', path]);
    expect(result.code).toBe(1);
    expect(result.err).toContain('ROSTER_INVALID');
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('exceptions', () => {
  it('lists everything that needs a person', async () => {
    const result = await invoke(['exceptions', '-c', CONFIG, '-f', FEED, '-a', '2024-03-15T09:00']);
    expect(result.code).toBe(0);
    expect(result.out).toContain('things need a person');
    expect(result.out).toContain('escalation');
  });

  it('counts every kind', async () => {
    const result = await invoke(['exceptions', '-c', CONFIG, '-f', FEED, '-a', '2024-03-15T09:00']);
    expect(result.out).toMatch(/plant\s+\d/);
    expect(result.out).toMatch(/ticket\s+\d/);
  });

  it('honours the row limit', async () => {
    const result = await invoke([
      'exceptions',
      '-c',
      CONFIG,
      '-f',
      FEED,
      '-a',
      '2024-03-15T09:00',
      '-n',
      '1',
    ]);
    const body = result.out.split('detail')[1] ?? '';
    const rows = body
      .split('\n')
      .filter((line) => /^(escalation|compliance|ticket|plant)\s/.test(line));
    expect(rows).toHaveLength(1);
  });

  it('refuses a moment it cannot read', async () => {
    const result = await invoke(['exceptions', '-c', CONFIG, '-f', FEED, '-a', 'now']);
    expect(result.code).toBe(1);
  });
});

describe('the grid advice on the coverage report', () => {
  it('says how the index is sized', async () => {
    const result = await invoke(['coverage', '-c', CONFIG, '-f', FEED, '--quality']);
    expect(result.code).toBe(0);
    expect(result.out).toMatch(/cellDegrees\s+[\d.]+/);
    expect(result.out).toMatch(/recommended\s+[\d.]+/);
    expect(result.out).toContain('grid');
  });

  it('leaves the advice out unless it was asked for', async () => {
    const result = await invoke(['coverage', '-c', CONFIG, '-f', FEED]);
    expect(result.out).not.toContain('cellDegrees');
  });
});

describe('a csv feed on the command line', () => {
  it('screens a csv feed as readily as a transmission', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'toneline-prog-'));
    const path = join(dir, 'feed.csv');
    writeFileSync(
      path,
      [
        'ticket,transmission,taken,place,address,extent,members,grids',
        'B240315000420,NORMAL,03/15/2024 07:42,OKLAHOMA CITY,1420 NW 23RD ST,east 20 feet,CTG01,"35.4676,-97.5150"',
      ].join('\n')
    );
    const result = await invoke(['screen', '-c', CONFIG, '-f', path]);
    expect(result.code).toBe(0);
    expect(result.out).toContain('B240315000420');
    rmSync(dir, { recursive: true, force: true });
  });

  it('can be told the format when the name does not say', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'toneline-prog-'));
    const path = join(dir, 'feed.dat');
    writeFileSync(
      path,
      ['ticket,transmission,taken,address', 'B240315000420,NORMAL,03/15/2024 07:42,x'].join('\n')
    );
    const result = await invoke(['screen', '-c', CONFIG, '-f', path, '--format', 'csv']);
    expect(result.code).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  });
});
