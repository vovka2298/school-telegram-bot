const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');
const fetch = require('node-fetch'); // Добавляем для работы с Supabase
require('dotenv').config();

// ==================== КОНФИГУРАЦИЯ ====================
const BOT_TOKEN = process.env.BOT_TOKEN || '8203853124:AAHQmyBWNp1MdSR9B9bOMGbR8X1k6z6P08A';
const ADMIN_ID = process.env.ADMIN_ID || '913096324';
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'production';

// URL вашего основного приложения на Vercel
const MAIN_APP_URL = 'https://school-mini-app-pi.vercel.app';

// Конфигурация Supabase (ТА ЖЕ САМАЯ БАЗА!)
const SUPABASE_URL = 'https://rtywenfvaoxsjdkulmdk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_WhiVd5day72hRoTKiFtiIQ_sP2wu4_S';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0eXdlbmZ2YW94c2pka3VsbWRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTM3NzEzNiwiZXhwIjoyMDgwOTUzMTM2fQ.wy2D8H0mS-c1JqJFF2O-IPk3bgvVLMjHJUTzRX2fx-0';

console.log('🚀 Запуск Telegram бота...');
console.log(`👑 Админ ID: ${ADMIN_ID}`);
console.log(`📱 Основное приложение: ${MAIN_APP_URL}`);
console.log(`🌐 Режим: ${NODE_ENV}`);
console.log(`📦 База данных: Supabase PostgreSQL`);

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

// Получить состояние пользователя из Supabase
async function getUserState(telegramId) {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/user_states?telegram_id=eq.${telegramId}`,
      { headers: createHeaders() }
    );
    
    if (response.ok) {
      const states = await response.json();
      return states.length > 0 ? states[0] : null;
    }
    return null;
  } catch (error) {
    console.error('Ошибка получения состояния:', error);
    return null;
  }
}

// Установить состояние пользователя в Supabase
async function setUserState(telegramId, state, tempData = null) {
  try {
    await fetch(
      `${SUPABASE_URL}/rest/v1/user_states`,
      {
        method: 'POST',
        headers: {
          ...createHeaders(true),
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({
          telegram_id: telegramId,
          state: state,
          temp_data: tempData
        })
      }
    );
    return true;
  } catch (error) {
    console.error('Ошибка установки состояния:', error);
    return false;
  }
}

// Удалить состояние пользователя
async function deleteUserState(telegramId) {
  try {
    await fetch(
      `${SUPABASE_URL}/rest/v1/user_states?telegram_id=eq.${telegramId}`,
      {
        method: 'DELETE',
        headers: createHeaders(true)
      }
    );
    return true;
  } catch (error) {
    console.error('Ошибка удаления состояния:', error);
    return false;
  }
}

// Получить пользователя из Supabase
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
    return null;
  } catch (error) {
    console.error('Ошибка получения пользователя:', error);
    return null;
  }
}

// Создать пользователя в Supabase (ОСНОВНАЯ ФУНКЦИЯ РЕГИСТРАЦИИ!)
async function createUser(userData) {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/users`,
      {
        method: 'POST',
        headers: createHeaders(true),
        body: JSON.stringify({
          telegram_id: userData.telegram_id,
          username: userData.telegram_username,
          first_name: userData.full_name,
          role: userData.role,
          status: userData.status || 'pending',
          created_at: new Date().toISOString()
        })
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Ошибка создания пользователя:', errorText);
      return null;
    }
    
    const newUser = await response.json();
    console.log(`✅ Пользователь создан в Supabase: ${userData.telegram_id} (${userData.full_name})`);
    return newUser[0];
  } catch (error) {
    console.error('Ошибка создания пользователя:', error);
    return null;
  }
}

