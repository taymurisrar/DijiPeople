import { Global, Module } from '@nestjs/common';
import { RequestContextService } from './request-context.service';
import { TraceContextService } from './trace-context.service';

@Global()
@Module({
  providers: [RequestContextService, TraceContextService],
  exports: [RequestContextService, TraceContextService],
})
export class RequestContextModule {}
