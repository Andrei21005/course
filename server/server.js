const express = require('express');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

// ==================== БЕЗОПАСНЫЙ ИМПОРТ МОДУЛЕЙ ====================
// Создаем простые заглушки маршрутов перед импортом
const createSimpleRouteStub = (routeName) => {
  const stubCode = `
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({ 
    message: '${routeName} API (simple stub)',
    endpoint: '/api/${routeName}',
    status: 'working'
  });
});

router.post('/', (req, res) => {
  res.status(201).json({ 
    message: '${routeName} created (stub)',
    data: req.body,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
`;
  
  const routesDir = path.join(__dirname, 'routes');
  const stubPath = path.join(routesDir, `${routeName}_simple.js`);
  
  // Создаем папку routes если её нет
  if (!fs.existsSync(routesDir)) {
    fs.mkdirSync(routesDir, { recursive: true });
  }
  
  // Создаем файл-заглушку
  fs.writeFileSync(stubPath, stubCode);
  console.log(`✅ Создана заглушка для ${routeName}`);
};

// Функция безопасного импорта
const safeRequire = (modulePath, routeName = null) => {
  try {
    return require(modulePath);
  } catch (error) {
    if (routeName) {
      console.warn(`⚠️ Модуль ${modulePath} не найден, создаю заглушку...`);
      createSimpleRouteStub(routeName);
      return require(`./routes/${routeName}_simple.js`);
    }
    console.warn(`⚠️ Модуль ${modulePath} не найден: ${error.message}`);
    return null;
  }
};

// Простой логгер
const logger = {
  info: (...args) => console.log(`[${new Date().toISOString()}] INFO:`, ...args),
  error: (...args) => console.error(`[${new Date().toISOString()}] ERROR:`, ...args),
  warn: (...args) => console.warn(`[${new Date().toISOString()}] WARN:`, ...args)
};

// Безопасный импорт маршрутов
console.log('🔄 Загрузка маршрутов...');
const authRoutes = safeRequire('./routes/auth', 'auth') || (() => {
  createSimpleRouteStub('auth');
  return require('./routes/auth_simple');
})();

const habitRoutes = safeRequire('./routes/habits', 'habits') || (() => {
  createSimpleRouteStub('habits');
  return require('./routes/habits_simple');
})();

const goalRoutes = safeRequire('./routes/goals', 'goals') || (() => {
  createSimpleRouteStub('goals');
  return require('./routes/goals_simple');
})();

const entryRoutes = safeRequire('./routes/entries', 'entries') || (() => {
  createSimpleRouteStub('entries');
  return require('./routes/entries_simple');
})();

const adminRoutes = safeRequire('./routes/admin', 'admin') || (() => {
  createSimpleRouteStub('admin');
  return require('./routes/admin_simple');
})();

// Особый импорт reminders
let reminderRoutes;
let initializeScheduler = () => logger.info('Планировщик напоминаний: заглушка');
try {
  const reminderModule = require('./routes/reminders');
  reminderRoutes = reminderModule.router || reminderModule;
  initializeScheduler = reminderModule.initializeScheduler || initializeScheduler;
} catch (error) {
  console.warn('⚠️ Модуль reminders не найден, создаю заглушку...');
  createSimpleRouteStub('reminders');
  reminderRoutes = require('./routes/reminders_simple');
}

const app = express();
const PORT = process.env.PORT || 5000;

// ==================== ПОДКЛЮЧЕНИЕ К MONGODB ====================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/habit_tracker';

const connectToDatabase = async () => {
  try {
    logger.info('🔄 Подключение к MongoDB...');
    
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000
    });
    
    logger.info('✅ MongoDB подключена успешно');
    return true;
  } catch (error) {
    logger.error('❌ Ошибка подключения к MongoDB:', error.message);
    logger.warn('⚠️ Сервер будет работать без базы данных');
    return false;
  }
};

// ==================== MIDDLEWARE ====================
app.use(helmet({
  contentSecurityPolicy: false, // Отключаем для разработки
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: '*', // Разрешаем все для разработки
  credentials: true
}));

app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Статические файлы
app.use(express.static('../public'));

// ==================== МАРШРУТЫ ====================
// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    memory: process.memoryUsage()
  });
});

// Основные маршруты API
app.use('/api/auth', authRoutes);
app.use('/api/habits', habitRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/entries', entryRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/admin', adminRoutes);

// Тестовые маршруты
app.get('/api/test', (req, res) => {
  res.json({
    message: 'API работает!',
    endpoints: [
      '/api/auth',
      '/api/habits', 
      '/api/goals',
      '/api/entries',
      '/api/reminders',
      '/api/admin',
      '/api/health'
    ]
  });
});

// 404 для API
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: 'API endpoint not found',
    path: req.originalUrl
  });
});

// SPA роутинг для фронтенда
app.get('*', (req, res) => {
  if (req.accepts('html')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// ==================== ЗАПУСК СЕРВЕРА ====================
const startServer = async () => {
  const dbConnected = await connectToDatabase();
  
  if (dbConnected) {
    try {
      await initializeScheduler();
    } catch (error) {
      logger.warn('Планировщик напоминаний не запущен:', error.message);
    }
  }
  
  const server = app.listen(PORT, () => {
    console.log('\n' + '='.repeat(50));
    logger.info(`🚀 Сервер запущен на порту ${PORT}`);
    logger.info(`🌐 Откройте в браузере: http://localhost:${PORT}`);
    logger.info(`🔗 API доступен по: http://localhost:${PORT}/api`);
    logger.info(`📊 База данных: ${dbConnected ? '✅ подключена' : '❌ не подключена'}`);
    console.log('='.repeat(50) + '\n');
    
    // Информация о доступных маршрутах
    console.log('📋 Доступные API endpoints:');
    console.log('   • GET  /api/health     - Проверка статуса сервера');
    console.log('   • GET  /api/test       - Тестовый endpoint');
    console.log('   • GET  /api/auth       - Аутентификация');
    console.log('   • GET  /api/habits     - Привычки');
    console.log('   • GET  /api/goals      - Цели');
    console.log('   • GET  /api/entries    - Записи');
    console.log('   • GET  /api/reminders  - Напоминания');
    console.log('   • GET  /api/admin      - Админ-панель');
    console.log('');
  });
  
  // Обработка ошибок сервера
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      logger.error(`❌ Порт ${PORT} уже используется`);
      process.exit(1);
    } else {
      logger.error('❌ Ошибка сервера:', error);
    }
  });
  
  // Graceful shutdown
  const shutdown = (signal) => {
    logger.info(`\n🛑 Получен сигнал ${signal}. Завершение...`);
    server.close(() => {
      logger.info('✅ Сервер остановлен');
      process.exit(0);
    });
    
    setTimeout(() => {
      logger.error('⏰ Принудительное завершение');
      process.exit(1);
    }, 5000);
  };
  
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

// ==================== ЗАПУСК ====================
// Сначала создаем все необходимые заглушки
const requiredRoutes = ['auth', 'habits', 'goals', 'entries', 'admin', 'reminders'];
requiredRoutes.forEach(route => {
  const routePath = path.join(__dirname, 'routes', `${route}.js`);
  const stubPath = path.join(__dirname, 'routes', `${route}_simple.js`);
  
  if (!fs.existsSync(routePath) && !fs.existsSync(stubPath)) {
    createSimpleRouteStub(route);
  }
});

// Запускаем сервер
startServer().catch(error => {
  logger.error('❌ Не удалось запустить сервер:', error);
  process.exit(1);
});

module.exports = app;