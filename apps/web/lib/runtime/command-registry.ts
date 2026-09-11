/*
 * ITEM-0036: this file held a second, CommandDefinition-keyed registry
 * (`commandRegistry`, `registerCommand`, `getCommand`, `listCommands`)
 * alongside the handler-override maps below. That half had zero callers
 * anywhere — commands are declared as spec objects and read directly by the
 * pages that need them, never through a lookup here — and was removed rather
 * than revived; see ADR-0007. The handler-override maps below stay: unlike
 * the deleted half, `getCommandHandler`/`getCommandKeyHandler` are read on
 * every command execution in `command-execution.service.ts`, ahead of the
 * spec's own `executionMode`. Nothing populates them today, so that read
 * always falls through — that is a real, exercised extension point with no
 * current registrant, not orphaned scaffolding.
 */
import type { CommandHandler } from "./command-runtime.types";

const commandHandlerRegistry = new Map<string, CommandHandler>();
const commandKeyHandlerRegistry = new Map<string, CommandHandler>();

export function registerCommandHandler(
  handlerKey: string,
  handler: CommandHandler,
) {
  commandHandlerRegistry.set(handlerKey, handler);
}

export function registerCommandKeyHandler(
  commandKey: string,
  handler: CommandHandler,
) {
  commandKeyHandlerRegistry.set(commandKey, handler);
}

export function getCommandHandler(handlerKey: string) {
  return commandHandlerRegistry.get(handlerKey) ?? null;
}

export function getCommandKeyHandler(commandKey: string) {
  return commandKeyHandlerRegistry.get(commandKey) ?? null;
}

export function clearCommandRegistryForTests() {
  commandHandlerRegistry.clear();
  commandKeyHandlerRegistry.clear();
}
