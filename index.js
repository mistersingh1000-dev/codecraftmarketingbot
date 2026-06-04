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
const pendingOrders = new Map();

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

async function sendOrderNotificationToAdmin(orderId, product, customer, userId) {
  try {
    const adminId = ADMIN_IDS[0];
    if (!adminId) return;

    const message = `🎯 <b>NEW ORDER READY FOR APPROVAL!</b>\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📦 <b>ORDER DETAILS</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `🎫 <b>Order ID:</b> <code>${orderId}</code>\n` +
      `👤 <b>Customer:</b> ${customer}\n` +
      `📱 <b>Customer ID:</b> ${userId}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `💾 <b>PRODUCT INFO</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📛 <b>Product ID:</b> ${product.ProductID}\n` +
      `📝 <b>Product Name:</b> ${product.ProductName}\n` +
      `📄 <b>Description:</b> ${product.Description}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `💰 <b>PRICING</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Original Price: ₹${product.OriginalPrice}\n` +
      `Quoted Price: ₹${product.YourPrice}\n` +
      `⚠️ <b>NOTE:</b> Price is tentative. Change if needed.\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `<b>✅ APPROVE or ❌ REJECT?</b>`;

    const buttons = Markup.inlineKeyboard([
      [
        { text: '✅ APPROVE ORDER', callback_data: `approve_${orderId}_${userId}` },
        { text: '❌ REJECT ORDER', callback_data: `reject_${orderId}_${userId}` }
      ]
    ]);

    await bot.telegram.sendMessage(adminId, message, { parse_mode: 'HTML', ...buttons });
  } catch (err) {
    console.error('Error sending admin notification:', err.message);
  }
}

