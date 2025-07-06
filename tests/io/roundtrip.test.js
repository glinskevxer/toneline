import { describe, expect, it } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, writeCsv } from '../../src/io/csv.js';
import { readFacilityCsv, writeFacilityCsv } from '../../src/io/facilities.js';
import { readDamageCsv, writeDamageCsv } from '../../src/io/damages.js';
import { parseTransmission, splitTransmissions } from '../../src/io/transmission.js';
import { parseTicketBatch } from '../../src/ticket/parse.js';
import { readText } from '../../src/io/files.js';
import { renderBatch, parseAcknowledgement } from '../../src/response/transmit.js';
import { buildResponse } from '../../src/response/post.js';
import { writeRegisterCsv, buildRegister } from '../../src/reporting/register.js';
import { parseWkt, writeWktLine, writeWktPolygon, writeWktPoint } from '../../src/geo/wkt.js';
import { emptyJournal, readJournal, writeJournal } from '../../src/store/journal.js';

const here = dirname(fileURLToPath(import.meta.url));
const examples = join(here, '..', '..', 'examples');

/**
 * Everything that leaves this desk can come back. A format the library writes
 * and cannot read is a format that will be read by hand at three in the
 * morning, so each of them goes out and comes back here.
 */

describe('csv', () => {
  it('round trips awkward values', () => {
    const records = [
      { a: 'plain', b: 'one, two', c: 'he said "hi"' },
      { a: '  padded  ', b: 'line one\nline two', c: '' },
    ];
    const again = parseCsv(writeCsv(records), { trim: false });
    expect(again).toEqual(records);
  });

  it('round trips an empty value as an empty value', () => {
    expect(parseCsv(writeCsv([{ a: '', b: 'x' }]))).toEqual([{ a: '', b: 'x' }]);
  });
});

describe('the facility extract', () => {
  it('round trips the worked plant', () => {
    const { facilities } = readFacilityCsv(readText(join(examples, 'cross-timbers-plant.csv')));
    expect(readFacilityCsv(writeFacilityCsv(facilities)).facilities).toEqual(facilities);
  });

  it('round trips twice without drifting', () => {
    const { facilities } = readFacilityCsv(readText(join(examples, 'cross-timbers-plant.csv')));
    const once = writeFacilityCsv(facilities);
    const twice = writeFacilityCsv(readFacilityCsv(once).facilities);
    expect(twice).toBe(once);
  });
});

describe('the damage extract', () => {
  it('round trips the worked damages', () => {
    const { damages } = readDamageCsv(readText(join(examples, 'damages-2024.csv')));
    expect(readDamageCsv(writeDamageCsv(damages)).damages).toEqual(damages);
  });

  it('round trips twice without drifting', () => {
    const { damages } = readDamageCsv(readText(join(examples, 'damages-2024.csv')));
    const once = writeDamageCsv(damages);
    expect(writeDamageCsv(readDamageCsv(once).damages)).toBe(once);
  });
});

describe('the transmission feed', () => {
  const text = readText(join(examples, 'march-2024.feed'));

  it('reads every block it splits', () => {
    const blocks = splitTransmissions(text);
    expect(blocks).toHaveLength(4);
    for (const block of blocks) {
      expect(Object.keys(parseTransmission(block).fields).length).toBeGreaterThan(5);
    }
  });

  it('reads the same tickets whichever way the file ends', () => {
    const withRule = `${text}\n=========\n`;
    expect(parseTicketBatch(withRule).tickets).toHaveLength(4);
  });

  it('reads a file with windows line endings', () => {
    const windows = text.replace(/\n/g, '\r\n');
    expect(parseTicketBatch(windows).tickets).toHaveLength(4);
  });
});

describe('the outbound batch', () => {
  it('renders and the acknowledgement reads back', () => {
    const postings = ['B240315000420', 'B240315000421'].map((number) =>
      buildResponse({ number, code: '1', at: '2024-03-16T09:40', by: 'loc-14' })
    );
    const sent = renderBatch(postings, {
      operator: 'CTG01',
      at: '2024-03-16T10:00',
      sequence: '44',
    });
    expect(sent).toContain('BLOCKS: 2');

    const reply = [
      'BATCH: 44',
      '=========',
      'TICKET NUMBER: B240315000420',
      'STATUS: ACCEPTED',
      '=========',
      'TICKET NUMBER: B240315000421',
      'STATUS: ACCEPTED',
    ].join('\n');
    const ack = parseAcknowledgement(reply);
    expect(ack.sequence).toBe('44');
    expect(ack.accepted).toEqual(postings.map((posting) => posting.number));
  });
});

describe('the register', () => {
  it('reads back every column it wrote', () => {
    const tickets = parseTicketBatch(readText(join(examples, 'march-2024.feed'))).tickets;
    const rows = buildRegister(tickets);
    const parsed = parseCsv(writeRegisterCsv(rows));
    expect(parsed).toHaveLength(rows.length);
    expect(parsed[0].ticket).toBe(rows[0].number);
  });
});

describe('well known text', () => {
  it('round trips each geometry it reads', () => {
    const point = { lat: 35.4676, lon: -97.5164 };
    const line = [point, { lat: 35.4676, lon: -97.5144 }];
    const ring = [...line, { lat: 35.4696, lon: -97.5144 }];
    expect(parseWkt(writeWktPoint(point)).geometry).toEqual(point);
    expect(parseWkt(writeWktLine(line)).geometry).toHaveLength(2);
    expect(parseWkt(writeWktPolygon(ring)).geometry).toHaveLength(4);
  });
});

describe('the journal', () => {
  it('round trips an empty journal', () => {
    expect(readJournal(writeJournal(readJournal(emptyJournal())))).toEqual(
      readJournal(emptyJournal())
    );
  });

  it('round trips through json as well as through the builders', () => {
    const journal = {
      ...emptyJournal(),
      tickets: [
        {
          number: 'B240315000420',
          type: 'NORMAL',
          takenAt: '2024-03-15T07:42',
          address: '1420 NW 23RD ST',
        },
      ],
    };
    const once = readJournal(journal);
    const asText = JSON.stringify(writeJournal(once));
    expect(readJournal(JSON.parse(asText))).toEqual(once);
  });
});
