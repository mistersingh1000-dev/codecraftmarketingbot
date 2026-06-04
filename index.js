require('dotenv').config();
const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const { google } = require('googleapis');

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(id => parseInt(id.trim()));
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const PORT = process.env.PORT || 3000;

const UPI_ID = "9501216365@amazonpay";
const BINANCE_ID = "527519624";
const WHATSAPP_GROUP = "https://chat.whatsapp.com/DoOkEt2FTfuHRhrQRK3mr4";
const TELEGRAM_CHANNEL = "https://t.me/whatsappbulkmessage";
const WHATSAPP_CONTACT = "wa.me/917009732517";
const TELEGRAM_CONTACT = "https://t.me/digialmarketing";
const PHONE_NUMBER = "+91 70097 32517";

const bot = new Telegraf(BOT_TOKEN);
const userSessions = new Map();

let productsCache = [];
let cacheTimestamp = 0;
const CACHE_TTL = 300000;

function getAuth() {
  return new google.auth.JWT(
    GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    GOOGLE_PRIVATE_KEY,
    ['https://www.googleapis.com/auth/spreadsheets']
  );
}

async function getProducts() {
  try {
    if (productsCache.length > 0 && Date.now() - cacheTimestamp < CACHE_TTL) {
      return productsCache;
    }

    const sheets = google.sheets({ version: 'v4', auth: getAuth() });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: 'Products!A1:G1000',
    });

    const rows = res.data.values || [];
    if (rows.length < 2) return [];

    const headers = rows[0];
    const products = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[0]) continue;

      const product = {};
      headers.forEach((h, idx) => {
        product[h] = row[idx] || '';
      });

      if (product.ActiveStatus === 'TRUE' || product.ActiveStatus === 'true') {
        products.push(product);
      }
    }

    productsCache = products;
    cacheTimestamp = Date.now();
    return products;
  } catch (err) {
    console.error('Error fetching products:', err.message);
    return [];
  }
}

async function sendFeedbackToAdmin(userId, userName, feedback, productInterest) {
  try {
    const adminId = ADMIN_IDS[0];
    if (!adminId) return;

    const message = `📋 <b>NEW CUSTOMER FEEDBACK</b>\n\n` +
      `👤 <b>User:</b> ${userName} (ID: ${userId})\n` +
      `🎯 <b>Interested In:</b> ${productInterest}\n` +
      `💬 <b>Feedback:</b>\n${feedback}`;

    await bot.telegram.sendMessage(adminId, message, { parse_mode: 'HTML' });
  } catch (err) {
    console.error('Error sending feedback:', err.message);
  }
}

bot.command('start', async (ctx) => {
  const userId = ctx.from.id;
  const userName = ctx.from.first_name || 'Friend';

  userSessions.set(userId, {
    name: userName,
    stage: 'welcome',
  });

  const text = `👋 <b>Welcome to CodeCraft Marketing!</b>\n\n` +
    `🛒 <b>Your Digital Products Store</b>\n\n` +
    `📋 <b>What We Offer:</b>\n` +
    `✅ Adobe Creative Suite\n` +
    `✅ Microsoft Office\n` +
    `✅ WordPress Themes\n` +
    `✅ Android Apps\n\n` +
    `🚀 <b>How It Works:</b>\n` +
    `1️⃣ Browse Products\n` +
    `2️⃣ Choose What You Need\n` +
    `3️⃣ Make Payment (UPI/Crypto)\n` +
    `4️⃣ Get Instant Access\n\n` +
    `Ready to explore?`;

  const buttons = Markup.inlineKeyboard([
    [{ text: '🛍 Browse Products', callback_data: 'browse' }],
    [{ text: '❓ Need Something Specific?', callback_data: 'request' }],
    [{ text: '📞 Contact Us', callback_data: 'contact' }],
  ]);

  await ctx.reply(text, { parse_mode: 'HTML', ...buttons });
});

bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;

  if (data === 'browse') {
    await ctx.answerCbQuery('Loading products...');
    const products = await getProducts();

    if (products.length === 0) {
      return ctx.reply('📭 No products available');
    }

    let text = '🛍 <b>OUR PRODUCTS</b>\n\n';
    const buttons = [];

    for (const product of products) {
      const name = product.ProductName || 'Unnamed';
      const price = product.YourPrice || '0';
      text += `💾 ${name} - ₹${price}\n`;
      buttons.push([{ text: `${name} - ₹${price}`, callback_data: `product_${product.ProductID}` }]);
    }

    buttons.push([{ text: '↩️ Back', callback_data: 'back' }]);

    await ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) })
      .catch(() => ctx.reply(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }));
  }

  if (data.startsWith('product_')) {
    await ctx.answerCbQuery();
    const productId = data.replace('product_', '');
    const products = await getProducts();
    const product = products.find(p => p.ProductID === productId);

    if (!product) return ctx.reply('❌ Product not found');

    const text = `<b>${product.ProductName}</b>\n\n` +
      `📝 <b>Description:</b>\n${product.Description}\n\n` +
      `💰 <b>Pricing:</b>\n` +
      `Original: <s>₹${product.OriginalPrice}</s>\n` +
      `<b>Our Price: ₹${product.YourPrice}</b>\n\n` +
      `Ready to buy?`;

    const buttons = Markup.inlineKeyboard([
      [{ text: '✅ Yes, Buy Now!', callback_data: `buy_${productId}` }],
      [{ text: '❌ Show More Products', callback_data: 'browse' }],
    ]);

    await ctx.editMessageText(text, { parse_mode: 'HTML', ...buttons })
      .catch(() => ctx.reply(text, { parse_mode: 'HTML', ...buttons }));
  }

  if (data.startsWith('buy_')) {
    await ctx.answerCbQuery();
    const productId = data.replace('buy_', '');
    const products = await getProducts();
    const product = products.find(p => p.ProductID === productId);

    if (!product) return ctx.reply('❌ Product not found');

    const orderId = `ORD-${Date.now()}`;

    const text = `✅ <b>ORDER CONFIRMED!</b>\n\n` +
      `📦 <b>Product:</b> ${product.ProductName}\n` +
      `💰 <b>Amount:</b> ₹${product.YourPrice}\n` +
      `🎫 <b>Order ID:</b> <code>${orderId}</code>\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `💳 <b>PAYMENT</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📱 <b>UPI:</b> <code>${UPI_ID}</code>\n\n` +
      `💰 <b>Binance ID:</b> <code>${BINANCE_ID}</code>\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📸 <b>After Payment:</b>\n` +
      `1. Take screenshot\n` +
      `2. Send to WhatsApp\n` +
      `3. We'll deliver in 4-6 hours\n\n` +
      `👥 WhatsApp: ${WHATSAPP_CONTACT}\n` +
      `💬 Telegram: ${TELEGRAM_CONTACT}\n` +
      `☎️ Phone: ${PHONE_NUMBER}\n\n` +
      `🎁 <b>Join our community for updates!</b>`;

    const buttons = Markup.inlineKeyboard([
      [{ text: '👥 Join WhatsApp', url: WHATSAPP_GROUP }],
      [{ text: '🌐 Join Telegram', url: TELEGRAM_CHANNEL }],
      [{ text: '📱 Send Screenshot', url: WHATSAPP_CONTACT }],
    ]);

    await ctx.reply(text, { parse_mode: 'HTML', ...buttons });
  }

  if (data === 'request') {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const session = userSessions.get(userId) || {};
    session.stage = 'awaiting_request';
    userSessions.set(userId, session);

    await ctx.reply('❓ <b>What do you need?</b>\n\nType your requirement:', { parse_mode: 'HTML' });
  }

  if (data === 'contact') {
    await ctx.answerCbQuery();
    const text = `📞 <b>CONTACT US</b>\n\n` +
      `👥 WhatsApp Group: ${WHATSAPP_GROUP}\n` +
      `📱 WhatsApp: ${WHATSAPP_CONTACT}\n` +
      `🌐 Telegram: ${TELEGRAM_CHANNEL}\n` +
      `💬 Telegram: ${TELEGRAM_CONTACT}\n` +
      `☎️ Phone: ${PHONE_NUMBER}`;

    await ctx.editMessageText(text, { parse_mode: 'HTML' })
      .catch(() => ctx.reply(text, { parse_mode: 'HTML' }));
  }

  if (data === 'back') {
    await ctx.answerCbQuery();
    await bot.telegram.sendMessage(ctx.from.id, '/start');
  }
});

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const session = userSessions.get(userId);

  if (session && session.stage === 'awaiting_request') {
    const userRequest = ctx.message.text;
    const userName = ctx.from.first_name || 'User';

    await sendFeedbackToAdmin(userId, userName, 'No feedback', userRequest);

    const text = `✅ <b>Thank You!</b>\n\n` +
      `We received your request:\n` +
      `<b>📌 Need:</b> ${userRequest}\n\n` +
      `🎯 We'll contact you soon!\n\n` +
      `📞 Stay connected:`;

    const buttons = Markup.inlineKeyboard([
      [{ text: '👥 WhatsApp Group', url: WHATSAPP_GROUP }],
      [{ text: '🌐 Telegram Channel', url: TELEGRAM_CHANNEL }],
      [{ text: '🛍 Browse Products', callback_data: 'browse' }],
    ]);

    await ctx.reply(text, { parse_mode: 'HTML', ...buttons });

    const sessionData = userSessions.get(userId) || {};
    sessionData.stage = 'welcome';
    userSessions.set(userId, sessionData);
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT_NUM = process.env.PORT || 3000;

if (process.env.NODE_ENV === 'production' && process.env.WEBHOOK_DOMAIN) {
  const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'secret';
  const webhookPath = `/bot${WEBHOOK_SECRET}`;

  app.use(bot.webhookCallback(webhookPath));
  bot.telegram.setWebhook(`${process.env.WEBHOOK_DOMAIN}${webhookPath}`);

  app.listen(PORT_NUM, () => {
    console.log(`✅ Server running on port ${PORT_NUM}`);
    console.log(`📡 Bot in webhook mode`);
  });
} else {
  bot.launch();
  app.listen(PORT_NUM, () => {
    console.log(`✅ Server on port ${PORT_NUM}`);
  });
  console.log(`🤖 Bot in polling mode`);
}

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
