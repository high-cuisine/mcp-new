import { Markup } from 'telegraf';
import { SceneContext } from 'telegraf/typings/scenes';
import { TelegramService } from '../servises/telegram.service';

let telegramBotServiceInstance: TelegramService | null = null;
export function setTelegramBotServiceInstance(instance: TelegramService) {
  telegramBotServiceInstance = instance;
}

export const addCancelButton = async (ctx: SceneContext) => {
  await ctx.reply('Для выхода из текущего режима нажмите кнопку "Отмена" или "Главное меню"', {
    reply_markup: {
      keyboard: [
        [{ text: 'Отмена' }, { text: 'Главное меню' }]
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
    },
  });
};

export const handleCancelButton = async (ctx: SceneContext, text: string) => {
  if (text === 'Отмена') {
    await ctx.reply('Выход из текущего режима', {
      reply_markup: {
        remove_keyboard: true,
        inline_keyboard: [
          [{ text: 'В меню', callback_data: 'start' }]
        ]
      },
    });

    await ctx.scene.leave();
    
    return true;
  }
  
  if (text === 'Главное меню') {
    await ctx.reply('Переход в главное меню', {
      reply_markup: {
        remove_keyboard: true,
      },
    });

    await ctx.scene.leave();
    
   
    if (telegramBotServiceInstance) {
      //await telegramBotServiceInstance.sendStartMessage(ctx);
      await ctx.reply('/start');
    } else {
      await ctx.reply('/start');
    }
    
    return true;
  }
  
  return false;
}; 