function searchProducts(query, products) {
  const lowerQuery = query.toLowerCase();
  return products.filter(p => 
    (p.ProductName && p.ProductName.toLowerCase().includes(lowerQuery)) ||
    (p.Description && p.Description.toLowerCase().includes(lowerQuery))
  );
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
    `1️⃣ Browse or Search Products\n` +
    `2️⃣ Choose What You Need\n` +
    `3️⃣ Ready to Checkout\n` +
    `4️⃣ Admin Reviews & Approves\n` +
    `5️⃣ Make Payment & Get Instant Access\n\n` +
    `⚠️ <b>NOTE:</b> Pricing shown is tentative.\n` +
    `Final price will be confirmed before order finalization.\n\n` +
    `Ready to explore?`;

  const buttons = Markup.inlineKeyboard([
    [{ text: '🛍 Browse Products', callback_data: 'browse' }],
    [{ text: '🔍 Search Product', callback_data: 'search' }],
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

  if (data === 'search') {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const session = userSessions.get(userId) || {};
    session.stage = 'awaiting_search';
    userSessions.set(userId, session);

    const text = `🔍 <b>SEARCH PRODUCT</b>\n\n` +
      `What product are you looking for?\n\n` +
      `Examples:\n` +
      `• Adobe\n` +
      `• Office\n` +
      `• WordPress\n` +
      `• Android\n\n` +
      `📝 Type your search query:`;

    await ctx.editMessageText(text, { parse_mode: 'HTML' })
      .catch(() => ctx.reply(text, { parse_mode: 'HTML' }));
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
      `⚠️ <b>NOTE:</b> This price is tentative.\n` +
      `Final price will be confirmed after admin review.\n\n` +
      `Ready to proceed?`;

    const buttons = Markup.inlineKeyboard([
      [{ text: '✅ Yes, Proceed to Checkout!', callback_data: `checkout_${productId}` }],
      [{ text: '❌ Show More Products', callback_data: 'browse' }],
    ]);

    await ctx.editMessageText(text, { parse_mode: 'HTML', ...buttons })
      .catch(() => ctx.reply(text, { parse_mode: 'HTML', ...buttons }));
  }

  if (data.startsWith('checkout_')) {
    await ctx.answerCbQuery();
    const productId = data.replace('checkout_', '');
    const products = await getProducts();
    const product = products.find(p => p.ProductID === productId);
    const userId = ctx.from.id;
    const userName = ctx.from.first_name || 'User';

    if (!product) return ctx.reply('❌ Product not found');

    const orderId = `ORD-${Date.now()}`;

    pendingOrders.set(orderId, {
      productId: product.ProductID,
      product: product,
      customerId: userId,
      customerName: userName,
      createdAt: new Date(),
      status: 'pending_approval'
    });

    await sendOrderNotificationToAdmin(orderId, product, userName, userId);

    const text = `⏳ <b>ORDER SUBMITTED FOR APPROVAL!</b>\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🎫 <b>ORDER ID:</b> <code>${orderId}</code>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📦 <b>Product:</b> ${product.ProductName}\n` +
      `💰 <b>Amount:</b> ₹${product.YourPrice}\n` +
      `⏱️ <b>Status:</b> Awaiting Admin Approval\n\n` +
      `⏳ <b>What happens next:</b>\n` +
      `1. Admin reviews your order\n` +
      `2. Admin checks product availability\n` +
      `3. Admin confirms final pricing\n` +
      `4. You receive approval notification\n` +
      `5. You complete payment\n` +
      `6. Instant delivery! 🎁\n\n` +
      `📱 <b>Check your notifications!</b>\n` +
      `Admin will contact you shortly...\n\n` +
      `⚠️ <b>IMPORTANT:</b>\n` +
      `Final price may differ from quoted price.\n` +
      `You'll be informed if there's any change.`;

    const buttons = Markup.inlineKeyboard([
      [{ text: '👥 Join WhatsApp Group', url: WHATSAPP_GROUP }],
      [{ text: '🌐 Join Telegram Channel', url: TELEGRAM_CHANNEL }],
      [{ text: '📞 Contact Admin', url: TELEGRAM_CONTACT }],
      [{ text: '🛍 Browse More', callback_data: 'browse' }],
    ]);

    await ctx.reply(text, { parse_mode: 'HTML', ...buttons });
  }

  if (data.startsWith('approve_')) {
    await ctx.answerCbQuery('Approving order...');
    const parts = data.replace('approve_', '').split('_');
    const orderId = parts[0];
    const customerId = parseInt(parts[1]);

    const order = pendingOrders.get(orderId);
    if (!order) {
      return ctx.answerCbQuery('Order not found', { show_alert: true });
    }

    order.status = 'approved';
    order.approvedAt = new Date();
    pendingOrders.set(orderId, order);

    const customerText = `✅ <b>ORDER APPROVED! 🎉</b>\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🎫 <b>ORDER ID:</b> <code>${orderId}</code>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📦 <b>Product:</b> ${order.product.ProductName}\n` +
      `💰 <b>Final Amount:</b> ₹${order.product.YourPrice}\n` +
      `✅ <b>Status:</b> Approved & Ready for Payment\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `💳 <b>PAYMENT INSTRUCTIONS</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📱 <b>UPI Payment:</b>\n` +
      `<code>${UPI_ID}</code>\n` +
      `(Copy and paste in your UPI app)\n\n` +
      `💰 <b>Crypto Payment (Binance):</b>\n` +
      `ID: <code>${BINANCE_ID}</code>\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📸 <b>AFTER PAYMENT:</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `✅ Take screenshot of payment\n` +
      `✅ Send to WhatsApp\n` +
      `✅ We'll deliver in 4-6 hours\n\n` +
      `👥 WhatsApp: ${WHATSAPP_CONTACT}\n` +
      `💬 Telegram: ${TELEGRAM_CONTACT}\n` +
      `☎️ Phone: ${PHONE_NUMBER}\n\n` +
      `⏱️ <b>Delivery Time:</b>\n` +
      `Standard: 4-6 hours\n` +
      `Some orders: 24-48 hours\n\n` +
      `🎁 <b>Join our community for updates!</b>`;

    const customerButtons = Markup.inlineKeyboard([
      [{ text: '📱 Send Payment Screenshot', url: WHATSAPP_CONTACT }],
      [{ text: '👥 Join Community', url: WHATSAPP_GROUP }],
    ]);

    try {
      await bot.telegram.sendMessage(customerId, customerText, { parse_mode: 'HTML', ...customerButtons });
    } catch (err) {
      console.error('Error sending customer message:', err.message);
    }

    const adminText = `✅ <b>ORDER APPROVED!</b>\n\n` +
      `Order ID: <code>${orderId}</code>\n` +
      `Customer: ${order.customerName}\n` +
      `Product: ${order.product.ProductName}\n` +
      `Amount: ₹${order.product.YourPrice}\n\n` +
      `✅ Awaiting customer payment...`;

    await ctx.editMessageText(adminText, { parse_mode: 'HTML' })
      .catch(() => {});
  }

  if (data.startsWith('reject_')) {
    await ctx.answerCbQuery('Rejecting order...');
    const parts = data.replace('reject_', '').split('_');
    const orderId = parts[0];
    const customerId = parseInt(parts[1]);

    const order = pendingOrders.get(orderId);
    if (!order) {
      return ctx.answerCbQuery('Order not found', { show_alert: true });
    }

    order.status = 'rejected';
    order.rejectedAt = new Date();
    pendingOrders.set(orderId, order);

    const customerText = `❌ <b>ORDER COULD NOT BE PROCESSED</b>\n\n` +
      `Order ID: <code>${orderId}</code>\n\n` +
      `We apologize! We couldn't process your order.\n\n` +
      `Possible reasons:\n` +
      `• Product out of stock\n` +
      `• Price mismatch\n` +
      `• Availability issue\n\n` +
      `📞 <b>Contact us for more details:</b>\n` +
      `WhatsApp: ${WHATSAPP_CONTACT}\n` +
      `Telegram: ${TELEGRAM_CONTACT}\n` +
      `Phone: ${PHONE_NUMBER}\n\n` +
      `🛍 Try browsing other products!`;

    const customerButtons = Markup.inlineKeyboard([
      [{ text: '📞 Contact Admin', url: TELEGRAM_CONTACT }],
      [{ text: '🛍 Browse Products', callback_data: 'browse' }],
    ]);

    try {
      await bot.telegram.sendMessage(customerId, customerText, { parse_mode: 'HTML', ...customerButtons });
    } catch (err) {
      console.error('Error sending customer message:', err.message);
    }

    const adminText = `❌ <b>ORDER REJECTED</b>\n\n` +
      `Order ID: <code>${orderId}</code>\n` +
      `Customer: ${order.customerName}\n` +
      `Product: ${order.product.ProductName}\n\n` +
      `Customer has been notified.`;

    await ctx.editMessageText(adminText, { parse_mode: 'HTML' })
      .catch(() => {});
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

  if (session && session.stage === 'awaiting_search') {
    const searchQuery = ctx.message.text;
    const products = await getProducts();
    const results = searchProducts(searchQuery, products);

    if (results.length === 0) {
      const text = `❌ <b>No products found for "${searchQuery}"</b>\n\n` +
        `Try searching for:\n` +
        `• Adobe\n` +
        `• Office\n` +
        `• WordPress\n` +
        `• Android\n\n` +
        `Or contact us for custom solutions!`;

      const buttons = Markup.inlineKeyboard([
        [{ text: '🔍 Search Again', callback_data: 'search' }],
        [{ text: '🛍 Browse All Products', callback_data: 'browse' }],
        [{ text: '❓ Request Custom Service', callback_data: 'request' }],
      ]);

      await ctx.reply(text, { parse_mode: 'HTML', ...buttons });
    } else {
      let text = `🔍 <b>SEARCH RESULTS for "${searchQuery}"</b>\n\n`;
      let text2 = `Found <b>${results.length}</b> product(s)!\n\n`;
      const buttons = [];

      for (const product of results) {
        const name = product.ProductName || 'Unnamed';
        const price = product.YourPrice || '0';
        text2 += `💾 ${name} - ₹${price}\n`;
        buttons.push([{ text: `${name} - ₹${price}`, callback_data: `product_${product.ProductID}` }]);
      }

      buttons.push([{ text: '🔍 Search Again', callback_data: 'search' }]);
      buttons.push([{ text: '↩️ Back to Menu', callback_data: 'back' }]);

      await ctx.reply(text + text2, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
    }

    const sessionData = userSessions.get(userId) || {};
    sessionData.stage = 'welcome';
    userSessions.set(userId, sessionData);
  } else if (session && session.stage === 'awaiting_request') {
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
