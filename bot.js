const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fetch = require('node-fetch');
require('dotenv').config();

// ==================== КОНФИГУРАЦИЯ ====================
const BOT_TOKEN = process.env.BOT_TOKEN || '8203853124:AAHQmyBWNp1MdSR9B9bOMGbR8X1k6z6P08A';
const ADMIN_ID = process.env.ADMIN_ID || '913096324';
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'production';

// URL вашего основного приложения на Vercel
const MAIN_APP_URL = process.env.MAIN_APP_URL || 'https://school-mini-app1.vercel.app';

// Конфигурация Supabase (те же данные, что в server.js)
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rtywenfvaoxsjdkulmdk.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_WhiVd5day72hRoTKiFtiIQ_sP2wu4_S';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0eXdlbmZ2YW94c2pka3VsbWRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTM3NzEzNiwiZXhwIjoyMDgwOTUzMTM2fQ.wy2D8H0mS-c1JqJFF2O-IPk3bgvVLMjHJUTzRX2fx-0';

// Заголовки для Supabase
const createHeaders = (useServiceKey = false) => ({
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${useServiceKey ? SUPABASE_SERVICE_KEY : SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal'
});

console.log('🚀 Запуск Telegram бота...');
console.log(`👑 Админ ID: ${ADMIN_ID}`);
console.log(`📱 Основное приложение: ${MAIN_APP_URL}`);
console.log(`🌐 Режим: ${NODE_ENV}`);
console.log(`🗄️  Supabase: ${SUPABASE_URL}`);

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
const bot = new TelegramBot(BOT_TOKEN);
const app = express();
app.use(express.json());

// База данных SQLite (для бота - хранение заявок)
const db = new sqlite3.Database(path.join(__dirname, 'school.db'));

// Создаем таблицы при первом запуске
db.serialize(() => {
    // Таблица пользователей (для заявок)
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            telegram_id TEXT UNIQUE NOT NULL,
            telegram_username TEXT,
            full_name TEXT NOT NULL,
            role TEXT CHECK(role IN ('teacher', 'manager', 'pending_teacher', 'pending_manager')),
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            approved_at TIMESTAMP,
            approved_by TEXT
        )
    `);
    
    // Таблица состояний пользователей (для регистрации)
    db.run(`
        CREATE TABLE IF NOT EXISTS user_states (
            telegram_id TEXT PRIMARY KEY,
            state TEXT,
            temp_data TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    console.log('✅ База данных инициализирована');
});

// ==================== ФУНКЦИИ ДЛЯ SUPABASE ====================

/**
 * Сохранить пользователя в Supabase после одобрения
 */
async function saveUserToSupabase(telegramId, firstName, lastName, role, username = null) {
  try {
    // Сначала проверяем, существует ли пользователь
    const existingUser = await checkUserInSupabase(telegramId);
    if (existingUser) {
      console.log(`ℹ️  Пользователь ${telegramId} уже существует в Supabase`);
      // Обновляем статус на approved, если нужно
      if (!existingUser.approved) {
        const updateResponse = await fetch(
          `${SUPABASE_URL}/rest/v1/users?telegram_id=eq.${telegramId}`,
          {
            method: 'PATCH',
            headers: createHeaders(true),
            body: JSON.stringify({ approved: true })
          }
        );
        if (updateResponse.ok) {
          console.log(`✅ Статус пользователя обновлен на approved`);
        }
      }
      return { success: true, user: existingUser, userId: existingUser.id };
    }
    
    // Определяем окончательную роль (без 'pending_')
    const finalRole = role.replace('pending_', '');
    
    // Разделяем ФИО на имя и фамилию
    const nameParts = firstName.trim().split(/\s+/);
    const first_name = nameParts[0] || firstName;
    const last_name = nameParts.slice(1).join(' ') || lastName || null;
    
    const userData = {
      telegram_id: telegramId.toString(),
      first_name: first_name,
      last_name: last_name,
      username: username || null,
      role: finalRole, // 'teacher' или 'manager'
      approved: true
    };

    console.log(`💾 Сохранение пользователя в Supabase:`, userData);

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/users`,
      {
        method: 'POST',
        headers: createHeaders(true), // Используем service key для записи
        body: JSON.stringify(userData)
      }
    );

    // Проверяем статус ответа
    if (!response.ok) {
      const errorText = await response.text();
      // Если ошибка "duplicate key" - пользователь уже существует, это нормально
      if (errorText.includes('duplicate') || errorText.includes('unique')) {
        console.log(`ℹ️  Пользователь уже существует, получаем его данные...`);
        const existing = await checkUserInSupabase(telegramId);
        if (existing) {
          return { success: true, user: existing, userId: existing.id };
        }
      }
      console.error('❌ Ошибка сохранения пользователя в Supabase:', errorText);
      return { success: false, error: errorText };
    }

    // Supabase с return=minimal может вернуть пустой ответ или массив
    let newUser;
    const responseText = await response.text();
    
    if (responseText) {
      try {
        newUser = JSON.parse(responseText);
      } catch (e) {
        // Если не JSON, проверяем существование пользователя
        console.log(`ℹ️  Пустой ответ от Supabase, проверяем существование пользователя...`);
        const existing = await checkUserInSupabase(telegramId);
        if (existing) {
          newUser = existing;
        } else {
          // Пытаемся получить пользователя по telegram_id
          const getUserResponse = await fetch(
            `${SUPABASE_URL}/rest/v1/users?telegram_id=eq.${telegramId}&select=*`,
            { headers: createHeaders() }
          );
          if (getUserResponse.ok) {
            const users = await getUserResponse.json();
            if (users.length > 0) {
              newUser = users[0];
            }
          }
        }
      }
    } else {
      // Пустой ответ - проверяем, создался ли пользователь
      console.log(`ℹ️  Пустой ответ от Supabase, проверяем создание пользователя...`);
      const existing = await checkUserInSupabase(telegramId);
      if (existing) {
        newUser = existing;
      }
    }

    if (!newUser) {
      console.error('❌ Не удалось получить данные созданного пользователя');
      return { success: false, error: 'User created but data not retrieved' };
    }

    const userId = newUser.id || newUser[0]?.id;
    console.log('✅ Пользователь сохранен в Supabase с ID:', userId);
    
    // Если это преподаватель, создаем профиль
    if (finalRole === 'teacher' && userId) {
      await createTeacherProfile(userId);
    }

    return { success: true, user: newUser, userId: userId };
  } catch (error) {
    console.error('❌ Ошибка при сохранении пользователя в Supabase:', error);
    // Даже при ошибке проверяем, может пользователь все равно создался
    const existing = await checkUserInSupabase(telegramId);
    if (existing) {
      console.log(`✅ Пользователь найден после ошибки, возвращаем успех`);
      return { success: true, user: existing, userId: existing.id };
    }
    return { success: false, error: error.message };
  }
}

/**
 * Создать профиль преподавателя в Supabase
 */
async function createTeacherProfile(teacherId) {
  try {
    const profileData = {
      teacher_id: teacherId,
      gender: 'Мужской' // По умолчанию, можно изменить позже
    };

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/teacher_profiles`,
      {
        method: 'POST',
        headers: createHeaders(true),
        body: JSON.stringify(profileData)
      }
    );

    if (response.ok) {
      console.log('✅ Профиль преподавателя создан в Supabase');
    } else {
      const errorText = await response.text();
      console.error('⚠️  Ошибка создания профиля (может уже существовать):', errorText);
    }
  } catch (error) {
    console.error('❌ Ошибка создания профиля:', error);
  }
}

