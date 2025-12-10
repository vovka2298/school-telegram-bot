const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');
const fetch = require('node-fetch');
require('dotenv').config();

// ==================== КОНФИГУРАЦИЯ ====================
const BOT_TOKEN = process.env.BOT_TOKEN || '8203853124:AAHQmyBWNp1MdSR9B9bOMGbR8X1k6z6P08A';
const ADMIN_ID = process.env.ADMIN_ID || '913096324';
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'production';

// URL вашего основного приложения на Vercel
const MAIN_APP_URL = 'https://school-mini-app-pi.vercel.app';

// Конфигурация Supabase
const SUPABASE_URL = 'https://rtywenfvaoxsjdkulmdk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_WhiVd5day72hRoTKiFtiIQ_sP2wu4_S';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0eXdlbmZ2YW94c2pka3VsbWRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTM3NzEzNiwiZXhwIjoyMDgwOTUzMTM2fQ.wy2D8H0mS-c1JqJFF2O-IPk3bgvVLMjHJUTzRX2fx-0';

console.log('🚀 Запуск Telegram бота...');
console.log(`👑 Админ ID: ${ADMIN_ID}`);
console.log(`🔑 API Key: ${SUPABASE_KEY.substring(0, 10)}...`);
console.log(`🔗 Supabase URL: ${SUPABASE_URL}`);

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
const bot = new TelegramBot(BOT_TOKEN);
const app = express();
app.use(express.json());

// Заголовки для Supabase
const createHeaders = (useServiceKey = false) => ({
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${useServiceKey ? SUPABASE_SERVICE_KEY : SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
});

// ==================== УЛУЧШЕННЫЕ ФУНКЦИИ ====================

// Тест подключения к Supabase
async function testSupabaseConnection() {
  try {
    console.log('🔗 Тестируем подключение к Supabase...');
    
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/users?select=count`,
      { headers: createHeaders() }
    );
    
    console.log(`📊 Статус подключения: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      console.log('✅ Подключение к Supabase успешно');
      return true;
    } else {
      const errorText = await response.text();
      console.error('❌ Ошибка подключения:', errorText);
      return false;
    }
  } catch (error) {
    console.error('❌ Ошибка подключения:', error.message);
    return false;
  }
}

