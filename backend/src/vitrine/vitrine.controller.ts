import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Request,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { VitrineService } from './vitrine.service';

@Controller('vitrine')
export class VitrineController {
  constructor(private readonly vitrineService: VitrineService) {}

  // ─────────────────────────────────────────────────────────────────
  //  ENDPOINT PÚBLICO — sem JWT — consumido pela TV
  //  A TV faz polling a cada 30s usando ETag para evitar tráfego desnecessário
  // ─────────────────────────────────────────────────────────────────

  @Get('public/:tvPublicId')
  async getPublicPlaylist(
    @Param('tvPublicId') tvPublicId: string,
    @Res() res: Response,
  ) {
    const data = await this.vitrineService.getPublicPlaylist(tvPublicId);

    // Se vitrine inativa, sem ETag (muda quando ligar)
    if (!data.active) {
      return res
        .status(HttpStatus.OK)
        .json({ active: false });
    }

    const etag = `"v${(data as any).version}"`;
    const clientEtag = res.req.headers['if-none-match'];

    // Retorna 304 se TV já tem esta versão — zero processamento extra
    if (clientEtag === etag) {
      return res
        .status(HttpStatus.NOT_MODIFIED)
        .setHeader('ETag', etag)
        .setHeader('Cache-Control', 'no-cache')
        .send();
    }

    return res
      .status(HttpStatus.OK)
      .setHeader('ETag', etag)
      .setHeader('Cache-Control', 'no-cache')
      .json(data);
  }

  /** Lista os 10 temas disponíveis (público — usado no frontend e TV) */
  @Get('themes')
  getThemes() {
    return this.vitrineService.getThemes();
  }

  // ─────────────────────────────────────────────────────────────────
  //  ENDPOINTS AUTENTICADOS — Dashboard (admin/manager)
  // ─────────────────────────────────────────────────────────────────

  /** Retorna configuração completa (rascunho + info de publicação) */
  @UseGuards(JwtAuthGuard)
  @Get('config')
  getConfig() {
    return this.vitrineService.getConfig();
  }

  /** Salva rascunho sem publicar na TV */
  @UseGuards(JwtAuthGuard)
  @Patch('draft')
  @HttpCode(HttpStatus.OK)
  saveDraft(@Body() body: any) {
    return this.vitrineService.saveDraft(body);
  }

  /**
   * Publica na TV:
   * - version++
   * - publishedSlides = snapshot(draftSlides)
   * - publishedBy = usuário logado
   */
  @UseGuards(JwtAuthGuard)
  @Post('publish')
  @HttpCode(HttpStatus.OK)
  publish(@Request() req: any) {
    return this.vitrineService.publish({
      userId: req.user.id,
      userName: req.user.name || req.user.email,
    });
  }

  /** Liga ou desliga a vitrine sem republicar */
  @UseGuards(JwtAuthGuard)
  @Patch('active')
  @HttpCode(HttpStatus.OK)
  setActive(@Body() body: { active: boolean }) {
    return this.vitrineService.setActive(body.active);
  }
}