// Обновить статус пользователя в Supabase
async function updateUserStatus(telegramId, status, approvedBy = null) {
  try {
    const updateData = {
      status: status,
      updated_at: new Date().toISOString()
    };
    
    if (status === 'active' && approvedBy) {
      updateData.approved_by = approvedBy;
      updateData.approved_at = new Date().toISOString();
    }
    
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/users?telegram_id=eq.${telegramId}`,
      {
        method: 'PATCH',
        headers: createHeaders(true),
        body: JSON.stringify(updateData)
      }
    );
    
    return response.ok;
  } catch (error) {
    console.error('Ошибка обновления статуса:', error);
    return false;
  }
}

// Получить всех ожидающих пользователей
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

// Регистрация пользователя в основном приложении (теперь уже в той же базе!)
async function registerUserInMainApp(telegramId, fullName, role) {
  try {
    // Преобразуем роль из формата бота в формат основного приложения
    const mainAppRole = role.replace('pending_', '');
    
    // Проверяем, есть ли пользователь уже в основной базе
    const existingUser = await getUser(telegramId);
    
    if (existingUser && existingUser.status === 'active') {
      console.log(`ℹ️ Пользователь ${telegramId} уже активен в системе`);
      return { ok: true, message: 'Пользователь уже активен' };
    }
    
    // Обновляем статус на active
    const updated = await updateUserStatus(telegramId, 'active', ADMIN_ID);
    
    if (updated) {
      console.log(`✅ Пользователь ${telegramId} активирован как ${mainAppRole}`);
      
      // Автоматически создаем профиль преподавателя если это учитель
      if (mainAppRole === 'teacher') {
        await createTeacherProfile(telegramId, fullName);
      }
      
      return { 
        ok: true, 
        message: 'Пользователь зарегистрирован и активирован',
        role: mainAppRole 
      };
    } else {
      throw new Error('Не удалось обновить статус пользователя');
    }
    
  } catch (error) {
    console.error('❌ Ошибка регистрации в основном приложении:', error);
    return { ok: false, error: error.message };
  }
}

// Создать профиль преподавателя (предметы и т.д.)
async function createTeacherProfile(telegramId, fullName) {
  try {
    // Получаем пользователя чтобы узнать его ID
    const user = await getUser(telegramId);
    if (!user) return;
    
    // Создаем профиль преподавателя
    await fetch(
      `${SUPABASE_URL}/rest/v1/teacher_profiles`,
      {
        method: 'POST',
        headers: {
          ...createHeaders(true),
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({
          teacher_id: user.id,
          gender: 'Мужской'
        })
      }
    );
    
    // Добавляем базовые предметы
    const basicSubjects = ['МатематикаЕГЭ', 'ФизикаОГЭ'];
    const subjectData = basicSubjects.map(subject => ({
      teacher_id: user.id,
      subject: subject
    }));
    
    await fetch(
      `${SUPABASE_URL}/rest/v1/teacher_subjects`,
      {
        method: 'POST',
        headers: createHeaders(true),
        body: JSON.stringify(subjectData)
      }
    );
    
    console.log(`📚 Создан профиль преподавателя для ${fullName}`);
    
  } catch (error) {
    console.error('Ошибка создания профиля преподавателя:', error);
  }
}

// ==================== КОМАНДЫ БОТА ====================

// Команда /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const username = msg.from.username || 'без_username';
  
  console.log(`👤 /start от ${userId} (${username})`);
  
  // Проверяем существующего пользователя
  const existingUser = await getUser(userId);
  
  if (existingUser) {
    if (existingUser.status === 'active') {
      const roleText = existingUser.role.includes('teacher') ? 'учитель' : 'менеджер';
      
      // Создаем URL с tg_id для открытия приложения
      const webAppUrl = `${MAIN_APP_URL}/?tg_id=${userId}`;
      
      await bot.sendMessage(chatId, 
        `✅ Вы уже зарегистрированы как ${roleText}!\n\n` +
        `👤 Имя: ${existingUser.first_name}\n` +
        `🎯 Роль: ${roleText}\n\n` +
        `Нажмите кнопку ниже, чтобы открыть приложение:`,
        {
          reply_markup: {
            inline_keyboard: [[
              {
                text: '📱 Открыть приложение',
                web_app: { url: webAppUrl }
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
  
  // Новый пользователь - начинаем регистрацию
  await setUserState(userId, 'choosing_role');
  
  await bot.sendMessage(chatId,
    '👋 Добро пожаловать в систему расписания!\n\n' +
    'Пожалуйста, выберите свою роль:',
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '👨‍🏫 Я учитель', callback_data: 'role_teacher' },
            { text: '👨‍💼 Я менеджер', callback_data: 'role_manager' }
          ]
        ]
      }
    }
  );
});

// Обработка нажатий на inline кнопки
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id.toString();
  const data = query.data;
  
  try {
    // Выбор роли
    if (data.startsWith('role_')) {
      const role = data.replace('role_', '');
      const roleType = role === 'teacher' ? 'pending_teacher' : 'pending_manager';
      
      await setUserState(userId, 'entering_name', JSON.stringify({ role: roleType }));
      await bot.deleteMessage(chatId, query.message.message_id);
      
      await bot.sendMessage(chatId,
        role === 'teacher' ? 
        '👨‍🏫 Отлично! Теперь введите ваше ФИО (полное имя):' :
        '👨‍💼 Отлично! Теперь введите ваше ФИО (полное имя):'
      );
      
      await bot.answerCallbackQuery(query.id);
    }
    
    // Действия админа
    else if (data.startsWith('approve_')) {
      const targetUserId = data.replace('approve_', '');
      await handleAdminAction(userId, targetUserId, true, query);
    }
    else if (data.startsWith('reject_')) {
      const targetUserId = data.replace('reject_', '');
      await handleAdminAction(userId, targetUserId, false, query);
    }
    
  } catch (error) {
    console.error('❌ Ошибка в callback:', error);
    await bot.answerCallbackQuery(query.id, { text: 'Произошла ошибка' });
  }
});

// Обработка текстовых сообщений (ВВОД ИМЕНИ)
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const text = msg.text.trim();
  
  const userState = await getUserState(userId);
  
  if (userState && userState.state === 'entering_name') {
    if (text.length < 2) {
      await bot.sendMessage(chatId, '❌ Пожалуйста, введите корректное ФИО (минимум 2 символа)');
      return;
    }
    
    try {
      const tempData = JSON.parse(userState.temp_data || '{}');
      const role = tempData.role;
      
      // СОЗДАЕМ ПОЛЬЗОВАТЕЛЯ В SUPABASE!
      await createUser({
        telegram_id: userId,
        telegram_username: msg.from.username || null,
        full_name: text,
        role: role,
        status: 'pending'
      });
      
      // Отправляем заявку админу
      await sendAdminNotification(userId, text, role);
      
      // Очищаем состояние
      await deleteUserState(userId);
      
      // Уведомляем пользователя
      const roleText = role.includes('teacher') ? 'учителя' : 'менеджера';
      await bot.sendMessage(chatId,
        `✅ Ваша заявка на регистрацию в качестве ${roleText} отправлена!\n\n` +
        `👤 Ваше имя: ${text}\n` +
        `🕐 Статус: Ожидание одобрения администратором\n\n` +
        `Вы получите уведомление, когда администратор рассмотрит вашу заявку.`
      );
      
      console.log(`📝 Новая заявка от ${userId} (${text}) как ${roleText}`);
      
    } catch (error) {
      console.error('❌ Ошибка регистрации:', error);
      await bot.sendMessage(chatId, '❌ Произошла ошибка при обработке заявки. Попробуйте позже.');
    }
  }
});

// Отправка уведомления админу
async function sendAdminNotification(userId, fullName, role) {
  try {
    const user = await getUser(userId);
    const username = user?.username || 'не указан';
    const roleText = role.includes('teacher') ? 'учителя' : 'менеджера';
    
    const message = `
📋 *НОВАЯ ЗАЯВКА НА РЕГИСТРАЦИЮ*

👤 *Пользователь:* ${fullName}
🆔 *ID:* ${userId}
📝 *Username:* @${username}
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
    
    console.log(`📨 Заявка отправлена админу ${ADMIN_ID} для пользователя ${userId}`);
    
  } catch (error) {
    console.error('❌ Ошибка отправки админу:', error);
  }
}

