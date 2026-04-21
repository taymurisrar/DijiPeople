import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MailerModule } from '../../common/mailer/mailer.module';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import {
  getAccessTokenSecret,
  getAccessTokenTtl,
} from '../../common/config/auth.config';
import { AuditModule } from '../audit/audit.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { TenantsModule } from '../tenants/tenants.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserInvitationsService } from './user-invitations.service';
import type { StringValue } from 'ms';

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
    UserInvitationsService,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [
    AuthService,
    UserInvitationsService,
    JwtModule,
    JwtAuthGuard,
    PermissionsGuard,
  ],
})
export class AuthModule {}
