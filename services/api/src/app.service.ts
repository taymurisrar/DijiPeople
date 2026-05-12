import { Injectable } from '@nestjs/common';
import { getRuntimeHealthPayload } from './config/env.validation';

@Injectable()
export class AppService {
  getHealth() {
    return getRuntimeHealthPayload(process.env);
  }
}
