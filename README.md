# 🤖 School Telegram Registration Bot

Telegram bot for registering teachers and managers in the school schedule system.

## 🚀 Quick Deploy on Render

1. **Fork this repository** to your GitHub account
2. **Go to [Render.com](https://render.com)** and sign up
3. Click **"New +"** → **"Web Service"**
4. Connect your GitHub repository
5. Configure:
   - **Name:** `school-telegram-bot`
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node bot.js`
6. Add environment variables:
   - `BOT_TOKEN` = `your_bot_token_from_BotFather`
   - `ADMIN_ID` = `913096324`
   - `NODE_ENV` = `production`
7. Click **"Create Web Service"**

## 📦 Local Development

1. Clone repository:
```bash
git clone https://github.com/yourusername/school-telegram-bot.git
cd school-telegram-bot
