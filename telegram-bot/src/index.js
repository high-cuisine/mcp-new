import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { Api } from 'telegram/tl/index.js';
import { NewMessage } from 'telegram/events/index.js';
import 'dotenv/config';
import express from 'express';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const isRunningInsideContainer = fs.existsSync('/.dockerenv');
const defaultAppURL = isRunningInsideContainer
  ? 'http://host.docker.internal:3508/telegram/send-message'
  : 'http://localhost:8080/telegram/send-message';

const appURL = process.env.MCP_SERVER_URL ?? defaultAppURL;

console.log(`MCP Server URL: ${appURL}`);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let activeClient = null;
let httpServer = null;
let isShuttingDown = false;
const authSessions = new Map(); // phoneNumber -> { client, phoneCodeHash, apiId, apiHash }

async function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise((resolve) => rl.question(question, resolve));
  rl.close();
  return answer.trim();
}

async function promptWithDefault(question, defaultValue) {
  const suffix = defaultValue ? ` [${defaultValue}]` : '';
  const answer = await prompt(`${question}${suffix}: `);
  return answer || defaultValue || '';
}

async function promptRequired(question, defaultValue) {
  while (true) {
    const value = await promptWithDefault(question, defaultValue);
    if (value && value.trim().length > 0) {
      return value.trim();
    }
    console.log('Значение не может быть пустым. Попробуйте снова.');
  }
}

async function promptInteger(question, defaultValue) {
  while (true) {
    const value = await promptWithDefault(question, defaultValue);
    if (!value || value.trim().length === 0) {
      console.log('Значение не может быть пустым. Попробуйте снова.');
      continue;
    }
    const parsed = Number(value);
    if (Number.isInteger(parsed)) {
      return parsed;
    }
    console.log('Введите корректное целое число.');
  }
}

async function ensureSession({ apiId, apiHash, phoneNumber, sessionFilePath }) {
  if (fs.existsSync(sessionFilePath)) {
    const storedSession = fs.readFileSync(sessionFilePath, 'utf8').trim();
    if (storedSession.length > 0) {
      return storedSession;
    }
  }
  // Если сессии нет, она будет создана через REST API
  return null;
}

async function main() {
  ensureHttpServer();

  const defaultSessionPath = process.env.TELEGRAM_SESSION_FILE
    ? path.resolve(process.env.TELEGRAM_SESSION_FILE)
    : path.resolve(__dirname, '../session.txt');

  // Пытаемся загрузить существующую сессию
  if (fs.existsSync(defaultSessionPath)) {
    const storedSession = fs.readFileSync(defaultSessionPath, 'utf8').trim();
    if (storedSession.length > 0) {
      try {
        // Пытаемся определить apiId и apiHash из переменных окружения
        const apiId = parseInt(process.env.TELEGRAM_API_ID);
        const apiHash = process.env.TELEGRAM_API_HASH;

        if (apiId && apiHash) {
          const client = new TelegramClient(new StringSession(storedSession), apiId, apiHash, {
            connectionRetries: 5,
            useWSS: true,
            autoReconnect: true,
          });

          await client.connect();
          activeClient = client;
          registerIncomingMessageForwarder(client);
          console.log('✅ Сессия загружена, клиент подключён и готов принимать входящие сообщения.');
          console.log('📝 Для авторизации нового клиента используйте команду /auth_init в Telegram боте.');
          await waitIndefinitely();
          return;
        }
      } catch (error) {
        console.warn('Не удалось загрузить существующую сессию:', error.message);
      }
    }
  }

  console.log('ℹ️  Сессия не найдена. Для авторизации используйте команду /auth_init в Telegram боте.');
  console.log('📝 HTTP сервер запущен и готов принимать запросы авторизации.');
  await waitIndefinitely();
}

main().catch(async (error) => {
  console.error('Ошибка при выполнении скрипта:', error);
  await gracefulShutdown(1);
});

//const Map = new Map();

app.post('/send-message', async (req, res) => {
  const { message, phone } = req.body;

  try {
    await sendMessage(activeClient, phone, message);
    res.status(200).send('Message sent successfully');
  }
  catch (error) {
    console.error('Error sending message:', error);
    res.status(500).send('Error sending message');
  }
});

