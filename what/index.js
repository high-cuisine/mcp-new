const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const isRunningInsideContainer = fs.existsSync('/.dockerenv');
const defaultAppURL = isRunningInsideContainer
  ? 'http://mcp:8080/whatsapp/send-message'
  : 'http://localhost:8080/whatsapp/send-message';

const appURL = process.env.MCP_SERVER_URL ?? defaultAppURL;
const mcpServerBaseUrl = process.env.MCP_SERVER_URL 
  ? process.env.MCP_SERVER_URL.replace('/whatsapp/send-message', '')
  : (isRunningInsideContainer ? 'http://mcp:8080' : 'http://localhost:8080');

console.log(`MCP Server URL: ${appURL}`);
console.log(`MCP Server Base URL: ${mcpServerBaseUrl}`);

let activeClient = null;
let httpServer = null;
let isShuttingDown = false;
let currentAuthTelegramId = null;

/**
 * Сохраняем сессию в ./data, которая примонтирована как volume.
 * Это гарантирует, что после перезапуска контейнера QR повторно сканировать не придётся.
 */
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: './data',
    clientId: 'default',
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=TranslateUI',
      '--disable-ipc-flooding-protection',
      '--disable-extensions',
      '--disable-plugins',
      '--disable-default-apps',
      '--disable-web-security',
      '--user-data-dir=/tmp/chrome-user-data-' + Date.now(),
      '--profile-directory=Default',
      '--single-process',
      '--disable-background-networking',
      '--disable-background-sync',
      '--disable-client-side-phishing-detection',
      '--disable-component-extensions-with-background-pages',
      '--disable-default-apps',
      '--disable-hang-monitor',
      '--disable-prompt-on-repost',
      '--disable-sync',
      '--disable-translate',
      '--metrics-recording-only',
      '--no-default-browser-check',
      '--safebrowsing-disable-auto-update',
      '--enable-automation',
      '--password-store=basic',
      '--use-mock-keychain',
    ],
  },
});

client.on('qr', async (qr) => {
  qrcode.generate(qr, { small: true });
  console.log('QR-код сгенерирован. Откройте WhatsApp → Связанные устройства → Сканировать QR.');
  
  // Отправляем QR код в mcp-server если есть активная авторизация
  if (currentAuthTelegramId) {
    try {
      await fetch(`${mcpServerBaseUrl}/whatsapp/auth/qr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramId: currentAuthTelegramId,
          qrCode: qr,
        }),
      });
      
      console.log(`QR код отправлен в mcp-server для telegramId: ${currentAuthTelegramId}`);
    } catch (error) {
      console.error('Ошибка при отправке QR кода в mcp-server:', error);
    }
  }
});

client.on('ready', async () => {
  console.log('WhatsApp клиент готов и подключён.');
  activeClient = client;
  registerIncomingMessageForwarder();
  ensureHttpServer();
  console.log('Клиент запущен и готов принимать входящие сообщения.');
  
  // Уведомляем mcp-server об успешной авторизации
  if (currentAuthTelegramId) {
    try {
      await fetch(`${mcpServerBaseUrl}/whatsapp/auth/success`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramId: currentAuthTelegramId,
        }),
      });
      
      console.log(`Уведомление об успешной авторизации отправлено для telegramId: ${currentAuthTelegramId}`);
      currentAuthTelegramId = null;
    } catch (error) {
      console.error('Ошибка при отправке уведомления об авторизации:', error);
    }
  }
});

client.on('authenticated', () => {
  console.log('Аутентификация прошла успешно.');
});

client.on('auth_failure', (m) => {
  console.error('Сбой аутентификации:', m);
});

client.on('disconnected', (reason) => {
  console.error('Отключено:', reason);
  if (!isShuttingDown) {
    // Чтобы контейнер перезапустился docker-compose'ом
    process.exit(1);
  }
});

function registerIncomingMessageForwarder() {
  client.on('message', onIncomingMessage);
}

async function onIncomingMessage(msg) {
  // Игнорируем исходящие сообщения и сообщения от групп
  if (msg.fromMe || msg.from.includes('@g.us')) {
    return;
  }

  try {
    // Извлекаем номер телефона из WhatsApp ID (формат: 79173245220@c.us)
    const whatsappId = msg.from;
    const phoneNumber = whatsappId.replace('@c.us', '');

    const payload = {
      message: msg.body ?? '',
      telegramId: phoneNumber, // Используем telegramId для совместимости с существующим API
    };

    const response = await fetch(appURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error(`HTTP ${response.status} ${response.statusText}. URL: ${appURL}. Response: ${errorText}`);
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
          await msg.reply(replyText);
        }
      }
    }

    console.log('Переслал входящее сообщение на внешний сервис.', payload);
  } catch (error) {
    console.error('Не удалось переслать входящее сообщение:', error);
  }
}

async function sendMessage(providedClient, phone, message) {
  try {
    // Нормализуем номер телефона в WhatsApp ID формат
    const whatsappId = toWhatsAppId(phone);
    if (!whatsappId) {
      console.warn(`Не удалось нормализовать номер ${phone}.`);
      return;
    }

    const isRegistered = await providedClient.isRegisteredUser(whatsappId);
    if (!isRegistered) {
      console.warn(`Номер ${whatsappId} не зарегистрирован в WhatsApp.`);
      return;
    }

    await providedClient.sendMessage(whatsappId, message);
    console.log(`Сообщение отправлено пользователю ${phone}: ${message}`);
  } catch (error) {
    console.error(`Ошибка при обработке номера ${phone}:`, error);
  }
}

function toWhatsAppId(rawPhone) {
  if (!rawPhone) {
    return null;
  }
  const trimmed = String(rawPhone).trim();
  if (trimmed.includes('@')) {
    return trimmed;
  }
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) {
    return null;
  }
  return `${digits}@c.us`;
}

app.post('/send-message', async (req, res) => {
  const { message, phone } = req.body;

  if (!message || !phone) {
    return res.status(400).send('Message and phone are required');
  }

  try {
    await sendMessage(activeClient, phone, message);
    res.status(200).send('Message sent successfully');
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).send('Error sending message');
  }
});

app.post('/auth/init', async (req, res) => {
  const { telegramId } = req.body;

  if (!telegramId) {
    return res.status(400).json({ error: 'Missing required field: telegramId' });
  }

  try {
    // Сохраняем telegramId для отправки QR кода
    currentAuthTelegramId = telegramId;
    
    // Если клиент еще не инициализирован, инициализируем его
    if (!activeClient && !client.info) {
      await client.initialize();
    } else if (client.info) {
      // Если уже авторизован, сразу уведомляем
      await fetch(`${mcpServerBaseUrl}/whatsapp/auth/success`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramId }),
      });
      currentAuthTelegramId = null;
    }
    
    res.json({
      message: 'Авторизация WhatsApp инициализирована. Ожидайте QR код.',
    });
  } catch (error) {
    console.error('Error initializing WhatsApp auth:', error);
    res.status(500).json({ error: error.message || 'Failed to initialize auth' });
  }
});

function ensureHttpServer() {
  if (httpServer) {
    return;
  }

  const port = Number(process.env.PORT ?? 6800);
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
      await activeClient.destroy();
      console.log('WhatsApp клиент отключён.');
    } catch (error) {
      console.error('Ошибка при отключении WhatsApp клиента:', error);
    } finally {
      activeClient = null;
    }
  }

  process.exit(exitCode);
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

client.initialize().catch(async (err) => {
  console.error('Ошибка инициализации:', err);
  await gracefulShutdown(1);
});
