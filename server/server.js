const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

// Импорт роутов
const authRoutes = require('./routes/auth');
const habitRoutes = require('./routes/habits');
const goalRoutes = require('./routes/goals');
const entryRoutes = require('./routes/entries');
const reminderRoutes = require('./routes/reminders').router;
const adminRoutes = require('./routes/admin');

// Импорт утилит
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 5000;

// Подключение к MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/habit_tracker', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
.then(() => {
  logger.info('✅ MongoDB подключена успешно');
  
  // Инициализация планировщика напоминаний после подключения к БД
  const { initializeScheduler } = require('./routes/reminders');
  initializeScheduler();
})
.catch((err) => {
  logger.error('❌ Ошибка подключения к MongoDB:', {
    error: err.message,
    stack: err.stack
  });
  process.exit(1);
});

// Глобальные обработчики событий MongoDB
mongoose.connection.on('error', (err) => {
  logger.error('MongoDB ошибка соединения:', err);
});

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB соединение разорвано');
});

mongoose.connection.on('reconnected', () => {
  logger.info('MongoDB соединение восстановлено');
});

// Middleware безопасности
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", process.env.FRONTEND_URL || 'http://localhost:3000']
    }
  },
  crossOriginEmbedderPolicy: false
}));

// CORS настройки
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));

// Логирование запросов
app.use(morgan('combined', { 
  stream: { 
    write: (message) => logger.info(message.trim()) 
  } 
}));

// Парсинг JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Статические файлы
app.use(express.static('public'));

// Маршруты API
app.use('/api/auth', authRoutes);
app.use('/api/habits', habitRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/entries', entryRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/admin', adminRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    memory: process.memoryUsage()
  };
  
  if (mongoose.connection.readyState !== 1) {
    health.status = 'unhealthy';
    health.error = 'Database connection failed';
  }
  
  res.json(health);
});

// 404 handler
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found',
    error: 'NOT_FOUND'
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Глобальная ошибка:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip
  });
  
  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' 
    ? 'Внутренняя ошибка сервера' 
    : err.message;
  
  res.status(statusCode).json({
    success: false,
    message,
    error: err.name || 'INTERNAL_SERVER_ERROR',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  logger.info(`Получен сигнал ${signal}. Начинаю graceful shutdown...`);
  
  // Отключаем все запланированные напоминания
  const reminderJobs = require('./routes/reminders').reminderJobs;
  reminderJobs.forEach(job => job.cancel());
  
  // Закрываем соединение с MongoDB
  mongoose.connection.close(false, () => {
    logger.info('MongoDB соединение закрыто');
    process.exit(0);
  });
  
  // Таймаут на случай, если закрытие занимает слишком много времени
  setTimeout(() => {
    logger.error('Принудительное завершение из-за таймаута');
    process.exit(1);
  }, 10000);
};

// Обработчики сигналов завершения
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Запуск сервера
const server = app.listen(PORT, () => {
  logger.info(`🚀 Сервер запущен на порту ${PORT}`);
  logger.info(`🔗 API доступен по адресу http://localhost:${PORT}/api`);
  logger.info(`🌐 Фронтенд доступен по адресу http://localhost:${PORT}`);
  logger.info(`📊 Админ-панель: http://localhost:${PORT}/admin.html`);
  logger.info(`📅 Календарь: http://localhost:${PORT}/calendar.html`);
  logger.info(`📈 Статистика: http://localhost:${PORT}/stats.html`);
});

// Обработка ошибок сервера
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    logger.error(`Порт ${PORT} уже используется`);
    process.exit(1);
  } else {
    throw error;
  }
});