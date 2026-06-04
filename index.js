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

// PAYMENT & CONTACT DETAILS
const UPI_ID = "9501216365@amazonpay";
const BINANCE_ID = "527519624";
const ADMIN_USERNAME = "digialmarketing";
const WHATSAPP_GROUP = "https://chat.whatsapp.com/DoOkEt2FTfuHRhrQRK3mr4";
const TELEGRAM_CHANNEL = "https://t.me/whatsappbulkmessage";
const WHATSAPP_CONTACT = "wa.me/917009732517";
const TELEGRAM_CONTACT = "https://t.me/digialmarketing";
const PHONE_NUMBER = "+91 70097 32517";

const bot = new Telegraf(BOT_TOKEN);

// User session tracking
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
      `💬 <b>Feedback/Suggestion:</b>\n${feedback}\n\n` +
      `<b>Action:</b> Contact this customer directly or update bot with new service`;

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
    selectedProduct: null,
  });

  const welcomeText = `👋 <b>Welcome to CodeCraft Marketing Bot!</b>\n\n` +
    `🎯 <b>Your Digital Products Store</b>\n\n` +
    `📋 <b>What We Offer:</b>\n` +
    `✅ Adobe Creative Suite (Lifetime Licenses)\n` +
    `✅ Microsoft Office Products\n` +
    `✅ WordPress Themes\n` +
    `✅ Android Apps & Tools\n` +
    `✅ And Much More!\n\n` +
    `🚀 <b>How It Works:</b>\n` +
    `1️⃣ Browse Our Products\n` +
    `2️⃣ Choose What You Need\n` +
    `3️⃣ Make Payment (UPI/Crypto)\n` +
    `4️⃣ Get Instant Access\n\n` +
    `💡 <b>Special Features:</b>\n` +
    `🔔 Can't find what you need? Share your requirement!\n` +
    `👥 We'll contact you with the solution\n` +
    `🎁 Join our community for exclusive deals\n\n` +
    `<b>Ready to explore? Click below ➡️</b>`;

  const buttons = Markup.inlineKeyboard([
    [{ text: '🛍 Start Shopping', callback_data: 'step_browse' }],
    [{ text: '❓ Need Something Specific?', callback_data: 'step_request' }],
    [{ text: '📞 Contact Us', callback_data: 'step_contact' }],
  ]);

  await ctx.reply(welcomeText, { parse_mode: 'HTML', ...buttons });
});

const browsProducts = async (ctx) => {
  await ctx.answerCbQuery('Loading our products...');
  const products = await getProducts();

  if (products.length === 0) {
    return ctx.reply('📭 No products available right now. Please try again later!');
  }

  let text = `🛍 <b>OUR PRODUCTS</b>\n\n` +
    `Choose any product to see details:\n\n`;

  const buttons = [];
  for (const product of products.slice(0, 15)) {
    const name = product.ProductName || 'Unnamed';
    const price = product.YourPrice || '0';
    text += `💾 <b>${name}</b> - ₹${price}\n`;
    buttons.push([{ text: `${name} - ₹${price}`, callback_data: `view_product_${product.ProductID}` }]);
  }

  buttons.push([{ text: '↩️ Back to Menu', callback_data: 'back_menu' }]);

  await ctx.editMessageText(text, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(buttons)
  }).catch(() => ctx.reply(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }));
};

const viewProduct = async (ctx) => {
  await ctx.answerCbQuery();
  const productId = ctx.callbackQuery.data.replace('view_product_', '');
  const products = await getProducts();
  const product = products.find(p => p.ProductID === productId);

  if (!product) {
    return ctx.reply('❌ Product not found');
  }

  const userId = ctx.from.id;
  const session = userSessions.get(userId) || {};
  session.selectedProduct = product;
  userSessions.set(userId, session);

  const text = `<b>${product.ProductName}</b>\n\n` +
    `📝 <b>Description:</b>\n${product.Description}\n\n` +
    `💰 <b>Pricing:</b>\n` +
    `Original: <s>₹${product.OriginalPrice}</s>\n` +
    `<b>Our Price: ₹${product.YourPrice}</b> ✨\n\n` +
    `<b>Ready to proceed?</b>`;

  const buttons = Markup.inlineKeyboard([
    [{ text: '✅ Yes, Buy Now!', callback_data: `buy_product_${productId}` }],
    [{ text: '❌ No, Show Other Products', callback_data: 'step_browse' }],
  ]);

  await ctx.editMessageText(text, {
    parse_mode: 'HTML',
    ...buttons
  }).catch(() => ctx.reply(text, { parse_mode: 'HTML', ...buttons }));
};

