/**
 * The command line.
 *
 * One program object built per invocation so nothing is held between runs and
 * the tests can drive it with their own streams. The commands themselves live
 * in `commands/`, grouped by what they are for; this is the list of them and
 * the wiring they all share.
 */

import { Command } from 'commander';
import { makeWriters } from './context.js';
import { registerDeskCommands } from './commands/desk.js';
import { registerWorkCommands } from './commands/work.js';
import { registerRecordsCommands } from './commands/records.js';
import { registerFieldCommands } from './commands/field.js';

/**
 * Build the program.
 *
 * @param {object} [options]
 * @param {NodeJS.WritableStream} [options.out]
 * @param {NodeJS.WritableStream} [options.err]
 * @param {Function} [options.exit] called with the exit code
 */
export function buildProgram(options = {}) {
  const writers = makeWriters(options);
  const setExit = options.exit ?? (() => {});
  const program = new Command();

  program
    .name('toneline')
    .description('one call locate ticket handling for underground facility operators')
    .version('1.0.0')
    .configureOutput({
      writeOut: (text) => writers.write(text),
      writeErr: (text) => writers.warn(text.replace(/\n$/, '')),
    })
    .exitOverride();

  const wiring = { writers, setExit };
  registerDeskCommands(program, wiring);
  registerWorkCommands(program, wiring);
  registerRecordsCommands(program, wiring);
  registerFieldCommands(program, wiring);

  return program;
}

/**
 * The commands the program carries, with what each one needs.
 *
 * The help text is commander's business; this is for anything that needs the
 * list as data, which is the readme check and any future shell completion.
 */
export function commandSummary() {
  return buildProgram()
    .commands.map((command) => ({
      name: command.name(),
      description: command.description(),
      // `option.required` means the option takes a value, not that the option
      // itself has to be given. `mandatory` is the one that means required.
      required: command.options.filter((option) => option.mandatory).map((option) => option.long),
      optional: command.options.filter((option) => !option.mandatory).map((option) => option.long),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * Run the program against an argument list.
 *
 * @returns {Promise<number>} the exit code
 */
export async function run(argv, options = {}) {
  let code = 0;
  const program = buildProgram({
    ...options,
    exit: (value) => {
      code = value;
    },
  });
  try {
    await program.parseAsync(argv, { from: 'user' });
  } catch (err) {
    if (err.code === 'commander.helpDisplayed' || err.code === 'commander.version') return 0;
    if (err.exitCode !== undefined) return err.exitCode;
    throw err;
  }
  return code;
}
