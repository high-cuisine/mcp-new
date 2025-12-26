import { forwardRef, Module } from '@nestjs/common';
import { TelegramService } from './servises/telegram.service';
import { TelegrafModule } from 'nestjs-telegraf';
import { BotUpdate } from './telegram.update';
import { cfg } from '@common/config/config.service';
import { RedisModule } from '@infra/redis/redis.module';
import { ProccesorModule } from '../proccesor/proccesor.module';
import { ClientModule } from '../client/client.module';
import { CrmModule } from '../crm/crm.module';
import * as LocalSession from 'telegraf-session-local'
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Moderator, ModeratorSchema } from '../telegram-bots/schemas/moderator.schema';

const session = new LocalSession()

@Module({
  imports: [
    TelegrafModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          token: cfg.telegram.token,
          middlewares: [session.middleware()],
        }),
    }),
    MongooseModule.forFeature([{ name: Moderator.name, schema: ModeratorSchema }]),
    RedisModule,
    forwardRef(() => ProccesorModule),
    ClientModule,
    forwardRef(() => CrmModule),
  ],
  providers: [BotUpdate, TelegramService ],
  exports: [TelegramService]
})
export class TelegramModule {}
