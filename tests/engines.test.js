import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const workflow = readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8');

/**
 * The versions the package says it runs on, and the versions anything actually
 * runs it on, drift apart the moment one of them is edited alone. This checks
 * they still agree: the test matrix, the container base and the engines range
 * are three statements about the same thing.
 */

/** Split a version into numbers, missing parts reading as zero. */
export function partsOf(version) {
  const [major = 0, minor = 0, patch = 0] = String(version).split('.').map(Number);
  return [major, minor, patch];
}

/** Compare two versions the usual way. */
export function compareVersions(left, right) {
  const a = partsOf(left);
  const b = partsOf(right);
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/** True when a version satisfies a range of the `>=x <y` shape we use. */
export function satisfies(version, range) {
  for (const clause of String(range).trim().split(/\s+/)) {
    const match = /^(>=|<=|<|>)(.+)$/.exec(clause);
    if (!match)
      throw new Error(`the engines range uses a clause this check cannot read: ${clause}`);
    const [, operator, bound] = match;
    const compared = compareVersions(version, bound);
    if (operator === '>=' && compared < 0) return false;
    if (operator === '>' && compared <= 0) return false;
    if (operator === '<=' && compared > 0) return false;
    if (operator === '<' && compared >= 0) return false;
  }
  return true;
}

/** The node versions the test matrix runs. */
export function matrixVersions() {
  const match = /node: \[([^\]]+)\]/.exec(workflow);
  if (match === null) throw new Error('the workflow carries no node matrix');
  return match[1].split(',').map((entry) => entry.trim().replace(/^'|'$/g, ''));
}

/** The node version the setup-node steps outside the matrix pin. */
export function pinnedVersions() {
  return [...workflow.matchAll(/node-version: ([0-9.]+)/g)].map((match) => match[1]);
}

describe('the version helpers', () => {
  it('compares versions numerically, not as text', () => {
    expect(compareVersions('20.9.0', '20.11.0')).toBeLessThan(0);
    expect(compareVersions('24.20.0', '9.9.9')).toBeGreaterThan(0);
    expect(compareVersions('20.11', '20.11.0')).toBe(0);
  });

  it('reads the range shapes the package uses', () => {
    expect(satisfies('20.11.0', '>=20.11')).toBe(true);
    expect(satisfies('20.10.0', '>=20.11')).toBe(false);
    expect(satisfies('24.20.0', '>=20.11')).toBe(true);
    expect(satisfies('20.18.2', '>=20.11 <21')).toBe(true);
    expect(satisfies('22.13.1', '>=20.11 <21')).toBe(false);
  });

  it('refuses a clause it cannot read rather than guessing', () => {
    expect(() => satisfies('20.11.0', '^20.11')).toThrow(/cannot read/);
  });
});

describe('the engines range', () => {
  it('is stated at all', () => {
    expect(pkg.engines.node).toBeDefined();
    expect(pkg.engines.node).toBe('>=20.11');
  });

  it('admits the node this suite is running on', () => {
    expect(satisfies(process.versions.node, pkg.engines.node)).toBe(true);
  });
});

describe('the test matrix', () => {
  const versions = matrixVersions();

  it('runs more than one major version', () => {
    const majors = new Set(versions.map((version) => partsOf(version)[0]));
    expect(majors.size).toBeGreaterThan(1);
  });

  it('runs every version the engines range admits a major of', () => {
    for (const version of versions) {
      expect(satisfies(version, pkg.engines.node), version).toBe(true);
    }
  });

  it('covers the floor of the range', () => {
    const lowest = [...versions].sort(compareVersions)[0];
    expect(partsOf(lowest)[0]).toBe(partsOf('20.11')[0]);
  });

  it('covers node 24, which is the base an environment is built on', () => {
    expect(versions.map((version) => partsOf(version)[0])).toContain(24);
  });
});

describe('the versions pinned outside the matrix', () => {
  it('all satisfy the engines range', () => {
    for (const version of pinnedVersions()) {
      expect(satisfies(version, pkg.engines.node), version).toBe(true);
    }
  });

  it('are all the same version, so the jobs agree with each other', () => {
    const outsideMatrix = pinnedVersions().filter((version) => !matrixVersions().includes(version));
    expect(new Set(outsideMatrix).size).toBeLessThanOrEqual(1);
  });
});

describe('the container base', () => {
  const dockerfile = readFileSync(join(root, 'Dockerfile'), 'utf8');

  it('names exactly one base image', () => {
    expect(dockerfile.match(/^FROM /gm)).toHaveLength(1);
  });

  it('pins a node version the engines range admits', () => {
    const match = /^FROM node:([0-9.]+)-/m.exec(dockerfile);
    expect(match).not.toBeNull();
    expect(satisfies(match[1], pkg.engines.node)).toBe(true);
  });

  it('pins the same version the matrix runs', () => {
    const match = /^FROM node:([0-9.]+)-/m.exec(dockerfile);
    expect(matrixVersions()).toContain(match[1]);
  });
});
