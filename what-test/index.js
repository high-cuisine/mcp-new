const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

/**
 * Сохраняем сессию в ./data, которая примонтирована как volume.
 * Это гарантирует, что после перезапуска контейнера QR повторно сканировать не придётся.
 */
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: './data',
    clientId: 'default'
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
      '--disable-features=VizDisplayCompositor',
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
      '--use-mock-keychain'
    ]
  }
});

client.on('qr', (qr) => {
  qrcode.generate(qr, { small: true });
  console.log('QR-код сгенерирован. Откройте WhatsApp → Связанные устройства → Сканировать QR.');
});

client.on('ready', async () => {
  console.log('Клиент готов и подключён.');
});

client.on('authenticated', () => {
  console.log('Аутентификация прошла успешно.');
});

client.on('auth_failure', (m) => {
  console.error('Сбой аутентификации:', m);
});

client.on('disconnected', (reason) => {
  console.error('Отключено:', reason);
  // Чтобы контейнер перезапустился docker-compose’ом
  process.exit(1);
});

// Пример автоответа
client.on('message', async (msg) => {
  console.log(`Сообщение от ${msg.from}: ${msg.body}`);
  if (msg.body.toLowerCase() === 'ping') {
    await msg.reply('pong');
  }
});

process.on('SIGINT', async () => {
  console.log('Завершаем работу...');
  try { await client.destroy(); } catch {}
  process.exit(0);
});

client.initialize().catch((err) => {
  console.error('Ошибка инициализации:', err);
  process.exit(1);
});
