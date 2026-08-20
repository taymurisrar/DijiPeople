import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { PublicRateLimitGuard } from '../../common/guards/public-rate-limit.guard';
import { LegalService } from './legal.service';

/**
 * The public read surface for legal documents.
 *
 * Everything here is a published version or a 404. There is deliberately no
 * "preview a draft" parameter: a draft that can be reached by guessing a URL is
 * a published document with extra steps, and the whole immutability guarantee
 * rests on published text being the only text anyone outside Admin can see.
 */
@Controller('public/legal')
export class PublicLegalController {
  constructor(private readonly legalService: LegalService) {}

  /**
   * Index of what is actually published, for footer links.
   *
   * The landing footer renders from this rather than from a hardcoded list, so
   * a market with no published terms shows no link to them instead of linking
   * to a page that has to apologise for itself.
   */
  @Public()
  @UseGuards(PublicRateLimitGuard)
  @Get()
  @Header('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600')
  async list() {
    return { documents: await this.legalService.listPublished(null) };
  }

  @Public()
  @UseGuards(PublicRateLimitGuard)
  @Get(':slug')
  @Header('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600')
  async getBySlug(@Param('slug') slug: string) {
    const resolved = await this.legalService.resolvePublishedBySlug(slug);

    if (!resolved) {
      throw new NotFoundException({
        code: 'LEGAL_DOCUMENT_NOT_PUBLISHED',
        message: 'No published version of that document exists.',
      });
    }

    return resolved;
  }
}
