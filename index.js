require('dotenv').config();
const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const { google } = require('googleapis');

const app = express();
app.use(express.json());

// CONFIG
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(id => parseInt(id.trim()));
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const SUPPORT_USERNAME = process.env.SUPPORT_USERNAME || 'support';
const PORT = process.env.PORT || 3000;

const bot = new Telegraf(BOT_TOKEN);

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

bot.command('start', async (ctx) => {
  const name = ctx.from.first_name || 'there';
  const text = `👋 Welcome, ${name}!\n\n🛒 <b>Digital Products Store</b>\n\nBrowse our products and get instant access with activation codes!`;
  
  const keyboard = Markup.inlineKeyboard([
    [{ text: '🛍 Browse Products', callback_data: 'menu_browse' }],
    [{ text: '📦 My Orders', callback_data: 'menu_orders' }],
    [{ text: '💬 Support', callback_data: 'menu_support' }],
  ]);

  await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
});

bot.command('admin', async (ctx) => {
  if (!(ADMIN_IDS || []).includes(ctx.from.id)) {
    return ctx.reply('⛔ Admin only');
  }
  await ctx.reply('🔧 Admin Panel\n\n/stats - Statistics\n/refresh - Refresh cache');
});

bot.command('refresh', async (ctx) => {
  if (!(ADMIN_IDS || []).includes(ctx.from.id)) {
    return ctx.reply('⛔ Admin only');
  }
  productsCache = [];
  await ctx.reply('✅ Cache refreshed');
});

bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;

  if (data === 'menu_browse') {
    await ctx.answerCbQuery('Loading products...');
    const products = await getProducts();
    
    if (products.length === 0) {
      return ctx.reply('📭 No products available');
    }

    let text = '🛍 <b>Available Products</b>\n\n';
    const buttons = [];

    for (const product of products.slice(0, 15)) {
      const name = product.ProductName || 'Unnamed';
      const price = product.YourPrice || '0';
      text += `💾 <b>${name}</b>\n💰 ₹${price}\n\n`;
      buttons.push([{ text: `${name} - ₹${price}`, callback_data: `product_${product.ProductID}` }]);
    }

    await ctx.editMessageText(text, { 
      parse_mode: 'HTML', 
      ...Markup.inlineKeyboard(buttons) 
    }).catch(() => ctx.reply(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }));
  }

  if (data === 'menu_orders') {
    await ctx.answerCbQuery();
    const text = '📦 <b>Your Orders</b>\n\nYour activation codes will appear here after purchase.\n\nContact @' + SUPPORT_USERNAME + ' for order status.';
    await ctx.editMessageText(text, { parse_mode: 'HTML' }).catch(() => ctx.reply(text, { parse_mode: 'HTML' }));
  }

  if (data === 'menu_support') {
    await ctx.answerCbQuery();
    const text = `💬 <b>Support</b>\n\nContact: @${SUPPORT_USERNAME}`;
    await ctx.editMessageText(text, { parse_mode: 'HTML' }).catch(() => ctx.reply(text, { parse_mode: 'HTML' }));
  }

  if (data.startsWith('product_')) {
    await ctx.answerCbQuery();
    const productId = data.replace('product_', '');
    const products = await getProducts();
    const product = products.find(p => p.ProductID === productId);

    if (!product) {
      return ctx.reply('❌ Product not found');
    }

    const text = `<b>${product.ProductName}</b>\n\n<b>📝 Description:</b>\n${product.Description}\n\n<b>💰 Pricing:</b>\nOriginal: ₹${product.OriginalPrice}\nOur Price: <b>₹${product.YourPrice}</b>\n\n<b>✅ Activation Code:</b>\n<code>${product.CouponCode}</code>`;
    const buttons = [[{ text: `💳 Buy for ₹${product.YourPrice}`, callback_data: `buy_${productId}` }]];

    await ctx.editMessageText(text, { 
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    }).catch(() => ctx.reply(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }));
  }

  if (data.startsWith('buy_')) {
    await ctx.answerCbQuery();
    const productId = data.replace('buy_', '');
    const products = await getProducts();
    const product = products.find(p => p.ProductID === productId);

    if (!product) {
      return ctx.reply('❌ Product not found');
    }

    const orderId = `ORD-${Date.now()}`;
    
    const text = `✅ <b>Order Created!</b>\n\n<b>Order ID:</b> ${orderId}\n<b>Product:</b> ${product.ProductName}\n<b>Price:</b> ₹${product.YourPrice}\n\n📧 <b>Payment:</b>\nContact @${SUPPORT_USERNAME} with Order ID\n\n<b>Your Activation Code:</b>\n<code>${product.CouponCode}</code>`;

    await ctx.reply(text, { parse_mode: 'HTML' });
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