/**
 * Проверить, существует ли пользователь в Supabase
 */
async function checkUserInSupabase(telegramId) {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/users?telegram_id=eq.${telegramId}&select=id,approved,role,first_name,last_name`,
      { headers: createHeaders() }
    );

    if (response.ok) {
      const users = await response.json();
      if (users.length > 0) {
        return users[0];
      }
    }
    return null;
  } catch (error) {
    console.error('❌ Ошибка проверки пользователя в Supabase:', error);
    return null;
  }
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

// Получить состояние пользователя
function getUserState(telegramId) {
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT * FROM user_states WHERE telegram_id = ?',
            [telegramId],
            (err, row) => {
                if (err) reject(err);
                else resolve(row);
            }
        );
    });
}

// Установить состояние пользователя
function setUserState(telegramId, state, tempData = null) {
    return new Promise((resolve, reject) => {
        db.run(
            'INSERT OR REPLACE INTO user_states (telegram_id, state, temp_data) VALUES (?, ?, ?)',
            [telegramId, state, tempData],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });
}

// Удалить состояние пользователя
function deleteUserState(telegramId) {
    return new Promise((resolve, reject) => {
        db.run(
            'DELETE FROM user_states WHERE telegram_id = ?',
            [telegramId],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });
}

// Получить пользователя из БД
function getUser(telegramId) {
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT * FROM users WHERE telegram_id = ?',
            [telegramId],
            (err, row) => {
                if (err) reject(err);
                else resolve(row);
            }
        );
    });
}

// Создать пользователя
function createUser(data) {
    return new Promise((resolve, reject) => {
        const sql = `
            INSERT INTO users (telegram_id, telegram_username, full_name, role, status)
            VALUES (?, ?, ?, ?, ?)
        `;
        db.run(sql, [
            data.telegram_id,
            data.telegram_username,
            data.full_name,
            data.role,
            'pending'
        ], function(err) {
            if (err) reject(err);
            else resolve(this.lastID);
        });
    });
}

// Обновить статус пользователя
function updateUserStatus(telegramId, status, approvedBy = null) {
    return new Promise((resolve, reject) => {
        const sql = `
            UPDATE users 
            SET status = ?, 
                approved_at = CASE WHEN ? = 'active' THEN CURRENT_TIMESTAMP ELSE NULL END,
                approved_by = ?
            WHERE telegram_id = ?
        `;
        db.run(sql, [status, status, approvedBy, telegramId], function(err) {
            if (err) reject(err);
            else resolve(this.changes);
        });
    });
}

// Получить всех ожидающих пользователей
function getPendingUsers() {
    return new Promise((resolve, reject) => {
        db.all(
            "SELECT * FROM users WHERE status = 'pending' ORDER BY created_at DESC",
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            }
        );
    });
}

// ==================== КОМАНДЫ БОТА ====================

// Команда /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const username = msg.from.username || 'без_username';
    
    console.log(`👤 /start от ${userId} (${username})`);
    
    // Сначала проверяем в Supabase (основная БД)
    const supabaseUser = await checkUserInSupabase(userId);
    
    if (supabaseUser && supabaseUser.approved) {
        const roleText = supabaseUser.role === 'teacher' ? 'учитель' : 'менеджер';
        
        // Создаем URL с tgId для открытия приложения
        const webAppUrl = `${MAIN_APP_URL}/?tgId=${userId}`;
        
        await bot.sendMessage(chatId, 
            `✅ Вы уже зарегистрированы как ${roleText}!\n\n` +
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
    
    // Проверяем существующего пользователя в локальной БД
    const existingUser = await getUser(userId);
    
    if (existingUser) {
        if (existingUser.status === 'active') {
            // Пользователь одобрен в боте, но не в Supabase - синхронизируем
            const supabaseResult = await saveUserToSupabase(
                userId,
                existingUser.full_name,
                '',
                existingUser.role,
                existingUser.telegram_username
            );
            
            if (supabaseResult.success) {
                const roleText = existingUser.role.includes('teacher') ? 'учитель' : 'менеджер';
                const webAppUrl = `${MAIN_APP_URL}/?tgId=${userId}`;
                
                await bot.sendMessage(chatId, 
                    `✅ Вы зарегистрированы как ${roleText}!\n\n` +
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

// Обработка текстовых сообщений
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
            
            // Создаем пользователя в базе бота
            await createUser({
                telegram_id: userId,
                telegram_username: msg.from.username || null,
                full_name: text,
                role: role
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
        const username = user?.telegram_username || 'не указан';
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
        await updateUserStatus(targetUserId, newStatus, adminId);
        
        // Обновляем сообщение у админа
        const roleText = targetUser.role.includes('teacher') ? 'учитель' : 'менеджер';
        const statusText = isApproved ? 'одобрен' : 'отклонен';
        const emoji = isApproved ? '✅' : '❌';
        
        await bot.editMessageText(
            `${emoji} *Заявка обработана*\n\n` +
            `👤 ${targetUser.full_name}\n` +
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
                // Сохраняем в Supabase
                const supabaseResult = await saveUserToSupabase(
                    targetUserId,
                    targetUser.full_name,
                    '',
                    targetUser.role,
                    targetUser.telegram_username
                );
                
                // Проверяем результат или наличие пользователя в Supabase
                let userSaved = supabaseResult.success;
                
                // Если была ошибка, проверяем, может пользователь все равно создался
                if (!userSaved) {
                    console.log(`⚠️  Проверяем, создался ли пользователь несмотря на ошибку...`);
                    const checkUser = await checkUserInSupabase(targetUserId);
                    if (checkUser && checkUser.approved) {
                        console.log(`✅ Пользователь найден в Supabase, считаем успехом`);
                        userSaved = true;
                    }
                }
                
                if (userSaved) {
                    console.log(`✅ Пользователь ${targetUserId} сохранен в Supabase`);
                    
                    const roleForUser = targetUser.role.includes('teacher') ? 'учитель' : 'менеджер';
                    const webAppUrl = `${MAIN_APP_URL}/?tgId=${targetUserId}`;
                    
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
                    console.error(`❌ Ошибка сохранения в Supabase:`, supabaseResult.error);
                    // Даже при ошибке отправляем сообщение, но предупреждаем
                    const roleForUser = targetUser.role.includes('teacher') ? 'учитель' : 'менеджер';
                    const webAppUrl = `${MAIN_APP_URL}/?tgId=${targetUserId}`;
                    
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
                    
                    console.log(`⚠️  Пользователь уведомлен, но была ошибка при сохранении в Supabase`);
                }
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
        // Получаем статистику
        const stats = await new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
                    COUNT(CASE WHEN status = 'active' AND role LIKE '%teacher%' THEN 1 END) as active_teachers,
                    COUNT(CASE WHEN status = 'active' AND role LIKE '%manager%' THEN 1 END) as active_managers
                FROM users
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows[0]);
            });
        });
        
        let message = `👑 *Панель администратора*\n\n`;
        message += `⏳ *Ожидают одобрения:* ${stats.pending || 0}\n`;
        message += `👨‍🏫 *Активных учителей:* ${stats.active_teachers || 0}\n`;
        message += `👨‍💼 *Активных менеджеров:* ${stats.active_managers || 0}\n\n`;
        
        // Список ожидающих
        const pendingUsers = await getPendingUsers();
        
        if (pendingUsers.length > 0) {
            message += `*Последние заявки:*\n`;
            pendingUsers.forEach((user, index) => {
                const role = user.role.includes('teacher') ? '👨‍🏫 Учитель' : '👨‍💼 Менеджер';
                message += `${index + 1}. ${user.full_name} - ${role}\n`;
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

👤 *Имя:* ${user.full_name}
🆔 *ID:* ${userId}
📝 *Username:* ${user.telegram_username || 'не указан'}
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
            name: user.full_name,
            role: user.role.replace('pending_', ''),
            status: user.status,
            isActive: user.status === 'active',
            isTeacher: user.role.includes('teacher'),
            isManager: user.role.includes('manager')
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
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🤖 Школьный Telegram Бот</h1>
                    <div class="status">✅ Бот работает и готов к регистрации</div>
                    
                    <div class="info">
                        <p><strong>👑 Админ ID:</strong> ${ADMIN_ID}</p>
                        <p><strong>📱 Основное приложение:</strong> <a href="${MAIN_APP_URL}" target="_blank">${MAIN_APP_URL}</a></p>
                        <p><strong>🗄️  Supabase:</strong> ${SUPABASE_URL}</p>
                        <p><strong>🌐 Режим работы:</strong> ${NODE_ENV}</p>
                        <p><strong>🚀 Статус:</strong> Активен</p>
                        <p><strong>📅 Время сервера:</strong> ${new Date().toLocaleString('ru-RU')}</p>
                    </div>
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
    db.close();
    process.exit(0);
});