// Обработка действий админа
async function handleAdminAction(adminId, targetUserId, isApproved, query) {
  try {
    // Проверяем права
    if (adminId !== ADMIN_ID) {
      await bot.answerCallbackQuery(query.id, { text: '⛔ У вас нет прав' });
      return;
    }
    
    const targetUser = await getUser(targetUserId);
    if (!targetUser) {
      await bot.answerCallbackQuery(query.id, { text: 'Пользователь не найден' });
      return;
    }
    
    const newStatus = isApproved ? 'active' : 'rejected';
    const updated = await updateUserStatus(targetUserId, newStatus, adminId);
    
    if (!updated) {
      throw new Error('Не удалось обновить статус');
    }
    
    // Обновляем сообщение у админа
    const roleText = targetUser.role.includes('teacher') ? 'учитель' : 'менеджер';
    const statusText = isApproved ? 'одобрен' : 'отклонен';
    const emoji = isApproved ? '✅' : '❌';
    
    await bot.editMessageText(
      `${emoji} *Заявка обработана*\n\n` +
      `👤 ${targetUser.first_name}\n` +
      `🆔 ${targetUserId}\n` +
      `👨‍🏫 ${roleText}\n` +
      `📊 Статус: ${statusText}\n` +
      `⏱️ ${new Date().toLocaleString('ru-RU')}`,
      {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'Markdown'
      }
    );
    
    // Уведомляем пользователя
    try {
      if (isApproved) {
        const roleForUser = targetUser.role.includes('teacher') ? 'учитель' : 'менеджер';
        
        // Регистрируем пользователя в основной системе
        await registerUserInMainApp(targetUserId, targetUser.first_name, targetUser.role);
        
        // Создаем URL с tg_id для открытия приложения
        const webAppUrl = `${MAIN_APP_URL}/?tg_id=${targetUserId}`;
        
        await bot.sendMessage(targetUserId,
          `🎉 *Ваша заявка одобрена!*\n\n` +
          `Теперь вы зарегистрированы как ${roleForUser}.\n\n` +
          `Нажмите кнопку ниже, чтобы открыть приложение:`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[
                {
                  text: '📱 Открыть приложение',
                  web_app: { url: webAppUrl }
                }
              ]]
            }
          }
        );
        
        console.log(`✅ Пользователь ${targetUserId} одобрен как ${roleForUser}`);
      } else {
        await bot.sendMessage(targetUserId,
          `❌ *Ваша заявка отклонена*\n\n` +
          `К сожалению, администратор отклонил вашу заявку.\n` +
          `Если это ошибка, свяжитесь с администратором.`
        );
        
        console.log(`❌ Заявка пользователя ${targetUserId} отклонена`);
      }
    } catch (notifyError) {
      console.error('❌ Не удалось уведомить пользователя:', notifyError);
    }
    
    await bot.answerCallbackQuery(query.id, { text: `Заявка ${statusText}` });
    
  } catch (error) {
    console.error('❌ Ошибка обработки действия админа:', error);
    await bot.answerCallbackQuery(query.id, { text: 'Произошла ошибка' });
  }
}

