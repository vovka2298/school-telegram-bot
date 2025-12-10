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

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

// Тест подключения к Supabase
async function testSupabaseConnection() {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/users?select=count`,
      { headers: createHeaders() }
    );
    
    console.log(`📊 Подключение: ${response.status} ${response.statusText}`);
    return response.ok;
  } catch (error) {
    console.error('❌ Ошибка подключения:', error.message);
    return false;
  }
}

// Получить пользователя
async function getUser(telegramId) {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/users?telegram_id=eq.${telegramId}`,
      { headers: createHeaders() }
    );
    
    if (response.ok) {
      const users = await response.json();
      return users.length > 0 ? users[0] : null;
    }
    
    console.error(`❌ Ошибка поиска пользователя ${telegramId}:`, response.status);
    return null;
  } catch (error) {
    console.error('❌ Ошибка getUser:', error.message);
    return null;
  }
}

// Создать пользователя (УПРОЩЕННАЯ ВЕРСИЯ)
async function createUser(telegramId, fullName, role = 'teacher') {
  try {
    console.log(`➕ Создание пользователя: ${telegramId} (${fullName})`);
    
    const userData = {
      telegram_id: telegramId,
      first_name: fullName,
      user_type: role,
      status: 'pending',
      created_at: new Date().toISOString()
    };
    
    console.log('📦 Данные:', userData);
    
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/users`,
      {
        method: 'POST',
        headers: createHeaders(true),
        body: JSON.stringify(userData)
      }
    );
    
    console.log(`📊 Статус: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Ошибка создания:', errorText);
      return null;
    }
    
    const result = await response.json();
    console.log('✅ Пользователь создан');
    return result[0];
    
  } catch (error) {
    console.error('❌ Ошибка createUser:', error.message);
    return null;
  }
}

// Обновить статус пользователя (РАБОЧАЯ ВЕРСИЯ)
async function updateUserStatus(telegramId, status, approvedBy = null) {
  try {
    console.log(`🔄 Обновление статуса ${telegramId} -> ${status}`);
    
    const updateData = {
      status: status,
      updated_at: new Date().toISOString()
    };
    
    if (status === 'active' && approvedBy) {
      updateData.approved_by = approvedBy;
      updateData.approved_at = new Date().toISOString();
    }
    
    console.log('📦 Данные обновления:', updateData);
    
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/users?telegram_id=eq.${telegramId}`,
      {
        method: 'PATCH',
        headers: createHeaders(true),
        body: JSON.stringify(updateData)
      }
    );
    
    console.log(`📊 Статус обновления: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Ошибка обновления:', errorText);
      return false;
    }
    
    console.log('✅ Статус обновлен');
    return true;
    
  } catch (error) {
    console.error('❌ Ошибка updateUserStatus:', error.message);
    return false;
  }
}

// Создать профиль учителя (после одобрения)
async function createTeacherProfile(teacherId, fullName) {
  try {
    console.log(`👨‍🏫 Создание профиля учителя ID: ${teacherId}`);
    
    const profileData = {
      teacher_id: teacherId,
      gender: 'male',
      bio: `Преподаватель ${fullName}`,
      available_for_new_students: true,
      created_at: new Date().toISOString()
    };
    
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/teacher_profiles`,
      {
        method: 'POST',
        headers: createHeaders(true),
        body: JSON.stringify(profileData)
      }
    );
    
    console.log(`📊 Статус создания профиля: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.warn('⚠️ Ошибка создания профиля:', errorText);
    } else {
      console.log('✅ Профиль учителя создан');
    }
    
  } catch (error) {
    console.error('❌ Ошибка createTeacherProfile:', error.message);
  }
}

