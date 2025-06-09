import { describe, expect, it } from 'vitest';
import { Command } from 'commander';
import { registerDeskCommands } from '../../src/cli/commands/desk.js';
import { registerWorkCommands } from '../../src/cli/commands/work.js';
import { registerRecordsCommands } from '../../src/cli/commands/records.js';
import { registerFieldCommands } from '../../src/cli/commands/field.js';
import { buildProgram } from '../../src/cli/program.js';

function wiring() {
  return { writers: { write: () => {}, line: () => {}, warn: () => {} }, setExit: () => {} };
}

function namesFrom(register) {
  const program = new Command();
  register(program, wiring());
  return program.commands.map((command) => command.name());
}

describe('the command groups', () => {
  it('registers the desk commands', () => {
    expect(namesFrom(registerDeskCommands)).toEqual(['validate', 'screen', 'respond', 'find']);
  });

  it('registers the work commands', () => {
    expect(namesFrom(registerWorkCommands)).toEqual(['age', 'queue', 'brief', 'book', 'capacity']);
  });

  it('registers the record commands', () => {
    expect(namesFrom(registerRecordsCommands)).toEqual(['register', 'invoice', 'month']);
  });

  it('registers the field commands', () => {
    expect(namesFrom(registerFieldCommands)).toEqual(['damage', 'coverage', 'map']);
  });
});

describe('the whole program', () => {
  const program = buildProgram();

  it('carries every command from every group', () => {
    expect(program.commands.map((command) => command.name()).sort()).toEqual([
      'age',
      'book',
      'brief',
      'capacity',
      'coverage',
      'damage',
      'find',
      'invoice',
      'map',
      'month',
      'queue',
      'register',
      'respond',
      'screen',
      'validate',
    ]);
  });

  it('registers each command once', () => {
    const names = program.commands.map((command) => command.name());
    expect(new Set(names).size).toBe(names.length);
  });

  it('gives every command a description', () => {
    for (const command of program.commands) {
      expect(command.description().length).toBeGreaterThan(10);
    }
  });

  it('makes a fresh program each time', () => {
    expect(buildProgram()).not.toBe(program);
  });

  it('names itself and carries a version', () => {
    expect(program.name()).toBe('toneline');
    expect(program.description()).toContain('one call locate ticket');
  });
});
