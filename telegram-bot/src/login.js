/**
 * Скрипт только для логина и создания сессии.
 *
 * Запуск: npm run login   (или node src/login.js)
 *
 * Можно задать в .env (или ввести вручную при запросе):
 *   TELEGRAM_API_ID=...
 *   TELEGRAM_API_HASH=...
 *   TELEGRAM_PHONE=+79001234567  (или TELEGRAM_PHONE_NUMBER)
 *
 * Скрипт запросит код из Telegram и при 2FA — пароль, затем сохранит сессию
 * в session.txt (или в файл из TELEGRAM_SESSION_FILE). После этого основной
 * бот (npm start) подхватит сессию автоматически.
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { Api } from 'telegram/tl/index.js';
import { computeCheck } from 'telegram/Password.js';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Загружаем .env из корня проекта (telegram-bot/)
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve((answer || '').trim());
    });
  });
}

function getSessionPath() {
  return process.env.TELEGRAM_SESSION_FILE
    ? path.resolve(process.env.TELEGRAM_SESSION_FILE)
    : path.resolve(__dirname, '../session.txt');
}

async function main() {
  console.log('=== Логин в Telegram и создание сессии ===\n');

  const apiIdStr = (process.env.TELEGRAM_API_ID || (await prompt('API ID (из https://my.telegram.org/apps): '))).trim();
  const apiHashRaw = process.env.TELEGRAM_API_HASH || (await prompt('API Hash (из https://my.telegram.org/apps): '));
  const apiHash = typeof apiHashRaw === 'string' ? apiHashRaw.trim() : String(apiHashRaw || '').trim();
  const phoneNumber = (process.env.TELEGRAM_PHONE || process.env.TELEGRAM_PHONE_NUMBER || (await prompt('Номер телефона (с кодом страны, например +79001234567): '))).trim();

  const apiId = parseInt(apiIdStr, 10);
  if (!apiIdStr || isNaN(apiId) || apiId <= 0) {
    console.error('Ошибка: нужен корректный API ID (число из https://my.telegram.org/apps).');
    process.exit(1);
  }
  if (!apiHash) {
    console.error('Ошибка: API Hash не задан. Укажите TELEGRAM_API_HASH в .env или введите при запросе.');
    process.exit(1);
  }
  if (!phoneNumber) {
    console.error('Ошибка: нужен номер телефона (TELEGRAM_PHONE или TELEGRAM_PHONE_NUMBER в .env).');
    process.exit(1);
  }

  const stringSession = new StringSession('');
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  try {
    await client.connect();
    console.log('Подключение к Telegram...');

    const sentCode = await client.invoke(
      new Api.auth.SendCode({
        phoneNumber,
        apiId,
        apiHash,
        settings: new Api.CodeSettings({
          allowFlashcall: true,
          currentNumber: true,
          allowAppHash: true,
        }),
      }),
    );

    if (!(sentCode instanceof Api.auth.SentCode)) {
      console.error('Неожиданный ответ от Telegram при запросе кода.');
      process.exit(1);
    }

    console.log(`Код отправлен на ${phoneNumber}. Проверьте Telegram.`);
    const code = await prompt('Введите код из Telegram: ');
    if (!code) {
      console.error('Код не введён.');
      process.exit(1);
    }

    try {
      await client.invoke(
        new Api.auth.SignIn({
          phoneNumber,
          phoneCodeHash: sentCode.phoneCodeHash,
          phoneCode: code,
        }),
      );
    } catch (signInError) {
      if (signInError.errorMessage === 'SESSION_PASSWORD_NEEDED') {
        const password = await prompt('Включена 2FA. Введите пароль: ');
        if (!password) {
          console.error('Пароль не введён.');
          process.exit(1);
        }
        const pwd = await client.invoke(new Api.account.GetPassword());
        const check = await computeCheck(pwd, password);
        await client.invoke(new Api.auth.CheckPassword({ password: check }));
      } else {
        throw signInError;
      }
    }

    const session = client.session.save();
    const sessionPath = getSessionPath();
    fs.writeFileSync(sessionPath, session, 'utf8');

    await client.disconnect();
    console.log(`\nСессия сохранена в ${sessionPath}`);
    console.log('Можно запускать основной бот: npm start');
    process.exit(0);
  } catch (error) {
    console.error('Ошибка:', error.message || error);
    if (error.errorMessage) {
      console.error('Telegram:', error.errorMessage);
    }
    try {
      await client.disconnect();
    } catch (_) {}
    process.exit(1);
  }
}

main();
