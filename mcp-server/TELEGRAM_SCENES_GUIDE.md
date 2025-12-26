# Гайд по настройке сцен Telegram в NestJS

## 1. Установка зависимостей

```bash
npm install nestjs-telegraf telegraf telegraf-session-local
npm install --save-dev @types/node
```

## 2. Настройка модуля Telegram

### 2.1. Создание TelegramModule

```typescript
import { Module } from '@nestjs/common';
import { TelegrafModule } from 'nestjs-telegraf';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as LocalSession from 'telegraf-session-local';

// Импортируем сцены
import { CreateAppointmentScene } from './scenes/createAppointment';
import { CancelAppointmentScene } from './scenes/cancelAppointment';

// Создаем экземпляр сессии
const session = new LocalSession();

@Module({
  imports: [
    TelegrafModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        token: configService.get<string>('TELEGRAM_BOT_TOKEN'),
        middlewares: [session.middleware()], // Важно: добавляем middleware для сессий
      }),
    }),
    // ... другие модули
  ],
  providers: [
    BotUpdate, // Основной обработчик
    CreateAppointmentScene, // Регистрируем сцены как провайдеры
    CancelAppointmentScene,
    // ... другие сцены
  ],
  exports: [TelegramService],
})
export class TelegramModule {}
```

### 2.2. Важные моменты:

- **Middleware сессии**: `session.middleware()` обязательно должен быть в массиве `middlewares`
- **Регистрация сцен**: Все сцены должны быть добавлены в `providers` модуля
- **Токен бота**: Получайте из переменных окружения через `ConfigService`

## 3. Создание сцены

### 3.1. Структура сцены

```typescript
import { Injectable } from '@nestjs/common';
import { Ctx, Scene, SceneEnter, On, Command } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { SceneContext } from 'telegraf/typings/scenes';

// Определяем интерфейс сессии для сцены
interface MySceneSession {
  step: 'step1' | 'step2' | 'step3';
  data?: string;
}

@Injectable()
@Scene('my_scene_name') // Уникальное имя сцены
export class MyScene {
  constructor(
    // ... сервисы
  ) {}

  // Обработчик входа в сцену
  @SceneEnter()
  async onSceneEnter(@Ctx() ctx: SceneContext) {
    // Инициализация сессии
    if (!ctx.session) {
      ctx.session = {};
    }
    
    if (!ctx.session['myScene']) {
      ctx.session['myScene'] = {} as MySceneSession;
    }
    
    const session = ctx.session['myScene'] as MySceneSession;
    session.step = 'step1';
    
    await ctx.replyWithHTML('Добро пожаловать в сцену!');
  }

  // Обработчик текстовых сообщений
  @On('text')
  async onText(@Ctx() ctx: SceneContext) {
    const session = ctx.session['myScene'] as MySceneSession;
    const text = (ctx.message as any).text;
    
    switch (session.step) {
      case 'step1':
        session.data = text;
        session.step = 'step2';
        await ctx.reply('Следующий шаг');
        break;
      // ...
    }
  }

  // Обработчик callback_query
  @On('callback_query')
  async onCallbackQuery(@Ctx() ctx: SceneContext) {
    const callbackData = (ctx.callbackQuery as any).data;
    
    if (callbackData === 'cancel') {
      await ctx.scene.leave(); // Выход из сцены
      return;
    }
    
    // Обработка других callback
  }

  // Выход из сцены
  @Command('exit')
  async onExit(@Ctx() ctx: SceneContext) {
    await ctx.reply('Выход из сцены');
    await ctx.scene.leave();
  }
}
```

### 3.2. Ключевые декораторы:

- `@Scene('name')` - определяет сцену
- `@SceneEnter()` - вызывается при входе в сцену
- `@On('text')` - обработка текстовых сообщений
- `@On('callback_query')` - обработка нажатий на кнопки
- `@Command('exit')` - обработка команд

## 4. Вход в сцену из основного обработчика

```typescript
import { Ctx, Update, Action } from 'nestjs-telegraf';
import { SceneContext } from 'telegraf/typings/scenes';

@Update()
export class BotUpdate {
  @Action('create_appointment')
  async createAppointment(@Ctx() ctx: SceneContext) {
    // Инициализация сессии
    if (!ctx.session) {
      ctx.session = {};
    }
    ctx.session['createAppointment'] = {
      step: 'pet_name'
    };
    
    // Вход в сцену
    return ctx.scene.enter('create_appointment');
  }
}
```

## 5. Работа с сессией

### 5.1. Инициализация сессии

```typescript
if (!ctx.session) {
  ctx.session = {};
}

if (!ctx.session['sceneName']) {
  ctx.session['sceneName'] = {} as SceneSession;
}

const session = ctx.session['sceneName'] as SceneSession;
```

### 5.2. Сохранение данных в сессии

```typescript
session.step = 'next_step';
session.data = 'some value';
```

## 6. Переменные окружения

Добавьте в `.env`:

```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
```

## 7. Пример полной структуры

```
src/
  telegram/
    telegram.module.ts       # Модуль с настройкой TelegrafModule
    telegram.update.ts       # Основной обработчик (BotUpdate)
    scenes/
      createAppointment.ts  # Сцена создания записи
      cancelAppointment.ts  # Сцена отмены записи
    helpers/
      scene.helper.ts       # Вспомогательные функции
    servises/
      telegram.service.ts   # Сервис для работы с Telegram
```

## 8. Важные замечания

1. **Сессии**: Используйте `telegraf-session-local` для локального хранения сессий или настройте Redis для production
2. **Регистрация сцен**: Все сцены должны быть в `providers` модуля
3. **Имя сцены**: Должно быть уникальным и соответствовать значению в `@Scene('name')` и `ctx.scene.enter('name')`
4. **Выход из сцены**: Используйте `ctx.scene.leave()` для выхода
5. **Проверка активной сцены**: В основном обработчике проверяйте `ctx.scene.current` перед обработкой сообщений

## 9. Пример проверки активной сцены

```typescript
@On('message')
async onMessage(@Ctx() ctx: SceneContext) {
  // Если пользователь находится в сцене, не обрабатываем здесь
  if ((ctx.scene as any)?.current) {
    return;
  }
  
  // Обычная обработка сообщений
  await this.telegramService.sendMessage(ctx);
}
```

