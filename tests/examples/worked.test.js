import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readConfigWithFacilities, readText } from '../../src/io/files.js';
import { readFacilityCsv } from '../../src/io/facilities.js';
import { loadDesk, screeningContext } from '../../src/config/load.js';
import { parseTicketBatch } from '../../src/ticket/parse.js';
import { screenTicket } from '../../src/screening/screen.js';
import { recommendResponse } from '../../src/response/decide.js';
import { validateConfig } from '../../src/config/schema.js';

const here = dirname(fileURLToPath(import.meta.url));
const examples = join(here, '..', '..', 'examples');
const configPath = join(examples, 'cross-timbers.json');

function desk() {
  const { config, facilities } = readConfigWithFacilities(configPath, {
    readFacilities: readFacilityCsv,
  });
  return loadDesk(config, { facilities });
}

function tickets() {
  return parseTicketBatch(readText(join(examples, 'march-2024.feed'))).tickets;
}

describe('the worked configuration', () => {
  it('validates with no errors and no warnings', () => {
    const { config } = readConfigWithFacilities(configPath, { readFacilities: readFacilityCsv });
    expect(validateConfig(config)).toEqual({ errors: [], warnings: [] });
  });

  it('loads two districts and ten runs of plant', () => {
    const loaded = desk();
    expect(loaded.districts.map((district) => district.code)).toEqual(['CENTRAL', 'NORTH']);
    expect(loaded.network.size).toBe(10);
  });

  it('carries the operator working hours', () => {
    expect(desk().schedule.windowOn('2024-03-15')).toEqual({ open: 390, close: 930 });
    expect(desk().calendar.isBusinessDay('2024-07-04')).toBe(false);
  });
});

describe('the worked feed', () => {
  it('reads four tickets', () => {
    expect(tickets().map((ticket) => ticket.number)).toEqual([
      'B240313000418',
      'B240314000502',
      'B240315000601',
      'B240318000703',
    ]);
  });

  it('reads the continued extent and the depth in inches', () => {
    const [first, , , fence] = tickets();
    expect(first.extent).toMatch(/DRIVEWAY EAST 120 FEET$/);
    expect(fence.depthFeet).toBeCloseTo(2.5, 6);
  });

  it('reads the members and the grids', () => {
    const [first] = tickets();
    expect(first.members).toEqual(['CTG01', 'CTG02', 'OKELEC']);
    expect(first.site.points).toHaveLength(2);
  });
});

describe('screening the worked feed', () => {
  it('finds the gas main under the sewer repair', () => {
    const loaded = desk();
    const result = screenTicket(tickets()[0], screeningContext(loaded));
    expect(result.ours).toBe(true);
    expect(result.districts).toEqual(['CENTRAL']);
    expect(result.hits.map((hit) => hit.facilityId)).toContain('GM-4412');
    expect(result.conflict).toBe(true);
  });

  it('asks for a meet on the transmission feed', () => {
    const loaded = desk();
    const emergency = tickets()[1];
    const result = screenTicket(emergency, screeningContext(loaded));
    expect(result.critical).toBe(true);
    expect(recommendResponse(emergency, result).code).toBe('7');
  });

  it('does not mark for the design request', () => {
    const loaded = desk();
    const design = tickets()[2];
    const result = screenTicket(design, screeningContext(loaded));
    expect(recommendResponse(design, result).code).toBe('4');
  });

  it('sends the yukon ticket back as not ours', () => {
    const loaded = desk();
    const away = tickets()[3];
    const result = screenTicket(away, screeningContext(loaded));
    expect(result.ours).toBe(false);
    expect(recommendResponse(away, result).code).toBe('9');
  });

  it('reports the abandoned water line without calling it a conflict', () => {
    const loaded = desk();
    const result = screenTicket(tickets()[0], screeningContext(loaded));
    const abandoned = result.hits.find((hit) => hit.facilityId === 'WT-1902');
    expect(abandoned.abandoned).toBe(true);
  });
});
