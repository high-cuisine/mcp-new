import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { MessageDTO } from './dto/messages.dto';
import { TelegramBotsService, HandleMessageResponse } from './telegram-bots.service';
import { InitAuthDTO, VerifyCodeDTO, VerifyPasswordDTO } from './dto/auth.dto';

@Controller('telegram')
export class TelegramBotsController {
  constructor(private readonly telegramBotsService: TelegramBotsService) {}

  @Post('send-message')
  async sendMessage(@Body() dto: MessageDTO): Promise<HandleMessageResponse> {
    return this.telegramBotsService.handleMessage(dto);
  }

  @Post('auth/init')
  async initAuth(@Body() dto: InitAuthDTO) {
    return this.telegramBotsService.initAuth(dto.apiId, dto.apiHash, dto.phoneNumber);
  }

  @Post('auth/verify-code')
  async verifyCode(@Body() dto: VerifyCodeDTO) {
    return this.telegramBotsService.verifyCode(dto.phoneNumber, dto.code, dto.phoneCodeHash);
  }

  @Post('auth/verify-password')
  async verifyPassword(@Body() dto: VerifyPasswordDTO) {
    return this.telegramBotsService.verifyPassword(dto.phoneNumber, dto.password, dto.phoneCodeHash);
  }

  @Get('auth/status/:phoneNumber')
  async getAuthStatus(@Param('phoneNumber') phoneNumber: string) {
    return this.telegramBotsService.getAuthStatus(phoneNumber);
  }
}