// Получить ожидающих пользователей
async function getPendingUsers() {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/users?status=eq.pending&order=created_at.desc`,
      { headers: createHeaders() }
    );
    
    if (response.ok) {
      return await response.json();
    }
    return [];
  } catch (error) {
    console.error('Ошибка получения ожидающих:', error);
    return [];
  }
}

// ==================== КОМАНДЫ БОТА ====================

// Команда /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const username = msg.from.username || 'без_username';
  
  console.log(`\n=== /start от ${userId} (${username}) ===`);
  
  // Проверяем подключение
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
  }
  
  // Новая регистрация
  await bot.sendMessage(chatId,
    '👋 Добро пожаловать! Давайте зарегистрируем вас как преподавателя.\n\n' +
    'Пожалуйста, введите ваше ФИО (полное имя и фамилия):\n\n' +
    'Пример: <code>Иванов Иван Иванович</code>',
    { parse_mode: 'HTML' }
  );
  
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

// Отправка уведомления админу о новой заявке
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

// Обработка callback от админа (ОБНОВЛЕННАЯ ВЕРСИЯ)
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const adminId = query.from.id.toString();
  const data = query.data;
  
  console.log(`\n🔄 Callback от ${adminId}: ${data}`);
  
  try {
    await bot.answerCallbackQuery(query.id, { text: 'Обработка...' });
    
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

// Одобрение заявки (ИСПРАВЛЕННАЯ ВЕРСИЯ)
async function handleAdminApprove(adminId, targetUserId, query) {
  console.log(`\n✅ === ОДОБРЕНИЕ ЗАЯВКИ ===`);
  console.log(`👑 Админ: ${adminId}`);
  console.log(`👤 Пользователь: ${targetUserId}`);
  
  try {
    // Проверяем права
    if (adminId !== ADMIN_ID) {
      console.log('⛔ Нет прав доступа');
      await bot.answerCallbackQuery(query.id, { text: '⛔ Нет прав' });
      return;
    }
    
    // Получаем пользователя
    const user = await getUser(targetUserId);
    
    if (!user) {
      console.log(`❌ Пользователь ${targetUserId} не найден`);
      await bot.answerCallbackQuery(query.id, { text: 'Пользователь не найден' });
      return;
    }
    
    console.log(`👤 Найден пользователь: ${user.first_name} (статус: ${user.status})`);
    
    // ОБНОВЛЯЕМ СТАТУС ПОЛЬЗОВАТЕЛЯ
    const updated = await updateUserStatus(targetUserId, 'active', adminId);
    
    if (!updated) {
      throw new Error('Не удалось обновить статус пользователя');
    }
    
    console.log(`🔄 Статус пользователя обновлен на "active"`);
    
    // Если это учитель - создаем профиль
    if (user.user_type === 'teacher') {
      await createTeacherProfile(user.id, user.first_name);
      console.log(`👨‍🏫 Профиль учителя создан`);
    }
    
    // Обновляем сообщение админу
    const roleText = user.user_type === 'teacher' ? 'учитель' : 'менеджер';
    const individualAppUrl = `${MAIN_APP_URL}/?tg_id=${targetUserId}`;
    
    await bot.editMessageText(
      `✅ *Заявка одобрена*\n\n` +
      `👤 *Имя:* ${user.first_name}\n` +
      `🆔 *ID:* ${targetUserId}\n` +
      `👨‍🏫 *Роль:* ${roleText}\n` +
      `⏱️ *Время:* ${new Date().toLocaleString('ru-RU')}\n\n` +
      `🔗 *Ссылка для пользователя:*\n` +
      `${individualAppUrl}`,
      {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: []
        }
      }
    );
    
    console.log(`📝 Сообщение админу обновлено`);
    
    // УВЕДОМЛЯЕМ ПОЛЬЗОВАТЕЛЯ
    try {
      const userTypeText = user.user_type === 'teacher' ? 'учитель' : 'менеджер';
      
      await bot.sendMessage(targetUserId,
        `🎉 *Поздравляем! Ваша заявка одобрена!*\n\n` +
        `Теперь вы зарегистрированы как ${userTypeText}.\n\n` +
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
      
      console.log(`📨 Пользователь ${targetUserId} уведомлен`);
      
    } catch (notifyError) {
      console.error(`❌ Не удалось уведомить пользователя:`, notifyError.message);
    }
    
    await bot.answerCallbackQuery(query.id, { text: '✅ Заявка одобрена' });
    console.log(`🎉 === ОДОБРЕНИЕ ЗАВЕРШЕНО ===\n`);
    
  } catch (error) {
    console.error('❌ Критическая ошибка одобрения:', error);
    await bot.answerCallbackQuery(query.id, { 
      text: `❌ Ошибка: ${error.message.substring(0, 50)}...` 
    });
  }
}

// Отклонение заявки (ИСПРАВЛЕННАЯ ВЕРСИЯ)
async function handleAdminReject(adminId, targetUserId, query) {
  console.log(`\n❌ === ОТКЛОНЕНИЕ ЗАЯВКИ ===`);
  console.log(`👑 Админ: ${adminId}`);
  console.log(`👤 Пользователь: ${targetUserId}`);
  
  try {
    // Проверяем права
    if (adminId !== ADMIN_ID) {
      console.log('⛔ Нет прав доступа');
      await bot.answerCallbackQuery(query.id, { text: '⛔ Нет прав' });
      return;
    }
    
    // Получаем пользователя
    const user = await getUser(targetUserId);
    
    if (!user) {
      console.log(`❌ Пользователь ${targetUserId} не найден`);
      await bot.answerCallbackQuery(query.id, { text: 'Пользователь не найден' });
      return;
    }
    
    // ОБНОВЛЯЕМ СТАТУС
    const updated = await updateUserStatus(targetUserId, 'rejected', adminId);
    
    if (!updated) {
      throw new Error('Не удалось обновить статус');
    }
    
    console.log(`🔄 Статус пользователя обновлен на "rejected"`);
    
    // Обновляем сообщение админу
    await bot.editMessageText(
      `❌ *Заявка отклонена*\n\n` +
      `👤 *Имя:* ${user.first_name}\n` +
      `🆔 *ID:* ${targetUserId}\n` +
      `⏱️ *Время:* ${new Date().toLocaleString('ru-RU')}`,
      {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: []
        }
      }
    );
    
    console.log(`📝 Сообщение админу обновлено`);
    
    // УВЕДОМЛЯЕМ ПОЛЬЗОВАТЕЛЯ
    try {
      await bot.sendMessage(targetUserId,
        `❌ *Ваша заявка отклонена*\n\n` +
        `Администратор отклонил вашу заявку на регистрацию.\n\n` +
        `*Возможные причины:*\n` +
        `• Неполная информация\n` +
        `• Ошибка в данных\n` +
        `• Другая причина\n\n` +
        `Если вы считаете это ошибкой, свяжитесь с администратором.`,
        { parse_mode: 'Markdown' }
      );
      
      console.log(`📨 Пользователь ${targetUserId} уведомлен об отклонении`);
      
    } catch (notifyError) {
      console.error(`❌ Не удалось уведомить пользователя:`, notifyError.message);
    }
    
    await bot.answerCallbackQuery(query.id, { text: '❌ Заявка отклонена' });
    console.log(`🎉 === ОТКЛОНЕНИЕ ЗАВЕРШЕНО ===\n`);
    
  } catch (error) {
    console.error('❌ Критическая ошибка отклонения:', error);
    await bot.answerCallbackQuery(query.id, { 
      text: `❌ Ошибка: ${error.message.substring(0, 50)}...` 
    });
  }
}

// Команда /admin для админки
bot.onText(/\/admin/, async (msg) => {
  if (msg.from.id.toString() !== ADMIN_ID) {
    await bot.sendMessage(msg.chat.id, '⛔ У вас нет прав доступа');
    return;
  }
  
  try {
    // Получаем статистику
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/users?select=user_type,status`,
      { headers: createHeaders() }
    );
    
    let stats = {
      pending: 0,
      activeTeachers: 0,
      activeManagers: 0,
      blocked: 0,
      total: 0
    };
    
    if (response.ok) {
      const allUsers = await response.json();
      stats.total = allUsers.length;
      
      allUsers.forEach(user => {
        if (user.status === 'pending') stats.pending++;
        if (user.status === 'active') {
          if (user.user_type === 'teacher') stats.activeTeachers++;
          if (user.user_type === 'manager') stats.activeManagers++;
        }
        if (user.status === 'blocked') stats.blocked++;
      });
    }
    
    let message = `👑 *Панель администратора*\n\n`;
    message += `👥 *Всего пользователей:* ${stats.total}\n`;
    message += `⏳ *Ожидают одобрения:* ${stats.pending}\n`;
    message += `👨‍🏫 *Активных учителей:* ${stats.activeTeachers}\n`;
    message += `👨‍💼 *Активных менеджеров:* ${stats.activeManagers}\n`;
    message += `🚫 *Заблокировано:* ${stats.blocked}\n\n`;
    
    // Список ожидающих
    const pendingUsers = await getPendingUsers();
    
    if (pendingUsers.length > 0) {
      message += `*Последние заявки:*\n`;
      pendingUsers.forEach((user, index) => {
        const role = user.user_type === 'teacher' ? '👨‍🏫 Учитель' : '👨‍💼 Менеджер';
        message += `${index + 1}. ${user.first_name} - ${role} (ID: ${user.telegram_id})\n`;
      });
    } else {
      message += `✅ Нет ожидающих заявок`;
    }
    
    await bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('❌ Ошибка /admin:', error);
    await bot.sendMessage(msg.chat.id, '❌ Ошибка при получении статистики');
  }
});

