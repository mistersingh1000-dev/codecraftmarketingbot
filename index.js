require('dotenv').config();
const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const { google } = require('googleapis');

const app = express();
app.use(express.json());

// ═════════════════════════════════════════════════════════════════════════════
// CONFIG
// ═════════════════════════════════════════════════════════════════════════════

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(id => parseInt(id.trim()));
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const SUPPORT_USERNAME = process.env.SUPPORT_USERNAME || 'support';
const CURRENCY = process.env.CURRENCY_SYMBOL || '₹';
const PORT = process.env.PORT || 3000;
const WEBHOOK_DOMAIN = process.env.WEBHOOK_DOMAIN;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'secret';

const bot = new Telegraf(BOT_TOKEN);

// ═════════════════════════════════════════════════════════════════════════════
// GOOGLE SHEETS
// ═════════════════════════════════════════════════════════════════════════════

function getAuth() {
  return new google.auth.JWT(
    GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    GOOGLE_PRIVATE_KEY,
    ['https://www.googleapis.com/auth/spreadsheets']
  );
}

async function readSheet(sheetName) {
  try {
    const sheets = google.sheets({ version: 'v4', auth: getAuth() });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: sheetName,
    });
    const rows = res.data.values || [];
    if (rows.length < 2) return [];
    const headers = rows[0];
    return rows.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i] || ''; });
      return obj;
    });
  } catch (err) {
    console.error('Sheets error:', err.message);
    return [];
  }
}

async function appendRow(sheetName, rowData) {
  try {
    const sheets = google.sheets({ version: 'v4', auth: getAuth() });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `${sheetName}!1:1`,
    });
    const headers = (res.data.values || [[]])[0];
    const row = headers.map(h => rowData[h] !== undefined ? rowData[h] : '');
    await sheets.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: sheetName,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [row] },
    });
  } catch (err) {
    console.error('Append error:', err.message);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// BOT COMMANDS
// ═════════════════════════════════════════════════════════════════════════════

bot.command('start', async (ctx) => {
  const name = ctx.from.first_name || 'there';
  const text = `👋 Welcome, ${name}!\n\n🛒 Your Digital Products Store\n\nBrowse products, make purchases, and get instant delivery!`;
  
  const keyboard = Markup.inlineKeyboard([
    [{ text: '🛍 Browse Products', callback_data: 'menu_browse' }],
    [{ text: '📦 My Orders', callback_data: 'menu_orders' }],
    [{ text: '💬 Support', callback_data: 'menu_support' }],
  ]);

  await ctx.reply(text, keyboard);
});

bot.command('admin', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) {
    return ctx.reply('⛔ Admin only');
  }
  await ctx.reply('🔧 Admin Panel\n\nCommands:\n/orders - View pending orders\n/stats - View statistics');
});

// ═════════════════════════════════════════════════════════════════════════════
// CALLBACK HANDLERS
// ═════════════════════════════════════════════════════════════════════════════

bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;

  if (data === 'menu_browse') {
    await ctx.answerCbQuery('Loading products...');
    const products = await readSheet('Products');
    const active = products.filter(p => p.ActiveStatus === 'TRUE' || p.ActiveStatus === 'true');
    
    if (active.length === 0) {
      return ctx.reply('No products available');
    }

    let text = '🛍 <b>Products</b>\n\n';
    const buttons = [];
    for (const p of active.slice(0, 10)) {
      text += `• <b>${p.ProductName}</b> - ${CURRENCY}${p.Price}\n`;
      buttons.push([{ text: p.ProductName, callback_data: `product_${p.ProductID}` }]);
    }
    
    await ctx.reply(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
  }

  if (data === 'menu_orders') {
    await ctx.answerCbQuery();
    const orders = await readSheet('Orders');
    const userOrders = orders.filter(o => o.TelegramUserID === String(ctx.from.id));
    
    if (userOrders.length === 0) {
      return ctx.reply('📦 No orders yet');
    }

    let text = '📦 <b>Your Orders</b>\n\n';
    for (const o of userOrders.slice(-5)) {
      text += `${o.ProductName} - ${o.OrderStatus}\n`;
    }
    await ctx.reply(text, { parse_mode: 'HTML' });
  }

  if (data === 'menu_support') {
    await ctx.answerCbQuery();
    await ctx.reply(`💬 Support\n\nContact: @${SUPPORT_USERNAME}`);
  }

  if (data.startsWith('product_')) {
    await ctx.answerCbQuery();
    const productId = data.replace('product_', '');
    const products = await readSheet('Products');
    const product = products.find(p => p.ProductID === productId);

    if (!product) return ctx.reply('Product not found');

    const text = `<b>${product.ProductName}</b>\n\n${product.FullDescription}\n\n💰 Price: ${CURRENCY}${product.Price}`;
    const buttons = [[{ text: `💳 Buy ${CURRENCY}${product.Price}`, callback_data: `buy_${productId}` }]];

    await ctx.reply(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
  }

  if (data.startsWith('buy_')) {
    await ctx.answerCbQuery();
    const productId = data.replace('buy_', '');
    const products = await readSheet('Products');
    const product = products.find(p => p.ProductID === productId);

    if (!product) return ctx.reply('Product not found');

    const orderId = `ORD-${Date.now()}`;
    await appendRow('Orders', {
      OrderID: orderId,
      TelegramUserID: ctx.from.id,
      Username: ctx.from.username || '',
      FullName: ctx.from.first_name || '',
      ProductID: productId,
      ProductName: product.ProductName,
      PlanName: product.PlanName,
      Price: product.Price,
      PaymentStatus: 'Pending',
      OrderStatus: 'Pending',
      CreatedAt: new Date().toISOString(),
    });

    await ctx.reply(`✅ Order created!\n\nOrder ID: ${orderId}\n\nPlease proceed with payment.\n\nContact @${SUPPORT_USERNAME} for payment instructions.`);
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═════════════════════════════════════════════════════════════════════════════

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ═════════════════════════════════════════════════════════════════════════════
// START SERVER
// ═════════════════════════════════════════════════════════════════════════════

if (process.env.NODE_ENV === 'production' && WEBHOOK_DOMAIN) {
  const webhookPath = `/bot${WEBHOOK_SECRET}`;
  app.use(bot.webhookCallback(webhookPath));
  bot.telegram.setWebhook(`${WEBHOOK_DOMAIN}${webhookPath}`);
  
  app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📡 Bot running in webhook mode`);
  });
} else {
  bot.launch();
  app.listen(PORT, () => console.log(`✅ Server on port ${PORT}`));
  console.log(`🤖 Bot running in polling mode`);
}

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
