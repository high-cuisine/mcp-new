import { Module } from '@nestjs/common';
import { WhatsappBotsService } from './whatsapp-bots.service';
import { WhatsappBotsController } from './whatsapp-bots.controller';
import { TelegramBotsModule } from '../telegram-bots/telegram-bots.module';
import { RedisModule } from '@infra/redis/redis.module';

@Module({
  imports: [TelegramBotsModule, RedisModule],
  providers: [WhatsappBotsService],
  controllers: [WhatsappBotsController],
  exports: [WhatsappBotsService],
})
export class WhatsappBotsModule {}
