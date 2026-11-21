import { EventEmitter } from 'events';

import {
  describeRejection,
  installUnhandledRejectionHandler,
} from './unhandled-rejection';

function fakeProcess() {
  const emitter = new EventEmitter();
  return {
    emitter,
    target: {
      on: (event: 'unhandledRejection', listener: (reason: unknown) => void) =>
        emitter.on(event, listener),
      listenerCount: (event: 'unhandledRejection') =>
        emitter.listenerCount(event),
    },
  };
}

describe('installUnhandledRejectionHandler', () => {
  it('logs the rejection with its stack and does not throw', () => {
    const { emitter, target } = fakeProcess();
    const logger = { error: jest.fn() };
    expect(installUnhandledRejectionHandler(logger, target)).toBe(true);

    const error = new Error('insert violates foreign key');
    expect(() => emitter.emit('unhandledRejection', error)).not.toThrow();

    expect(logger.error).toHaveBeenCalledTimes(1);
    const [message, stack] = logger.error.mock.calls[0] as [string, string];
    expect(message).toContain('process kept alive');
    expect(message).toContain('insert violates foreign key');
    expect(stack).toContain('Error: insert violates foreign key');
  });

  it('copes with a non-Error reason, including one that cannot be serialised', () => {
    const { emitter, target } = fakeProcess();
    const logger = { error: jest.fn() };
    installUnhandledRejectionHandler(logger, target);

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => {
      emitter.emit('unhandledRejection', 'plain string');
      emitter.emit('unhandledRejection', { code: 42 });
      emitter.emit('unhandledRejection', circular);
      emitter.emit('unhandledRejection', undefined);
    }).not.toThrow();
    expect(logger.error).toHaveBeenCalledTimes(4);
  });

  it('is idempotent and does not stack a second listener', () => {
    const { emitter, target } = fakeProcess();
    const logger = { error: jest.fn() };
    expect(installUnhandledRejectionHandler(logger, target)).toBe(true);
    expect(installUnhandledRejectionHandler(logger, target)).toBe(false);
    expect(emitter.listenerCount('unhandledRejection')).toBe(1);
  });

  it('leaves alone a process that already has its own handler', () => {
    const { emitter, target } = fakeProcess();
    emitter.on('unhandledRejection', () => undefined);
    expect(installUnhandledRejectionHandler({ error: jest.fn() }, target)).toBe(
      false,
    );
  });
});

describe('describeRejection', () => {
  it('keeps an Error message and stack', () => {
    const described = describeRejection(new Error('boom'));
    expect(described.message).toBe('boom');
    expect(described.stack).toContain('boom');
  });
});
