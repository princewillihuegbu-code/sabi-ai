// ============================================
// SABI BACKEND - Main Server
// ============================================
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');

const logger = require('./utils/logger');
const webhookRouter = require('./routes/webhook');
const adminRouter = require('./routes/admin');
const { refreshAllCaches } = require('./jobs/cacheRefresh');
const { runDailyBroadcast } = require('./jobs/dailyBroadcast');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Security Middleware ──────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 30,
  message: { error: 'Too many requests, slow down.' }
});
app.use('/webhook', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Routes ───────────────────────────────────
app.use('/webhook', webhookRouter);
app.use('/admin', adminRouter);

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Sabi AI Backend',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// ── Cron Jobs ────────────────────────────────
// Cache refresh every 6 hours
cron.schedule('0 */6 * * *', async () => {
  logger.info('Starting scheduled cache refresh...');
  await refreshAllCaches();
}, { timezone: 'Africa/Lagos' });

// Daily broadcast at 7:00 AM Lagos time
cron.schedule(process.env.BROADCAST_CRON || '0 7 * * *', async () => {
  logger.info('Starting daily broadcast...');
  await runDailyBroadcast();
}, { timezone: 'Africa/Lagos' });

// ── Start Server ─────────────────────────────
app.listen(PORT, async () => {
  logger.info(`🇳🇬 Sabi Backend running on port ${PORT}`);
  // Initial cache warm-up
  await refreshAllCaches().catch(err => logger.warn('Initial cache refresh failed:', err.message));
});

module.exports = app;
