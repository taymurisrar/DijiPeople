import { Global, Module } from '@nestjs/common';
import { PlatformEventsController } from './platform-events.controller';
import { PlatformEventsService } from './platform-events.service';

@Global()
@Module({
  controllers: [PlatformEventsController],
  providers: [PlatformEventsService],
  exports: [PlatformEventsService],
})
export class PlatformEventsModule {}
