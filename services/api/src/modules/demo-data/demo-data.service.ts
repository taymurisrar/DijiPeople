import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { runDemoSeed } from '../../../prisma/seed-demo';
import { deleteDemoData, getDemoDataSummary } from './demo-data.operations';

@Injectable()
export class DemoDataService {
  constructor(private readonly prisma: PrismaService) {}

  getSummary() {
    return getDemoDataSummary(this.prisma);
  }

  async delete(user: AuthenticatedUser) {
    this.assertResetEnabled();
    return deleteDemoData(this.prisma, user.platform?.id);
  }

  async reseed(user: AuthenticatedUser) {
    this.assertResetEnabled();
    await deleteDemoData(this.prisma, user.platform?.id);
    await runDemoSeed();
    return this.getSummary();
  }

  private assertResetEnabled() {
    if (process.env.ENABLE_DEMO_DATA_RESET !== 'true') {
      throw new ForbiddenException({
        code: 'DEMO_DATA_RESET_DISABLED',
        message:
          'Demo data reset is disabled. Set ENABLE_DEMO_DATA_RESET=true to enable it.',
      });
    }
  }
}
