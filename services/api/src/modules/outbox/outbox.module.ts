import { Global, Module } from '@nestjs/common';
import { OutboxDispatcherService } from './outbox-dispatcher.service';
import { OutboxService } from './outbox.service';
import { OutboxWorkerService } from './outbox-worker.service';
import { OUTBOX_HANDLERS } from './outbox.types';

/**
 * Global, like PlatformEventsModule, because any domain service may need to
 * announce a transition and threading an import of this module through every
 * feature module would make emitting an event a structural decision instead of
 * a local one.
 *
 * The handler array is provided empty here and contributed to by the modules
 * that own each consumer. Keeping the default in this module means the
 * dispatcher has a valid registry even in a container where no domain module
 * that consumes events was loaded — a CLI seed, for instance.
 */
@Global()
@Module({
  providers: [
    OutboxService,
    OutboxDispatcherService,
    OutboxWorkerService,
    { provide: OUTBOX_HANDLERS, useValue: [] },
  ],
  exports: [OutboxService, OutboxDispatcherService, OutboxWorkerService],
})
export class OutboxModule {}