const handleRequest = async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;

  const session = userSessions.get(userId) || {};
  session.stage = 'awaiting_request';
  userSessions.set(userId, session);

  const text = `🎯 <b>Tell Us What You Need!</b>\n\n` +
    `❓ <b>What service or product are you looking for?</b>\n\n` +
    `Examples:\n` +
    `• Photoshop License\n` +
    `• Video Editing Software\n` +
    `• Web Development Tools\n` +
    `• Custom Solutions\n\n` +
    `📝 Please type your requirement below:`;

  await ctx.editMessageText(text, { parse_mode: 'HTML' }).catch(() => ctx.reply(text, { parse_mode: 'HTML' }));
};

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const session = userSessions.get(userId);

  if (session && session.stage === 'awaiting_request') {
    const userRequest = ctx.message.text;
    const userName = ctx.from.first_name || 'User';

    const feedbackText = `🎁 <b>Share Any Feedback or Suggestions?</b>\n\n` +
      `You're interested in: <b>${userRequest}</b>\n\n` +
      `Do you have any feedback or suggestions for us?\n` +
      `(Type your message or just click 'Skip')`;

    const buttons = Markup.inlineKeyboard([
      [{ text: '✍️ Share Feedback', callback_data: 'share_feedback' }],
      [{ text: '⏭️ Skip', callback_data: 'skip_feedback' }],
    ]);

    session.userRequest = userRequest;
    userSessions.set(userId, session);

    await ctx.reply(feedbackText, { parse_mode: 'HTML', ...buttons });
  } else if (session && session.stage === 'awaiting_feedback') {
    const feedback = ctx.message.text;
    const userName = ctx.from.first_name || 'User';
    const userRequest = session.userRequest || 'No specific request';

    await sendFeedbackToAdmin(userId, userName, feedback, userRequest);

    const thankYouText = `✅ <b>Thank You!</b>\n\n` +
      `We've received your request and feedback:\n` +
      `<b>📌 Requirement:</b> ${userRequest}\n\n` +
      `🎯 <b>What happens next:</b>\n` +
      `1. Our team will review your request\n` +
      `2. We'll contact you directly if we have a solution\n` +
      `3. Or we'll update our bot with your requested service\n\n` +
      `📞 <b>Meanwhile, stay connected:</b>`;

    const contactButtons = Markup.inlineKeyboard([
      [{ text: '👥 WhatsApp Group', url: WHATSAPP_GROUP }],
      [{ text: '🌐 Telegram Channel', url: TELEGRAM_CHANNEL }],
      [{ text: '💬 Contact Admin', url: `https://t.me/${ADMIN_USERNAME}` }],
      [{ text: '🛍 Browse Products', callback_data: 'step_browse' }],
    ]);

    await ctx.reply(thankYouText, { parse_mode: 'HTML', ...contactButtons });

    session.stage = 'welcome';
    userSessions.set(userId, session);
  }
});

bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;

  if (data === 'step_browse') {
    await browsProducts(ctx);
  } else if (data === 'step_request') {
    await handleRequest(ctx);
  } else if (data === 'share_feedback') {
    const userId = ctx.from.id;
    const session = userSessions.get(userId) || {};
    session.stage = 'awaiting_feedback';
    userSessions.set(userId, session);

    await ctx.answerCbQuery();
    const text = `📝 <b>Share Your Feedback:</b>\n\n` +
      `Please type your feedback or suggestions:`;
    await ctx.reply(text, { parse_mode: 'HTML' });
  } else if (data === 'skip_feedback') {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const session = userSessions.get(userId) || {};
    const userRequest = session.userRequest || 'No specific request';
    const userName = ctx.from.first_name || 'User';

    await sendFeedbackToAdmin(userId, userName, 'No feedback provided', userRequest);

    const text = `✅ <b>Thank You!</b>\n\n` +
      `Your requirement has been received:\n` +
      `<b>📌 Need:</b> ${userRequest}\n\n` +
      `🎯 We'll contact you if we have a solution!\n\n` +
      `📞 <b>Stay Connected:</b>`;

    const buttons = Markup.inlineKeyboard([
      [{ text: '👥 WhatsApp Group', url: WHATSAPP_GROUP }],
      [{ text: '🌐 Telegram Channel', url: TELEGRAM_CHANNEL }],
      [{ text: '💬 Contact Admin', url: `https://t.me/${ADMIN_USERNAME}` }],
      [{ text: '🛍 Browse Products', callback_data: 'step_browse' }],
    ]);

    await ctx.reply(text, { parse_mode: 'HTML', ...buttons });
  } else if (data === 'step_contact') {
    await ctx.answerCbQuery();
    const text = `📞 <b>CONTACT US</b>\n\n` +
      `Choose your preferred way to reach us:\n`;

    const buttons = Markup.inlineKeyboard([
      [{ text: '👥 WhatsApp Group', url: WHATSAPP_GROUP }],
      [{ text: '📱 WhatsApp Direct', url: WHATSAPP_CONTACT }],
      [{ text: '🌐 Telegram Channel', url: TELEGRAM_CHANNEL }],
      [{ text: '💬 Telegram Direct', url: TELEGRAM_CONTACT }],
      [{ text: '☎️ Phone', url: `tel:${PHONE_NUMBER.replace(/\s/g, '')}` }],
      [{ text: '↩️ Back to Menu', callback_data: 'back_menu' }],
    ]);

    await ctx.editMessageText(text, { parse_mode: 'HTML', ...buttons }).catch(() => ctx.reply(text, { parse_mode: 'HTML', ...buttons }));
  } else if (data === 'back_menu') {
    await ctx.answerCbQuery();
    const text = `👋 <b>Welcome Back!</b>\n\nWhat would you like to do?`;
    const buttons = Markup.inlineKeyboard([
      [{ text: '🛍 Browse Products', callback_data: 'step_browse' }],
      [{ text: '❓ Request Custom Service', callback_data: 'step_request' }],
      [{ text: '📞 Contact Us', callback_data: 'step_contact' }],
    ]);
    await ctx.editMessageText(text, { parse_mode: 'HTML', ...buttons }).catch(() => ctx.reply(text, { parse_mode: 'HTML', ...buttons }));
  } else if (data.startsWith('view_product_')) {
    await viewProduct(ctx);
  } else if (data.startsWith('buy_product_')) {
    const productId = data.replace('buy_product_', '');
    const products = await getProducts();
    const product = products.find(p => p.ProductID === productId);

    if (!product) {
      return ctx.reply('❌ Product not found');
    }

    const orderId = `ORD-${Date.now()}`;

    const paymentText = `✅ <b>ORDER CONFIRMED!</b>\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `<b>ORDER DETAILS</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📦 <b>Product:</b> ${product.ProductName}\n` +
      `💰 <b>Amount:</b> ₹${product.YourPrice}\n` +
      `🎫 <b>Order ID:</b> <code>${orderId}</code>\n\n` +
      
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `💳 <b>PAYMENT INSTRUCTIONS</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      
      `📱 <b>UPI Payment:</b>\n` +
      `<code>${UPI_ID}</code>\n` +
      `(Copy and paste in your UPI app)\n\n` +
      
      `💰 <b>Crypto Payment (Binance):</b>\n` +
      `ID: <code>${BINANCE_ID}</code>\n\n` +
      
      `📸 <b>IMPORTANT:</b>\n` +
      `✅ Take screenshot of payment confirmation\n` +
      `✅ Send screenshot to us\n` +
      `✅ We'll verify and deliver instantly\n\n` +
      
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📞 <b>CONTACT US WITH PAYMENT SCREENSHOT</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      
      `👥 <b>WhatsApp Group:</b>\n${WHATSAPP_GROUP}\n\n` +
      
      `📱 <b>WhatsApp Direct:</b>\n${WHATSAPP_CONTACT}\n\n` +
      
      `🌐 <b>Telegram Channel:</b>\n${TELEGRAM_CHANNEL}\n\n` +
      
      `💬 <b>Telegram Direct:</b>\n${TELEGRAM_CONTACT}\n\n` +
      
      `☎️ <b>Phone Call:</b>\n${PHONE_NUMBER}\n\n` +
      
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `⏱️ <b>DELIVERY TIME</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      
      `✅ <b>Standard Orders:</b> 4-6 hours\n` +
      `⏳ <b>Some Orders:</b> 24-48 hours\n\n` +
      
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `💬 <b>WAIT FOR OUR RESPONSE</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      
      `✨ <b>We're not scammers!</b>\n` +
      `✨ If unable to deliver → Full refund guaranteed\n` +
      `✨ Please keep patience with us 🙏\n\n` +
      
      `🎁 <b>AFTER PAYMENT:</b>\n` +
      `Don't forget to join our community!\n` +
      `Get updates on new offers, discounts & services`;

    const buttons = Markup.inlineKeyboard([
      [{ text: '👥 Join WhatsApp Group', url: WHATSAPP_GROUP }],
      [{ text: '🌐 Join Telegram Channel', url: TELEGRAM_CHANNEL }],
      [{ text: '💬 Send Payment Screenshot', url: WHATSAPP_CONTACT }],
      [{ text: '🛍 Browse More Products', callback_data: 'step_browse' }],
    ]);

    await ctx.reply(paymentText, { parse_mode: 'HTML', ...buttons });
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
a
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
