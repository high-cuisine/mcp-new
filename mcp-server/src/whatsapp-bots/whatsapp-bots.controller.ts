import { Body, Controller, Post } from '@nestjs/common';
import { WhatsappBotsService } from './whatsapp-bots.service';
import { MessageDTO } from '../telegram-bots/dto/messages.dto';
import { HandleMessageResponse } from '../telegram-bots/telegram-bots.service';

@Controller('whatsapp')
export class WhatsappBotsController {
  constructor(private readonly whatsappBotsService: WhatsappBotsService) {}

  @Post('send-message')
  async sendMessage(@Body() dto: MessageDTO): Promise<HandleMessageResponse> {
    return this.whatsappBotsService.handleMessage(dto);
  }

  @Post('auth/qr')
  async receiveQr(@Body() body: { telegramId: string; qrCode: string }) {
    return this.whatsappBotsService.receiveQrCode(body.telegramId, body.qrCode);
  }

  @Post('auth/success')
  async authSuccess(@Body() body: { telegramId: string }) {
    return this.whatsappBotsService.notifyAuthSuccess(body.telegramId);
  }
}
