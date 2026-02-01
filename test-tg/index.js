const TelegramBot = require('node-telegram-bot-api');

// Токен бота
const BOT_TOKEN = '7600472632:AAEbV7PF4lhmvIlIUnskoN72f4uy_2lkJ0Y';

// ID получателя
const CHAT_ID = '7260594642';

// Создаем бота (без polling, чтобы избежать ошибок)
const bot = new TelegramBot(BOT_TOKEN);

// Функция отправки сообщения
async function sendNotification(name, email, rating, comment) {
  const message = `📋 Новая заявка:\n\n👤 Имя: ${name}\n📧 Почта: ${email}\n⭐ Оценка: ${rating}\n💬 Комментарий: ${comment}`;
  
  try {
    await bot.sendMessage(CHAT_ID, message);
    console.log('✅ Сообщение успешно отправлено в Telegram');
    console.log(`📱 Отправлено: ${message}`);
  } catch (error) {
    console.error('❌ Ошибка при отправке сообщения:', error.message);
  }
}

// Отправляем скриптовое сообщение при запуске
console.log('🤖 Telegram бот запущен...');
sendNotification('test', 'test@test.test', '5', 'test');

// Держим процесс активным
setInterval(() => {
  console.log('⏰ Бот работает...');
}, 60000); // Каждую минуту выводим статус

