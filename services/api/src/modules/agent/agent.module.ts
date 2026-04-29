import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AgentController],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