app.post('/auth/init', async (req, res) => {
  const { apiId, apiHash: apiHashRaw, api_hash: api_hash_raw, phoneNumber } = req.body;
  const apiHash = typeof apiHashRaw === 'string' ? apiHashRaw : (typeof api_hash_raw === 'string' ? api_hash_raw : String(apiHashRaw || api_hash_raw || '').trim());

  if (!apiId || !apiHash || !phoneNumber) {
    return res.status(400).json({ error: 'Missing required fields: apiId, apiHash, phoneNumber' });
  }

  // Преобразуем apiId в число
  const apiIdNumber = typeof apiId === 'string' ? parseInt(apiId, 10) : Number(apiId);
  
  if (isNaN(apiIdNumber) || apiIdNumber <= 0) {
    return res.status(400).json({ error: 'apiId must be a valid positive number' });
  }

  console.log(`[AUTH INIT] apiId: ${apiIdNumber} (type: ${typeof apiIdNumber}), apiHash: ${apiHash ? 'provided' : 'missing'}, phoneNumber: ${phoneNumber}`);

  let client;
  try {
    const stringSession = new StringSession('');
    client = new TelegramClient(stringSession, apiIdNumber, apiHash, {
      connectionRetries: 5,
    });

    await client.connect();

    // apiId и apiHash уже используются в клиенте, не нужно передавать их в SendCode
    const sentCode = await client.invoke(
      new Api.auth.SendCode({
        phoneNumber,
        settings: new Api.CodeSettings({
          allowFlashcall: true,
          currentNumber: true,
          allowAppHash: true,
        }),
      }),
    );

    if (!(sentCode instanceof Api.auth.SentCode)) {
      await client.disconnect();
      return res.status(500).json({ error: 'Unexpected response from Telegram when requesting the code.' });
    }

    // Сохраняем состояние авторизации
    authSessions.set(phoneNumber, {
      client,
      phoneCodeHash: sentCode.phoneCodeHash,
      apiId: apiIdNumber,
      apiHash,
    });

    res.json({
      phoneCodeHash: sentCode.phoneCodeHash,
      message: `Код отправлен на номер ${phoneNumber}`,
    });
  } catch (error) {
    console.error('Error initializing auth:', error);
    
    let errorMessage = 'Failed to initialize auth';
    if (error.errorMessage === 'API_ID_INVALID') {
      errorMessage = 'API_ID_INVALID: Убедитесь, что вы используете правильный API ID. Получите его на https://my.telegram.org/apps';
    } else if (error.message && error.message.includes('apiHash')) {
      errorMessage = 'apiHash обязателен и должен быть строкой. Проверьте, что передаёте api_hash из https://my.telegram.org/apps';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    try {
      if (typeof client !== 'undefined' && client && client.connected) {
        await client.disconnect();
      }
    } catch (disconnectError) {
      // Игнорируем ошибки отключения
    }
    
    res.status(500).json({ error: errorMessage });
  }
});

app.post('/auth/verify-code', async (req, res) => {
  const { phoneNumber, code, phoneCodeHash } = req.body;

  if (!phoneNumber || !code || !phoneCodeHash) {
    return res.status(400).json({ error: 'Missing required fields: phoneNumber, code, phoneCodeHash' });
  }

  const authSession = authSessions.get(phoneNumber);
  if (!authSession || authSession.phoneCodeHash !== phoneCodeHash) {
    return res.status(400).json({ error: 'Invalid auth session' });
  }

  try {
    await authSession.client.invoke(
      new Api.auth.SignIn({
        phoneNumber,
        phoneCodeHash: authSession.phoneCodeHash,
        phoneCode: code,
      }),
    );

    // Авторизация успешна
    const session = authSession.client.session.save();
    const sessionFilePath = path.resolve(__dirname, '../session.txt');
    fs.writeFileSync(sessionFilePath, session, 'utf8');

    // Подключаем клиент как активный
    await authSession.client.disconnect();
    
    const activeClientInstance = new TelegramClient(new StringSession(session), authSession.apiId, authSession.apiHash, {
      connectionRetries: 5,
      useWSS: true,
      autoReconnect: true,
    });

    await activeClientInstance.connect();
    activeClient = activeClientInstance;
    registerIncomingMessageForwarder(activeClientInstance);

    authSessions.delete(phoneNumber);

    res.json({
      success: true,
      session,
      message: 'Авторизация успешно завершена',
    });
  } catch (error) {
    if (error.errorMessage === 'SESSION_PASSWORD_NEEDED') {
      // Требуется пароль 2FA
      authSession.needsPassword = true;
      res.json({
        success: false,
        needsPassword: true,
        message: 'Требуется пароль двухфакторной аутентификации',
      });
    } else {
      console.error('Error verifying code:', error);
      authSessions.delete(phoneNumber);
      await authSession.client.disconnect();
      res.status(500).json({ error: error.message || 'Failed to verify code' });
    }
  }
});

app.post('/auth/verify-password', async (req, res) => {
  const { phoneNumber, password, phoneCodeHash } = req.body;

  if (!phoneNumber || !password || !phoneCodeHash) {
    return res.status(400).json({ error: 'Missing required fields: phoneNumber, password, phoneCodeHash' });
  }

  const authSession = authSessions.get(phoneNumber);
  if (!authSession || authSession.phoneCodeHash !== phoneCodeHash || !authSession.needsPassword) {
    return res.status(400).json({ error: 'Invalid auth session or password not needed' });
  }

  try {
    await authSession.client.invoke(
      new Api.auth.CheckPassword({
        password: Buffer.from(password),
      }),
    );

    // Авторизация успешна
    const session = authSession.client.session.save();
    const sessionFilePath = path.resolve(__dirname, '../session.txt');
    fs.writeFileSync(sessionFilePath, session, 'utf8');

    // Подключаем клиент как активный
    await authSession.client.disconnect();
    
    const activeClientInstance = new TelegramClient(new StringSession(session), authSession.apiId, authSession.apiHash, {
      connectionRetries: 5,
      useWSS: true,
      autoReconnect: true,
    });

    await activeClientInstance.connect();
    activeClient = activeClientInstance;
    registerIncomingMessageForwarder(activeClientInstance);

    authSessions.delete(phoneNumber);

    res.json({
      success: true,
      session,
      message: 'Авторизация успешно завершена',
    });
  } catch (error) {
    console.error('Error verifying password:', error);
    authSessions.delete(phoneNumber);
    await authSession.client.disconnect();
    res.status(500).json({ error: error.message || 'Failed to verify password' });
  }
});


async function sendMessage(providedClient, phone, message) {
  try {
    const result = await providedClient.invoke(
      new Api.contacts.ImportContacts({
        contacts: [
          new Api.InputPhoneContact({
            clientId: BigInt(Date.now()),
            phone: phone,
            firstName: 'Temp',
            lastName: 'User',
          }),
        ],
      }),
    );

    if (result.users.length === 0) {
      console.warn(`Пользователь с номером ${phone} не найден в Telegram.`);
      return;    
    }

    const user = result.users[0];
    await providedClient.sendMessage(user, { message });
    console.log(`Сообщение отправлено пользователю ${phone}: ${message}`);
  } catch (error) {
    console.error(`Ошибка при обработке номера ${phone}:`, error);
  }
}

function registerIncomingMessageForwarder(client) {
  client.addEventHandler(onIncomingMessage, new NewMessage({}));
}

async function onIncomingMessage(event) {
  const { message } = event;

  if (!message || message.out) {
    return;
  }

  try {
    let sender = null;

    if (typeof message.getSender === 'function') {
      sender = await message.getSender();
    } else if (message?.peerId) {
      try {
        sender = await event.client.getEntity(message.peerId);
      } catch (entityError) {
        console.warn('Не удалось получить информацию об отправителе:', entityError);
      }
    }
    const fallbackId =
      message?.peerId?.userId ?? message?.peerId?.channelId ?? message?.peerId?.chatId ?? null;
    const telegramId = sender?.id != null ? String(sender.id) : fallbackId != null ? String(fallbackId) : null;
    const payload = {
      message: message.message ?? '',
      telegramId,
    };

    console.log(`Отправка запроса на ${appURL} с payload:`, payload);
    const response = await fetch(appURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    let serverReply = null;
    try {
      serverReply = await response.json();
    } catch (parseError) {
      serverReply = null;
    }

    if (serverReply?.messages?.length) {
      for (const replyText of serverReply.messages) {
        if (typeof replyText === 'string' && replyText.trim().length > 0) {
          await event.client.sendMessage(message.peerId, { message: replyText });
        }
      }
    }

    console.log('Переслал входящее сообщение на внешний сервис.', payload);
  } catch (error) {
    console.error(`Не удалось переслать входящее сообщение на ${appURL}:`, error);
  }
}

function ensureHttpServer() {
  if (httpServer) {
    return;
  }

  const port = Number(process.env.PORT ?? 3507);
  httpServer = app.listen(port, () => {
    console.log(`HTTP сервер запущен на порту ${port}`);
  });
}

async function gracefulShutdown(exitCode = 0) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log('Завершение работы приложения...');

  if (httpServer) {
    await new Promise((resolve) => {
      httpServer.close(() => resolve());
    });
    httpServer = null;
    console.log('HTTP сервер остановлен.');
  }

  if (activeClient) {
    try {
      await activeClient.disconnect();
      console.log('Telegram клиент отключён.');
    } catch (error) {
      console.error('Ошибка при отключении Telegram клиента:', error);
    } finally {
      activeClient = null;
    }
  }

  process.exit(exitCode);
}

function waitIndefinitely() {
  return new Promise(() => {});
}

['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach((signal) => {
  process.on(signal, () => {
    gracefulShutdown(0).catch((error) => {
      console.error('Ошибка при завершении работы:', error);
      process.exit(1);
    });
  });
});

process.on('uncaughtException', (error) => {
  console.error('Неперехваченное исключение:', error);
  gracefulShutdown(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Необработанное отклонение промиса:', reason);
  gracefulShutdown(1);
});


