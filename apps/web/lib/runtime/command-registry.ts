import type {
  CommandDefinition,
  CommandHandler,
} from "./command-runtime.types";

const commandRegistry = new Map<string, CommandDefinition>();
const commandHandlerRegistry = new Map<string, CommandHandler>();
const commandKeyHandlerRegistry = new Map<string, CommandHandler>();

export function registerCommand(command: CommandDefinition) {
  commandRegistry.set(command.key, command);
}

export function getCommand(commandKey: string) {
  return commandRegistry.get(commandKey) ?? null;
}

export function listCommands() {
  return Array.from(commandRegistry.values());
}

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
  commandRegistry.clear();
  commandHandlerRegistry.clear();
  commandKeyHandlerRegistry.clear();
}

// Future phases should register system commands such as soft delete, restore,
// purge, publish, import, export, and owner/status transitions here.
