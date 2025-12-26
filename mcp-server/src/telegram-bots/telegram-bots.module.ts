import { forwardRef, Module } from '@nestjs/common';
import { TelegramBotsService } from './telegram-bots.service';
import { TelegramBotsController } from './telegram-bots.controller';
import { TelegramBotsUpdate } from './telegram-bots.update';
import { RedisModule } from '@infra/redis/redis.module';
import { ProccesorModule } from 'src/proccesor/proccesor.module';
import { CrmModule } from 'src/crm/crm.module';
import { TelegrafModule } from 'nestjs-telegraf';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { cfg } from '@common/config/config.service';
import * as LocalSession from 'telegraf-session-local';
import { MongooseModule as Mongoose } from '@nestjs/mongoose';
import { Moderator, ModeratorSchema } from './schemas/moderator.schema';

const session = new LocalSession();

@Module({
  imports: [
    TelegrafModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: () => ({
        token: cfg.telegram.token,
        middlewares: [session.middleware()],
      }),
    }),
    RedisModule,
    Mongoose.forFeature([{ name: Moderator.name, schema: ModeratorSchema }]),
    forwardRef(() => ProccesorModule),
    forwardRef(() => CrmModule),
  ],
  providers: [TelegramBotsService, TelegramBotsUpdate],
  controllers: [TelegramBotsController],
  exports: [TelegramBotsService],
})
export class TelegramBotsModule {}