// Команда /myinfo
bot.onText(/\/myinfo/, async (msg) => {
  const userId = msg.from.id.toString();
  const user = await getUser(userId);
  
  if (!user) {
    await bot.sendMessage(msg.chat.id, 'Вы еще не зарегистрированы. Используйте /start');
    return;
  }
  
  const statusMap = {
    'pending': '⏳ Ожидание одобрения',
    'active': '✅ Активен',
    'blocked': '❌ Заблокирован',
    'rejected': '❌ Отклонен'
  };
  
  const roleMap = {
    'teacher': '👨‍🏫 Учитель',
    'manager': '👨‍💼 Менеджер',
    'admin': '👑 Администратор'
  };
  
  const message = `
📋 *Ваши данные:*

👤 *Имя:* ${user.first_name}
🆔 *Telegram ID:* ${userId}
${roleMap[user.user_type] || user.user_type}
📊 *Статус:* ${statusMap[user.status] || user.status}
📅 *Зарегистрирован:* ${new Date(user.created_at).toLocaleDateString('ru-RU')}
${user.status === 'active' ? `\n🔗 *Ваше приложение:* ${MAIN_APP_URL}/?tg_id=${userId}` : ''}
  `;
  
  await bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
});

// Команда /link (получить ссылку на приложение)
bot.onText(/\/link/, async (msg) => {
  const userId = msg.from.id.toString();
  const user = await getUser(userId);
  
  if (!user) {
    await bot.sendMessage(msg.chat.id, 'Вы еще не зарегистрированы. Используйте /start');
    return;
  }
  
  if (user.status !== 'active') {
    await bot.sendMessage(msg.chat.id, 
      `Ваш аккаунт не активен (статус: ${user.status}). Дождитесь одобрения администратора.`
    );
    return;
  }
  
  // СОЗДАЕМ ИНДИВИДУАЛЬНУЮ ССЫЛКУ
  const individualAppUrl = `${MAIN_APP_URL}/?tg_id=${userId}`;
  
  await bot.sendMessage(msg.chat.id,
    `🔗 *Ваша персональная ссылка:*\n\n` +
    `${individualAppUrl}\n\n` +
    `Нажмите кнопку ниже, чтобы открыть приложение:`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          {
            text: '📱 Открыть МОЕ приложение',
            web_app: { url: individualAppUrl }
          }
        ]]
      }
    }
  );
});