// Команда /admin для просмотра статистики
bot.onText(/\/admin/, async (msg) => {
  if (msg.from.id.toString() !== ADMIN_ID) {
    await bot.sendMessage(msg.chat.id, '⛔ У вас нет прав доступа');
    return;
  }
  
  try {
    // Получаем статистику из Supabase
    const statsResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/users?select=status,role`,
      { headers: createHeaders() }
    );
    
    let pending = 0;
    let activeTeachers = 0;
    let activeManagers = 0;
    
    if (statsResponse.ok) {
      const allUsers = await statsResponse.json();
      
      allUsers.forEach(user => {
        if (user.status === 'pending') pending++;
        if (user.status === 'active') {
          if (user.role === 'teacher') activeTeachers++;
          if (user.role === 'manager') activeManagers++;
        }
      });
    }
    
    let message = `👑 *Панель администратора*\n\n`;
    message += `⏳ *Ожидают одобрения:* ${pending}\n`;
    message += `👨‍🏫 *Активных учителей:* ${activeTeachers}\n`;
    message += `👨‍💼 *Активных менеджеров:* ${activeManagers}\n\n`;
    
    // Список ожидающих
    const pendingUsers = await getPendingUsers();
    
    if (pendingUsers.length > 0) {
      message += `*Последние заявки:*\n`;
      pendingUsers.forEach((user, index) => {
        const role = user.role === 'pending_teacher' ? '👨‍🏫 Учитель' : '👨‍💼 Менеджер';
        message += `${index + 1}. ${user.first_name} - ${role}\n`;
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
    'rejected': '❌ Отклонен'
  };
  
  const roleMap = {
    'pending_teacher': '👨‍🏫 Учитель (ожидание)',
    'pending_manager': '👨‍💼 Менеджер (ожидание)',
    'teacher': '👨‍🏫 Учитель',
    'manager': '👨‍💼 Менеджер'
  };
  
  const message = `
📋 *Ваши данные:*

👤 *Имя:* ${user.first_name}
🆔 *ID:* ${userId}
📝 *Username:* ${user.username || 'не указан'}
${roleMap[user.role] || user.role}
📊 *Статус:* ${statusMap[user.status] || user.status}
📅 *Зарегистрирован:* ${new Date(user.created_at).toLocaleDateString('ru-RU')}
  `;
  
  await bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
});

// ==================== API ДЛЯ ВЕБ-ПРИЛОЖЕНИЯ ====================

// API для проверки пользователя
app.get('/api/user/:telegramId', async (req, res) => {
  try {
    const user = await getUser(req.params.telegramId);
    
    if (!user) {
      return res.status(404).json({ 
        error: 'User not found',
        exists: false 
      });
    }
    
    res.json({
      exists: true,
      id: user.telegram_id,
      name: user.first_name,
      role: user.role.replace('pending_', ''),
      status: user.status,
      isActive: user.status === 'active',
      isTeacher: user.role === 'teacher' || user.role === 'pending_teacher',
      isManager: user.role === 'manager' || user.role === 'pending_manager',
      dbId: user.id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API для регистрации (если нужно из внешних систем)
app.post('/api/register', async (req, res) => {
  try {
    const { telegram_id, full_name, role } = req.body;
    
    if (!telegram_id || !full_name) {
      return res.status(400).json({ error: 'telegram_id и full_name обязательны' });
    }
    
    const user = await createUser({
      telegram_id: telegram_id,
      telegram_username: req.body.username || null,
      full_name: full_name,
      role: role || 'pending_teacher',
      status: 'pending'
    });
    
    if (user) {
      res.json({ 
        success: true, 
        message: 'Пользователь зарегистрирован',
        userId: user.id 
      });
    } else {
      res.status(500).json({ error: 'Не удалось создать пользователя' });
    }
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Статус сервера
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>🤖 Школьный Telegram Бот</title>
        <meta charset="utf-8">
        <style>
          body { 
            font-family: 'Arial', sans-serif; 
            max-width: 800px; 
            margin: 0 auto; 
            padding: 20px; 
            background: #f5f5f5;
            color: #333;
          }
          .container {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          .status { 
            background: #4CAF50; 
            color: white; 
            padding: 15px; 
            border-radius: 5px;
            text-align: center;
            font-size: 18px;
            margin-bottom: 20px;
          }
          .info { 
            margin: 20px 0; 
            padding: 15px;
            background: #f9f9f9;
            border-radius: 5px;
          }
          .info p {
            margin: 10px 0;
          }
          .bot-link {
            display: inline-block;
            background: #0088cc;
            color: white;
            padding: 10px 20px;
            border-radius: 5px;
            text-decoration: none;
            margin-top: 20px;
          }
          .bot-link:hover {
            background: #006699;
          }
          .db-status {
            background: #2196F3;
            color: white;
            padding: 10px;
            border-radius: 5px;
            margin: 10px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🤖 Школьный Telegram Бот</h1>
          <div class="status">✅ Бот работает и готов к регистрации</div>
          
          <div class="db-status">
            <strong>📦 База данных:</strong> Supabase PostgreSQL
          </div>
          
          <div class="info">
            <p><strong>👑 Админ ID:</strong> ${ADMIN_ID}</p>
            <p><strong>📱 Основное приложение:</strong> <a href="${MAIN_APP_URL}" target="_blank">${MAIN_APP_URL}</a></p>
            <p><strong>🌐 Режим работы:</strong> ${NODE_ENV}</p>
            <p><strong>🚀 Статус:</strong> Активен</p>
            <p><strong>📅 Время сервера:</strong> ${new Date().toLocaleString('ru-RU')}</p>
          </div>
          
          <h3>Как использовать:</h3>
          <ol>
            <li>Откройте Telegram и найдите бота</li>
            <li>Отправьте команду <code>/start</code></li>
            <li>Выберите роль (учитель/менеджер)</li>
            <li>Введите ФИО</li>
            <li>Админ получит заявку на одобрение</li>
            <li>После одобрения откроется приложение: ${MAIN_APP_URL}/?tg_id=ВАШ_ID</li>
          </ol>
          
          <h3>Важно:</h3>
          <p>Все данные сохраняются в общей базе Supabase. После одобрения:</p>
          <ul>
            <li>Учителя получают доступ к расписанию и предметам</li>
            <li>Данные доступны в основном приложении</li>
            <li>Каждый пользователь имеет свои данные</li>
          </ul>
        </div>
      </body>
    </html>
  `);
});

