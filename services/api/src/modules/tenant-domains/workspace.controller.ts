import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { resolveRequestHostname } from './request-hostname';
import { WorkspaceResolutionService } from './workspace-resolution.service';

/**
 * Workspace routing for the tenant web app.
 *
 * Two endpoints, deliberately separated by what they are allowed to know:
 * `/resolve` is public and answers "what is at this hostname?" with only what a
 * login screen must display; `/mine` is authenticated and answers "where should
 * this person go?".
 */
@Controller('workspaces')
export class WorkspaceController {
  constructor(private readonly workspaces: WorkspaceResolutionService) {}

  /**
   * Resolve a hostname.
   *
   * The hostname may be supplied explicitly — the web app's middleware knows the
   * host the browser used, and this API sits behind it — but it is never taken
   * from a client-controlled tenant id. The worst a caller can do by lying about
   * the host is ask about a workspace they could have asked about anyway; the
   * answer contains no tenant data.
   */
  @Public()
  @Get('resolve')
  resolve(@Req() request: Request, @Query('host') host?: string) {
    return this.workspaces.resolveRoute(
      host ?? resolveRequestHostname(request) ?? '',
    );
  }

  /** The workspaces the signed-in user can open, for global discovery. */
  @UseGuards(JwtAuthGuard)
  @Get('mine')
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.workspaces.listWorkspacesForUser(user);
  }

  /**
   * Whether the signed-in user may be served on a hostname.
   *
   * The tenant web app calls this after authentication so a session issued for
   * one workspace cannot render another. The decision is made here, server-side,
   * from the session's own tenant — never from anything the browser sends.
   */
  @UseGuards(JwtAuthGuard)
  @Get('access-check')
  async accessCheck(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Query('host') host?: string,
  ) {
    const hostname = host ?? resolveRequestHostname(request) ?? '';
    const result = await this.workspaces.assertUserMayUseHostname(
      user,
      hostname,
    );

    if (result.allowed) {
      return {
        allowed: true,
        outcome: result.route.outcome,
        workspace: result.route.workspace,
      };
    }

    /*
     * On a wrong-workspace denial the user is told where they *do* belong, but
     * nothing about the workspace they landed on beyond its display name — which
     * its own login page shows anyway.
     */
    const own =
      result.reason === 'WRONG_WORKSPACE'
        ? await this.workspaces.listWorkspacesForUser(user)
        : { defaultWorkspace: null };

    return {
      allowed: false,
      reason: result.reason,
      outcome: result.route.outcome,
      message: result.route.message,
      ownWorkspace: own.defaultWorkspace,
    };
  }
}
