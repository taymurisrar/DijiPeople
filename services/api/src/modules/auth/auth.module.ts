import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { StringValue } from 'ms';

import {
  getAccessTokenSecret,
  getAccessTokenTtl,
} from '../../common/config/auth.config';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { MailerModule } from '../../common/mailer/mailer.module';
import { AuditModule } from '../audit/audit.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { TenantsModule } from '../tenants/tenants.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthAccessService } from './auth-access.service';
import { AuthService } from './auth.service';
import { UserInvitationsService } from './user-invitations.service';

@Global()
@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: getAccessTokenSecret(configService),
        signOptions: {
          expiresIn: getAccessTokenTtl(configService) as StringValue,
        },
      }),
    }),
    TenantsModule,
    UsersModule,
    PermissionsModule,
    MailerModule,
    AuditModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthAccessService,
    UserInvitationsService,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [
    AuthService,
    AuthAccessService,
    UserInvitationsService,

    JwtModule,
    ConfigModule,
    PermissionsModule,

    JwtAuthGuard,
    PermissionsGuard,
  ],
})
export class AuthModule {}
