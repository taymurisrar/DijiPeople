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
    // Frames only: the message lines above them are not repeated in the stack.
    expect(stack).toMatch(/^\s+at /);
    expect(stack).not.toContain('insert violates foreign key');
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
  it('keeps the class and a one-line message, and the stack frames', () => {
    const described = describeRejection(new Error('boom'));
    expect(described.message).toBe('Error: boom');
    expect(described.stack).toMatch(/^\s+at /);
  });

  it('never logs SQL or values from the later lines of a multi-line error', () => {
    const prismaLike = Object.assign(
      new Error(
        "Invalid `prisma.x.create()` invocation:\nINSERT INTO t VALUES ('secret-ssn-123')",
      ),
      { code: 'P2003' },
    );
    const described = describeRejection(prismaLike);
    expect(described.message).toContain('P2003');
    expect(described.message).not.toContain('INSERT');
    expect(described.message).not.toContain('secret-ssn-123');
    expect(described.stack ?? '').not.toContain('secret-ssn-123');
  });

  it('redacts a credential in a string rejection', () => {
    const described = describeRejection('failed: Bearer abc.def.ghi');
    expect(described.message).not.toContain('abc.def.ghi');
  });

  it('does not serialise an arbitrary object', () => {
    const described = describeRejection({ password: 'hunter2' });
    expect(described.message).not.toContain('hunter2');
  });
});