// Получить пользователя (простая версия)
async function getUser(telegramId) {
  try {
    console.log(`🔍 Поиск пользователя ${telegramId}...`);
    
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/users?telegram_id=eq.${telegramId}`,
      { 
        method: 'GET',
        headers: createHeaders()
      }
    );
    
    console.log(`📊 Статус поиска: ${response.status}`);
    
    if (response.ok) {
      const users = await response.json();
      console.log(`👤 Найдено пользователей: ${users.length}`);
      return users.length > 0 ? users[0] : null;
    } else {
      const errorText = await response.text();
      console.error('❌ Ошибка поиска:', errorText);
      return null;
    }
  } catch (error) {
    console.error('❌ Ошибка getUser:', error.message);
    return null;
  }
}

// СОЗДАТЬ ПОЛЬЗОВАТЕЛЯ (упрощенная версия)
async function createUser(telegramId, fullName, role = 'teacher') {
  try {
    console.log(`➕ Создание пользователя: ${telegramId} (${fullName}) как ${role}`);
    
    const userData = {
      telegram_id: telegramId,
      first_name: fullName,
      user_type: role,
      status: 'pending',
      created_at: new Date().toISOString()
    };
    
    console.log('📦 Отправляемые данные:', userData);
    
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/users`,
      {
        method: 'POST',
        headers: createHeaders(true), // Используем service key для записи
        body: JSON.stringify(userData)
      }
    );
    
    console.log(`📊 Статус создания: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Ошибка создания:', errorText);
      return null;
    }
    
    const result = await response.json();
    console.log('✅ Пользователь создан:', result);
    return result[0];
    
  } catch (error) {
    console.error('❌ Ошибка createUser:', error.message);
    return null;
  }
}

// ==================== КОМАНДЫ БОТА ====================

// Команда /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const username = msg.from.username || 'без_username';
  
  console.log(`\n=== /start от ${userId} (${username}) ===`);
  
  // Тестируем подключение
  const connected = await testSupabaseConnection();
  if (!connected) {
    await bot.sendMessage(chatId, 
      '❌ Ошибка подключения к базе данных. Попробуйте позже.'
    );
    return;
  }
  
  // Проверяем существующего пользователя
  const existingUser = await getUser(userId);
  
  if (existingUser) {
    console.log(`👤 Пользователь найден:`, existingUser);
    
    if (existingUser.status === 'active') {
      const userTypeText = existingUser.user_type === 'teacher' ? 'учитель' : 'менеджер';
      const individualAppUrl = `${MAIN_APP_URL}/?tg_id=${userId}`;
      
      await bot.sendMessage(chatId, 
        `✅ Вы уже зарегистрированы как ${userTypeText}!\n\n` +
        `👤 Имя: ${existingUser.first_name}\n` +
        `🎯 Роль: ${userTypeText}\n` +
        `📊 Статус: Активен\n\n` +
        `Нажмите кнопку ниже, чтобы открыть ваше приложение:`,
        {
          reply_markup: {
            inline_keyboard: [[
              {
                text: '📱 Открыть мое приложение',
                web_app: { url: individualAppUrl }
              }
            ]]
          }
        }
      );
      return;
    }
    
    if (existingUser.status === 'pending') {
      await bot.sendMessage(chatId, 
        '⏳ Ваша заявка на рассмотрении. Ожидайте одобрения администратора.'
      );
      return;
    }
  } else {
    console.log(`👤 Пользователь ${userId} не найден, начинаем регистрацию`);
  }
  
  // Новая регистрация
  await bot.sendMessage(chatId,
    '👋 Добро пожаловать! Давайте зарегистрируем вас как преподавателя.\n\n' +
    'Пожалуйста, введите ваше ФИО (полное имя и фамилия):\n\n' +
    'Пример: <code>Иванов Иван Иванович</code>',
    { parse_mode: 'HTML' }
  );
  
  // Сохраняем что пользователь начал регистрацию
  console.log(`📝 Начата регистрация для ${userId}`);
});

// Обработка текстовых сообщений (регистрация)
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const text = msg.text.trim();
  
  console.log(`\n📨 Сообщение от ${userId}: "${text}"`);
  
  // Проверяем, есть ли пользователь
  const existingUser = await getUser(userId);
  
  if (existingUser) {
    console.log(`👤 Пользователь уже существует:`, existingUser.status);
    
    if (existingUser.status === 'pending') {
      await bot.sendMessage(chatId, 
        '⏳ Ваша заявка уже отправлена и ожидает рассмотрения администратором.'
      );
      return;
    }
    
    if (existingUser.status === 'active') {
      const individualAppUrl = `${MAIN_APP_URL}/?tg_id=${userId}`;
      await bot.sendMessage(chatId,
        `✅ Вы уже зарегистрированы!\n\n` +
        `Нажмите кнопку, чтобы открыть приложение:`,
        {
          reply_markup: {
            inline_keyboard: [[
              {
                text: '📱 Открыть приложение',
                web_app: { url: individualAppUrl }
              }
            ]]
          }
        }
      );
      return;
    }
  }
  
  // Если пользователя нет и текст выглядит как имя - регистрируем
  if (text.length >= 3 && text.length <= 100) {
    console.log(`📝 Регистрируем нового пользователя: ${text}`);
    
    try {
      // СОЗДАЕМ ПОЛЬЗОВАТЕЛЯ
      const newUser = await createUser(userId, text, 'teacher');
      
      if (!newUser) {
        throw new Error('Не удалось создать пользователя');
      }
      
      // Отправляем уведомление админу
      await sendAdminNotification(userId, text, 'teacher');
      
      // Уведомляем пользователя
      await bot.sendMessage(chatId,
        `✅ *Заявка отправлена!*\n\n` +
        `👤 *Ваше имя:* ${text}\n` +
        `🎯 *Роль:* учитель\n` +
        `🕐 *Статус:* Ожидание одобрения\n\n` +
        `Администратор получил вашу заявку и скоро рассмотрит её.\n` +
        `После одобрения вы получите ссылку на ваше приложение.`,
        { parse_mode: 'Markdown' }
      );
      
      console.log(`🎉 Пользователь ${userId} успешно зарегистрирован!`);
      
    } catch (error) {
      console.error('❌ Ошибка регистрации:', error);
      await bot.sendMessage(chatId, 
        '❌ Ошибка при регистрации. Попробуйте позже или свяжитесь с администратором.'
      );
    }
  } else {
    await bot.sendMessage(chatId, 
      '❌ Пожалуйста, введите корректное ФИО (от 3 до 100 символов).\n' +
      'Пример: Иванов Иван Иванович'
    );
  }
});

// Отправка уведомления админу
async function sendAdminNotification(userId, fullName, role) {
  try {
    const roleText = role === 'teacher' ? 'учителя' : 'менеджера';
    
    const message = `
📋 *НОВАЯ ЗАЯВКА НА РЕГИСТРАЦИЮ*

👤 *Пользователь:* ${fullName}
🆔 *ID:* ${userId}
👨‍🏫 *Роль:* ${roleText}
🕐 *Время:* ${new Date().toLocaleString('ru-RU')}

_Рассмотреть заявку:_
    `;
    
    await bot.sendMessage(ADMIN_ID, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Одобрить', callback_data: `approve_${userId}` },
            { text: '❌ Отклонить', callback_data: `reject_${userId}` }
          ]
        ]
      }
    });
    
    console.log(`📨 Уведомление отправлено админу ${ADMIN_ID}`);
    
  } catch (error) {
    console.error('❌ Ошибка отправки админу:', error);
  }
}

// Обработка callback от админа
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const adminId = query.from.id.toString();
  const data = query.data;
  
  console.log(`\n🔄 Callback от ${adminId}: ${data}`);
  
  try {
    if (data.startsWith('approve_')) {
      const targetUserId = data.replace('approve_', '');
      await handleAdminApprove(adminId, targetUserId, query);
    }
    else if (data.startsWith('reject_')) {
      const targetUserId = data.replace('reject_', '');
      await handleAdminReject(adminId, targetUserId, query);
    }
    
  } catch (error) {
    console.error('❌ Ошибка callback:', error);
    await bot.answerCallbackQuery(query.id, { text: 'Произошла ошибка' });
  }
});

// Одобрение заявки
async function handleAdminApprove(adminId, targetUserId, query) {
  if (adminId !== ADMIN_ID) {
    await bot.answerCallbackQuery(query.id, { text: '⛔ Нет прав' });
    return;
  }
  
  try {
    console.log(`✅ Админ ${adminId} одобряет пользователя ${targetUserId}`);
    
    // Обновляем статус пользователя
    const updateResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/users?telegram_id=eq.${targetUserId}`,
      {
        method: 'PATCH',
        headers: createHeaders(true),
        body: JSON.stringify({
          status: 'active',
          approved_by: adminId,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      }
    );
    
    if (!updateResponse.ok) {
      throw new Error('Не удалось обновить статус');
    }
    
    // Получаем данные пользователя
    const user = await getUser(targetUserId);
    
    // Обновляем сообщение админу
    await bot.editMessageText(
      `✅ *Заявка одобрена*\n\n` +
      `👤 ${user?.first_name || 'Пользователь'}\n` +
      `🆔 ${targetUserId}\n` +
      `👨‍🏫 Учитель\n` +
      `⏱️ ${new Date().toLocaleString('ru-RU')}\n\n` +
      `🔗 *Ссылка для пользователя:*\n` +
      `${MAIN_APP_URL}/?tg_id=${targetUserId}`,
      {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'Markdown'
      }
    );
    
    // Уведомляем пользователя
    const individualAppUrl = `${MAIN_APP_URL}/?tg_id=${targetUserId}`;
    
    await bot.sendMessage(targetUserId,
      `🎉 *Поздравляем! Ваша заявка одобрена!*\n\n` +
      `Теперь вы зарегистрированы как учитель.\n\n` +
      `📱 *Ваше персональное приложение:*\n` +
      `${individualAppUrl}\n\n` +
      `Нажмите кнопку ниже, чтобы открыть:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            {
              text: '📱 Открыть мое приложение',
              web_app: { url: individualAppUrl }
            }
          ]]
        }
      }
    );
    
    console.log(`👌 Пользователь ${targetUserId} уведомлен`);
    await bot.answerCallbackQuery(query.id, { text: 'Заявка одобрена' });
    
  } catch (error) {
    console.error('❌ Ошибка одобрения:', error);
    await bot.answerCallbackQuery(query.id, { text: 'Ошибка' });
  }
}

// Отклонение заявки
async function handleAdminReject(adminId, targetUserId, query) {
  if (adminId !== ADMIN_ID) {
    await bot.answerCallbackQuery(query.id, { text: '⛔ Нет прав' });
    return;
  }
  
  try {
    console.log(`❌ Админ ${adminId} отклоняет пользователя ${targetUserId}`);
    
    // Обновляем статус
    await fetch(
      `${SUPABASE_URL}/rest/v1/users?telegram_id=eq.${targetUserId}`,
      {
        method: 'PATCH',
        headers: createHeaders(true),
        body: JSON.stringify({
          status: 'rejected',
          updated_at: new Date().toISOString()
        })
      }
    );
    
    // Обновляем сообщение админу
    await bot.editMessageText(
      `❌ *Заявка отклонена*\n\n` +
      `🆔 ${targetUserId}\n` +
      `⏱️ ${new Date().toLocaleString('ru-RU')}`,
      {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'Markdown'
      }
    );
    
    // Уведомляем пользователя
    await bot.sendMessage(targetUserId,
      `❌ *Ваша заявка отклонена*\n\n` +
      `Администратор отклонил вашу заявку на регистрацию.\n` +
      `Если это ошибка, свяжитесь с администратором.`
    );
    
    await bot.answerCallbackQuery(query.id, { text: 'Заявка отклонена' });
    
  } catch (error) {
    console.error('❌ Ошибка отклонения:', error);
    await bot.answerCallbackQuery(query.id, { text: 'Ошибка' });
  }
}

// ==================== API ДЛЯ ОТЛАДКИ ====================

app.get('/debug', async (req, res) => {
  try {
    // Проверяем таблицу users
    const usersResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/users?select=telegram_id,first_name,user_type,status&order=created_at.desc&limit=10`,
      { headers: createHeaders() }
    );
    
    const users = usersResponse.ok ? await usersResponse.json() : [];
    
    res.json({
      bot: 'running',
      supabase: SUPABASE_URL,
      usersCount: users.length,
      users: users,
      testConnection: await testSupabaseConnection()
    });
    
  } catch (error) {
    res.json({ error: error.message });
  }
});

// ==================== ЗАПУСК СЕРВЕРА ====================

const port = process.env.PORT || 3001;
app.listen(port, async () => {
  console.log(`\n🌐 Сервер бота запущен на порту ${port}`);
  console.log(`🔍 Отладка: http://localhost:${port}/debug`);
  
  // Тестируем подключение при старте
  await testSupabaseConnection();
  
  // Запускаем polling
  console.log('🔁 Запускаем polling режим');
  bot.startPolling();
});

// Обработка ошибок
bot.on('polling_error', (error) => {
  console.error('❌ Polling error:', error.message);
});
