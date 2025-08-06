import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { commandSummary } from '../../src/cli/program.js';

const here = dirname(fileURLToPath(import.meta.url));
const readme = readFileSync(join(here, '..', '..', 'README.md'), 'utf8');

describe('commandSummary', () => {
  const summary = commandSummary();

  it('lists every command in name order', () => {
    expect(summary.length).toBeGreaterThan(12);
    expect(summary.map((entry) => entry.name)).toEqual(
      [...summary.map((entry) => entry.name)].sort()
    );
  });

  it('says what each one needs', () => {
    for (const entry of summary) {
      expect(entry.required.length, entry.name).toBeGreaterThan(0);
      expect(entry.description.length, entry.name).toBeGreaterThan(10);
    }
  });

  it('gives nearly every command a configuration', () => {
    const withoutConfig = summary.filter((entry) => !entry.required.includes('--config'));
    expect(withoutConfig.map((entry) => entry.name)).toEqual(['damage']);
  });

  it('offers a format switch on the commands that read a feed', () => {
    const screen = summary.find((entry) => entry.name === 'screen');
    expect(screen.optional).toContain('--format');
  });
});

describe('the readme', () => {
  it('lists every command the program carries', () => {
    for (const entry of commandSummary()) {
      expect(readme, entry.name).toMatch(new RegExp(`^\\| \`${entry.name}\`\\s*\\|`, 'm'));
    }
  });

  it('lists no command the program does not carry', () => {
    const names = new Set(commandSummary().map((entry) => entry.name));
    const listed = [...readme.matchAll(/^\| `([a-z]+)`\s*\|/gm)].map((match) => match[1]);
    expect(listed.length).toBeGreaterThan(12);
    for (const name of listed) {
      expect(names, name).toContain(name);
    }
  });

  it('names the directories the source actually has', () => {
    for (const layer of ['src/core', 'src/time', 'src/geo', 'src/store', 'src/cli']) {
      expect(readme).toContain(layer);
    }
  });
});

describe('what required means', () => {
  it('does not count an option that merely takes a value', () => {
    const screen = commandSummary().find((entry) => entry.name === 'screen');
    expect(screen.required).toEqual(['--config', '--feed']);
    expect(screen.optional).toEqual(['--skip-bad', '--format']);
  });

  it('counts nothing as required on a command with only switches', () => {
    for (const entry of commandSummary()) {
      for (const long of entry.required) {
        expect(entry.optional, entry.name).not.toContain(long);
      }
    }
  });
});