// ==================== API ДЛЯ ОТЛАДКИ ====================

app.get('/debug', async (req, res) => {
  try {
    // Проверяем таблицу users
    const usersResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/users?select=telegram_id,first_name,user_type,status,created_at&order=created_at.desc&limit=20`,
      { headers: createHeaders() }
    );
    
    const users = usersResponse.ok ? await usersResponse.json() : [];
    
    // Проверяем teacher_profiles
    const profilesResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/teacher_profiles?select=count`,
      { headers: createHeaders() }
    );
    
    const profilesCount = profilesResponse.ok ? (await profilesResponse.json())[0]?.count : 0;
    
    res.json({
      bot: 'running',
      admin: ADMIN_ID,
      supabase: SUPABASE_URL,
      users: {
        total: users.length,
        pending: users.filter(u => u.status === 'pending').length,
        active: users.filter(u => u.status === 'active').length,
        data: users
      },
      teacher_profiles: profilesCount,
      main_app: MAIN_APP_URL
    });
    
  } catch (error) {
    res.json({ error: error.message });
  }
});

// Тестовый API для создания пользователя
app.post('/api/create-test-user', async (req, res) => {
  try {
    const { telegram_id, first_name } = req.body;
    
    if (!telegram_id || !first_name) {
      return res.status(400).json({ error: 'Необходимы telegram_id и first_name' });
    }
    
    const user = await createUser(telegram_id, first_name, 'teacher');
    
    if (user) {
      res.json({ 
        success: true, 
        message: 'Тестовый пользователь создан',
        user: user 
      });
    } else {
      res.status(500).json({ error: 'Не удалось создать пользователя' });
    }
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== ЗАПУСК СЕРВЕРА ====================

const port = process.env.PORT || 3001;
app.listen(port, async () => {
  console.log(`\n🌐 Сервер бота запущен на порту ${port}`);
  console.log(`🔍 Отладка: http://localhost:${port}/debug`);
  console.log(`👑 Админ: ${ADMIN_ID}`);
  
  // Тестируем подключение при старте
  const connected = await testSupabaseConnection();
  
  if (connected) {
    console.log('✅ Подключение к Supabase успешно');
  } else {
    console.log('❌ Проблемы с подключением к Supabase');
  }
  
  // Запускаем polling
  console.log('🤖 Бот запущен в режиме polling');
  bot.startPolling();
});

// Обработка ошибок
bot.on('polling_error', (error) => {
  console.error('❌ Polling error:', error.message);
});
