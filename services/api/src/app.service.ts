import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      service: 'dijipeople-api',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
