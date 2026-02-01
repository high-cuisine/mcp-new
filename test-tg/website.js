const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// API endpoint для "отправки" данных формы (просто заглушка)
app.post('/api/submit', async (req, res) => {
  const { name, email, rating, comment } = req.body;
  
  // Логируем данные в консоль (для демонстрации)
  console.log('📋 Получены данные формы:');
  console.log(`   👤 Имя: ${name}`);
  console.log(`   📧 Email: ${email}`);
  console.log(`   ⭐ Оценка: ${rating}`);
  console.log(`   💬 Комментарий: ${comment}`);
  
  // Имитация задержки обработки
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Всегда возвращаем успех (это заглушка)
  res.json({ success: true, message: 'Данные успешно отправлены!' });
});

// Запуск сервера
app.listen(PORT, '0.0.0.0', () => {
  console.log('🌐 Веб-сайт запущен!');
  console.log(`📍 Доступен по адресу: http://localhost:${PORT}`);
  console.log('ℹ️  Это заглушка - данные не отправляются в Telegram');
});