// ==================== ЗАПУСК СЕРВЕРА ====================

// Маршрут для вебхука Telegram
app.post('/webhook', (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Запускаем сервер
app.listen(PORT, async () => {
  console.log(`🌐 Сервер бота запущен на порту ${PORT}`);
  console.log(`📊 Статусная страница: http://localhost:${PORT}`);
  
  // Создаем таблицы если их нет
  await createTablesIfNotExist();
  
  // Настройка вебхука для продакшена
  if (NODE_ENV === 'production') {
    try {
      const webhookUrl = `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost:' + PORT}/webhook`;
      console.log(`🌐 Устанавливаем webhook: ${webhookUrl}`);
      
      await bot.setWebHook(webhookUrl);
      console.log('✅ Webhook установлен');
      
      // Удаляем polling если он был
      bot.stopPolling();
    } catch (error) {
      console.error('❌ Ошибка установки webhook:', error.message);
      console.log('⚠️  Запускаем polling режим');
      
      // Fallback на polling
      bot.startPolling();
    }
  } else {
    // В разработке используем polling
    console.log('🔁 Запускаем в режиме polling');
    bot.startPolling();
  }
});

// Создание таблиц в Supabase если их нет
async function createTablesIfNotExist() {
  try {
    console.log('🔧 Проверяем наличие таблиц в Supabase...');
    
    // Проверяем таблицу users
    const usersCheck = await fetch(
      `${SUPABASE_URL}/rest/v1/users?limit=1`,
      { headers: createHeaders() }
    );
    
    if (!usersCheck.ok && usersCheck.status === 404) {
      console.log('📝 Создаем таблицы через SQL Editor в Supabase Dashboard');
      console.log('💡 Выполните SQL из README.md в SQL Editor Supabase');
    } else {
      console.log('✅ Таблица users существует');
    }
    
  } catch (error) {
    console.error('❌ Ошибка проверки таблиц:', error.message);
  }
}

// Обработка ошибок
bot.on('polling_error', (error) => {
  console.error('❌ Polling error:', error.message);
});

bot.on('webhook_error', (error) => {
  console.error('❌ Webhook error:', error.message);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Получен SIGTERM, выключаемся...');
  process.exit(0);
});
