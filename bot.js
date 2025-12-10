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

// Конфигурация Supabase (ТА ЖЕ БАЗА!)
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

// Получить состояние пользователя
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

// Установить состояние пользователя
async function setUserState(telegramId, state, stepData = {}) {
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
          step_data: stepData
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
    return null;
  } catch (error) {
    console.error('Ошибка получения пользователя:', error);
    return null;
  }
}

// Создать пользователя (РЕГИСТРАЦИЯ УЧИТЕЛЯ)
async function createUser(userData) {
  try {
    const userType = userData.role === 'teacher' ? 'teacher' : 'manager';
    
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/users`,
      {
        method: 'POST',
        headers: createHeaders(true),
        body: JSON.stringify({
          telegram_id: userData.telegram_id,
          username: userData.telegram_username,
          first_name: userData.full_name,
          last_name: '',
          user_type: userType,
          status: 'pending',
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
    console.log(`✅ Пользователь создан: ${userData.telegram_id} (${userData.full_name}) как ${userType}`);
    return newUser[0];
    
  } catch (error) {
    console.error('Ошибка создания пользователя:', error);
    return null;
  }
}

// Обновить статус пользователя
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

// Создать профиль учителя (после одобрения)
async function createTeacherProfile(teacherId, fullName) {
  try {
    // Создаем профиль
    await fetch(
      `${SUPABASE_URL}/rest/v1/teacher_profiles`,
      {
        method: 'POST',
        headers: {
          ...createHeaders(true),
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({
          teacher_id: teacherId,
          gender: 'male',
          city: '',
          bio: `Преподаватель ${fullName}`,
          available_for_new_students: true
        })
      }
    );
    
    // Добавляем базовые предметы (математика и физика)
    const mathSubjects = await fetch(
      `${SUPABASE_URL}/rest/v1/subjects?category=eq.Математика&limit=3`,
      { headers: createHeaders() }
    ).then(r => r.ok ? r.json() : []);
    
    const physicsSubjects = await fetch(
      `${SUPABASE_URL}/rest/v1/subjects?category=eq.Физика&limit=2`,
      { headers: createHeaders() }
    ).then(r => r.ok ? r.json() : []);
    
    const allSubjects = [...mathSubjects, ...physicsSubjects];
    
    if (allSubjects.length > 0) {
      const subjectData = allSubjects.map(subject => ({
        teacher_id: teacherId,
        subject_id: subject.id,
        is_active: true,
        price_per_hour: 1500.00
      }));
      
      await fetch(
        `${SUPABASE_URL}/rest/v1/teacher_subjects`,
        {
          method: 'POST',
          headers: createHeaders(true),
          body: JSON.stringify(subjectData)
        }
      );
    }
    
    console.log(`📚 Создан профиль учителя ID: ${teacherId}`);
    
  } catch (error) {
    console.error('Ошибка создания профиля учителя:', error);
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
  
  console.log(`👤 /start от ${userId} (${username})`);
  
  // Проверяем существующего пользователя
  const existingUser = await getUser(userId);
  
  if (existingUser) {
    if (existingUser.status === 'active') {
      const userTypeText = existingUser.user_type === 'teacher' ? 'учитель' : 
                          existingUser.user_type === 'manager' ? 'менеджер' : 
                          existingUser.user_type;
      
      // СОЗДАЕМ ИНДИВИДУАЛЬНУЮ ССЫЛКУ ДЛЯ ЭТОГО УЧИТЕЛЯ
      const individualAppUrl = `${MAIN_APP_URL}/?tg_id=${userId}`;
      
      await bot.sendMessage(chatId, 
        `✅ Вы уже зарегистрированы как ${userTypeText}!\n\n` +
        `👤 Имя: ${existingUser.first_name}\n` +
        `🎯 Роль: ${userTypeText}\n` +
        `📊 Статус: Активен\n\n` +
        `Нажмите кнопку ниже, чтобы открыть ВАШЕ персональное приложение:`,
        {
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
      
      console.log(`🔗 Отправлена индивидуальная ссылка для ${userId}: ${individualAppUrl}`);
      return;
    }
    
    if (existingUser.status === 'pending') {
      await bot.sendMessage(chatId, 
        '⏳ Ваша заявка на рассмотрении. Ожидайте одобрения администратора.'
      );
      return;
    }
    
    if (existingUser.status === 'blocked') {
      await bot.sendMessage(chatId, 
        '❌ Ваш аккаунт заблокирован. Свяжитесь с администратором.'
      );
      return;
    }
  }
  
  // Новый пользователь - начинаем регистрацию
  await setUserState(userId, 'choosing_role');
  
  await bot.sendMessage(chatId,
    '👋 Добро пожаловать в систему расписания преподавателей!\n\n' +
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
      
      await setUserState(userId, 'entering_name', { role: role });
      await bot.deleteMessage(chatId, query.message.message_id);
      
      const roleText = role === 'teacher' ? 'учитель' : 'менеджер';
      
      await bot.sendMessage(chatId,
        `${role === 'teacher' ? '👨‍🏫' : '👨‍💼'} Отлично! Вы выбрали роль "${roleText}".\n\n` +
        `Теперь введите ваше ФИО (полное имя и фамилия):\n\n` +
        `Пример: <code>Иванов Иван Иванович</code>`,
        { parse_mode: 'HTML' }
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

// Обработка текстовых сообщений (ВВОД ИМЕНИ УЧИТЕЛЯ)
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const text = msg.text.trim();
  
  const userState = await getUserState(userId);
  
  if (userState && userState.state === 'entering_name') {
    if (text.length < 3) {
      await bot.sendMessage(chatId, '❌ Пожалуйста, введите корректное ФИО (минимум 3 символа)');
      return;
    }
    
    try {
      const stepData = userState.step_data || {};
      const role = stepData.role || 'teacher';
      
      // СОЗДАЕМ УЧИТЕЛЯ В БАЗЕ ДАННЫХ
      const newUser = await createUser({
        telegram_id: userId,
        telegram_username: msg.from.username || null,
        full_name: text,
        role: role
      });
      
      if (!newUser) {
        throw new Error('Не удалось создать пользователя');
      }
      
      // Отправляем заявку админу
      await sendAdminNotification(userId, text, role);
      
      // Очищаем состояние
      await deleteUserState(userId);
      
      // Уведомляем пользователя
      const roleText = role === 'teacher' ? 'учителя' : 'менеджера';
      
      await bot.sendMessage(chatId,
        `✅ *Ваша заявка отправлена!*\n\n` +
        `👤 *Ваше имя:* ${text}\n` +
        `🎯 *Роль:* ${roleText}\n` +
        `🕐 *Статус:* Ожидание одобрения\n\n` +
        `Администратор получил вашу заявку и скоро рассмотрит её.\n` +
        `После одобрения вы получите ссылку на ваше персональное приложение.`,
        { parse_mode: 'Markdown' }
      );
      
      console.log(`📝 Новая заявка от ${userId} (${text}) как ${roleText}`);
      
    } catch (error) {
      console.error('❌ Ошибка регистрации:', error);
      await bot.sendMessage(chatId, 
        '❌ Произошла ошибка при обработке заявки. Попробуйте позже или свяжитесь с администратором.'
      );
    }
  }
});

// Отправка уведомления админу о новой заявке
async function sendAdminNotification(userId, fullName, role) {
  try {
    const user = await getUser(userId);
    const username = user?.username || 'не указан';
    const roleText = role === 'teacher' ? 'учителя' : 'менеджера';
    
    const message = `
📋 *НОВАЯ ЗАЯВКА НА РЕГИСТРАЦИЮ*

👤 *Пользователь:* ${fullName}
🆔 *ID:* ${userId}
📝 *Username:* @${username}
👨‍🏫 *Роль:* ${roleText}
🕐 *Время:* ${new Date().toLocaleString('ru-RU')}

*После одобрения пользователь получит:*
• 📱 Ссылку на индивидуальное приложение
• 📅 Доступ к своему расписанию
• 📚 Возможность настраивать предметы
• 👥 Управление заявками учеников

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

// Обработка действий админа (ОДОБРЕНИЕ/ОТКЛОНЕНИЕ)
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
    const roleText = targetUser.user_type === 'teacher' ? 'учитель' : 'менеджер';
    const statusText = isApproved ? 'одобрен' : 'отклонен';
    const emoji = isApproved ? '✅' : '❌';
    
    await bot.editMessageText(
      `${emoji} *Заявка обработана*\n\n` +
      `👤 *Имя:* ${targetUser.first_name}\n` +
      `🆔 *ID:* ${targetUserId}\n` +
      `👨‍🏫 *Роль:* ${roleText}\n` +
      `📊 *Статус:* ${statusText}\n` +
      `⏱️ *Время:* ${new Date().toLocaleString('ru-RU')}\n\n` +
      `${isApproved ? `🔗 *Ссылка для пользователя:* ${MAIN_APP_URL}/?tg_id=${targetUserId}` : ''}`,
      {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'Markdown'
      }
    );
    
    // Уведомляем пользователя
    try {
      if (isApproved) {
        const userTypeText = targetUser.user_type === 'teacher' ? 'учитель' : 'менеджер';
        
        // Если учитель - создаем для него профиль и предметы
        if (targetUser.user_type === 'teacher') {
          await createTeacherProfile(targetUser.id, targetUser.first_name);
        }
        
        // СОЗДАЕМ ИНДИВИДУАЛЬНУЮ ССЫЛКУ ДЛЯ ЭТОГО ПОЛЬЗОВАТЕЛЯ
        const individualAppUrl = `${MAIN_APP_URL}/?tg_id=${targetUserId}`;
        
        await bot.sendMessage(targetUserId,
          `🎉 *Поздравляем! Ваша заявка одобрена!*\n\n` +
          `Теперь вы зарегистрированы как ${userTypeText}.\n\n` +
          `📱 *Ваше персональное приложение:*\n` +
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
        
        console.log(`✅ Пользователь ${targetUserId} одобрен как ${userTypeText}`);
        console.log(`🔗 Индивидуальная ссылка: ${individualAppUrl}`);
        
      } else {
        await bot.sendMessage(targetUserId,
          `❌ *Ваша заявка отклонена*\n\n` +
          `К сожалению, администратор отклонил вашу заявку на регистрацию.\n\n` +
          `*Возможные причины:*\n` +
          `• Неполная информация\n` +
          `• Ошибка в данных\n` +
          `• Другая причина\n\n` +
          `Если вы считаете это ошибкой, свяжитесь с администратором.`
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
    'inactive': '💤 Неактивен'
  };
  
  const roleMap = {
    'teacher': '👨‍🏫 Учитель',
    'manager': '👨‍💼 Менеджер',
    'admin': '👑 Администратор',
    'student': '👨‍🎓 Ученик'
  };
  
  const message = `
📋 *Ваши данные:*

👤 *Имя:* ${user.first_name}
🆔 *Telegram ID:* ${userId}
📝 *Username:* ${user.username || 'не указан'}
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

// ==================== API ДЛЯ ВЕБ-ПРИЛОЖЕНИЯ ====================

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
      telegramId: user.telegram_id,
      firstName: user.first_name,
      userType: user.user_type,
      status: user.status,
      isActive: user.status === 'active',
      isTeacher: user.user_type === 'teacher',
      isManager: user.user_type === 'manager',
      createdAt: user.created_at
    });
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
          .teacher-example {
            background: #9C27B0;
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
          
          <div class="teacher-example">
            <strong>🎯 Индивидуальные приложения:</strong> Каждый учитель получает свою ссылку
          </div>
          
          <div class="info">
            <p><strong>👑 Админ ID:</strong> ${ADMIN_ID}</p>
            <p><strong>📱 Основное приложение:</strong> <a href="${MAIN_APP_URL}" target="_blank">${MAIN_APP_URL}</a></p>
            <p><strong>🌐 Режим работы:</strong> ${NODE_ENV}</p>
            <p><strong>🚀 Статус:</strong> Активен</p>
            <p><strong>📅 Время сервера:</strong> ${new Date().toLocaleString('ru-RU')}</p>
          </div>
          
          <h3>Как работает система:</h3>
          <ol>
            <li>Учитель пишет <code>/start</code> в боте</li>
            <li>Выбирает роль "Учитель" и вводит ФИО</li>
            <li>Админ получает заявку и одобряет её</li>
            <li>Учитель получает <strong>индивидуальную ссылку</strong></li>
            <li>По этой ссылке открывается его персональное приложение</li>
          </ol>
          
          <h3>Что есть в индивидуальном приложении:</h3>
          <ul>
            <li>📅 Собственное расписание (только его)</li>
            <li>📚 Его предметы (настраивает сам)</li>
            <li>👥 Его ученики и заявки</li>
            <li>📊 Его статистика</li>
            <li>⚙️ Его настройки</li>
          </ul>
          
          <p><strong>Пример индивидуальной ссылки учителя:</strong></p>
          <code>${MAIN_APP_URL}/?tg_id=987654321</code>
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
  console.log(`👨‍🏫 Пример индивидуальной ссылки: ${MAIN_APP_URL}/?tg_id=987654321`);
  
  // Настройка вебхука для продакшена
  if (NODE_ENV === 'production') {
    try {
      const webhookUrl = `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost:' + PORT}/webhook`;
      console.log(`🌐 Устанавливаем webhook: ${webhookUrl}`);
      
      await bot.setWebHook(webhookUrl);
      console.log('✅ Webhook установлен');
      
      bot.stopPolling();
    } catch (error) {
      console.error('❌ Ошибка установки webhook:', error.message);
      console.log('⚠️  Запускаем polling режим');
      bot.startPolling();
    }
  } else {
    console.log('🔁 Запускаем в режиме polling');
    bot.startPolling();
  }
});

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
