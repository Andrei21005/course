const express = require('express');
const router = express.Router();
const { body, validationResult, param, query } = require('express-validator');

// Импорты моделей (проверьте, что файлы существуют)
const User = require('../models/User');
const Habit = require('../models/Habit');
const Goal = require('../models/Goal');
const Entry = require('../models/Entry');
const Reminder = require('../models/Reminder');

// Импорты middleware (проверьте, что файлы существуют)
const { auth } = require('../middleware/auth');
const { checkRole } = require('../middleware/checkRole');

// Простой логгер на случай отсутствия файла
let logger;
try {
  logger = require('../utils/logger');
} catch (error) {
  logger = {
    info: (...args) => console.log('[INFO]', ...args),
    error: (...args) => console.error('[ERROR]', ...args),
    warn: (...args) => console.warn('[WARN]', ...args)
  };
}

// ВСЕ маршруты требуют аутентификации и роли admin
// Разделяем middleware для правильной работы
router.use(auth);
router.use((req, res, next) => {
  checkRole(['admin'])(req, res, next);
});

// ==================== АДМИН-ДАШБОРД ====================
router.get('/dashboard', async (req, res) => {
  try {
    // Простая заглушка для быстрого запуска
    const dashboardData = {
      users: {
        total: 0,
        newLast30Days: 0,
        active: 0,
        byRole: {}
      },
      habits: {
        total: 0,
        newLast30Days: 0,
        byCategory: {},
        byPrivacy: {}
      },
      entries: {
        totalLast30Days: 0,
        byStatus: {},
        dailyAverage: 0
      },
      other: {
        totalGoals: 0,
        totalReminders: 0
      },
      recentActivities: []
    };
    
    logger.info('Админ-дашборд загружен (заглушка)');
    
    res.json({
      success: true,
      data: dashboardData
    });
  } catch (error) {
    logger.error('Ошибка админ-дашборда:', error.message);
    res.status(500).json({
      success: false,
      message: 'Ошибка сервера'
    });
  }
});

// ==================== УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ ====================
router.get('/users', 
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('role').optional().isIn(['user', 'admin']),
    query('status').optional().isIn(['active', 'inactive']),
    query('search').optional().trim(),
    query('sortBy').optional().isIn(['createdAt', 'lastActive', 'username', 'email']),
    query('sortOrder').optional().isIn(['asc', 'desc'])
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Ошибка валидации',
          errors: errors.array()
        });
      }
      
      const {
        page = 1,
        limit = 20,
        role,
        status,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;
      
      // Простой фильтр
      const filter = {};
      if (role) filter.role = role;
      if (status === 'active') filter.isActive = true;
      if (status === 'inactive') filter.isActive = false;
      
      // Пагинация
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;
      
      // Сортировка
      const sort = {};
      sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
      
      // Получаем пользователей (без паролей)
      const users = await User.find(filter, '-password')
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean();
      
      const total = await User.countDocuments(filter);
      
      res.json({
        success: true,
        data: {
          users,
          pagination: {
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum)
          }
        }
      });
    } catch (error) {
      logger.error('Ошибка загрузки пользователей:', error.message);
      res.status(500).json({
        success: false,
        message: 'Ошибка сервера'
      });
    }
  }
);

router.get('/users/:id',
  [
    param('id').isMongoId().withMessage('Некорректный ID')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Ошибка валидации',
          errors: errors.array()
        });
      }
      
      const userId = req.params.id;
      const user = await User.findById(userId, '-password').lean();
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Пользователь не найден'
        });
      }
      
      res.json({
        success: true,
        data: user
      });
    } catch (error) {
      logger.error('Ошибка загрузки пользователя:', error.message);
      res.status(500).json({
        success: false,
        message: 'Ошибка сервера'
      });
    }
  }
);

router.put('/users/:id',
  [
    param('id').isMongoId(),
    body('role').optional().isIn(['user', 'admin']),
    body('isActive').optional().isBoolean()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Ошибка валидации',
          errors: errors.array()
        });
      }
      
      const userId = req.params.id;
      const updateData = req.body;
      
      // Запрещаем обновлять некоторые поля
      delete updateData.password;
      delete updateData.email;
      delete updateData.username;
      
      const user = await User.findByIdAndUpdate(
        userId,
        { $set: updateData },
        { new: true }
      ).select('-password');
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Пользователь не найден'
        });
      }
      
      res.json({
        success: true,
        message: 'Пользователь обновлен',
        data: user
      });
    } catch (error) {
      logger.error('Ошибка обновления пользователя:', error.message);
      res.status(500).json({
        success: false,
        message: 'Ошибка сервера'
      });
    }
  }
);

// ==================== УПРАВЛЕНИЕ ПРИВЫЧКАМИ ====================
router.get('/habits',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('category').optional(),
    query('privacy').optional().isIn(['private', 'public']),
    query('userId').optional().isMongoId(),
    query('sortBy').optional().isIn(['createdAt', 'updatedAt', 'name']),
    query('sortOrder').optional().isIn(['asc', 'desc'])
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Ошибка валидации',
          errors: errors.array()
        });
      }
      
      const {
        page = 1,
        limit = 20,
        category,
        privacy,
        userId,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;
      
      const filter = {};
      if (category && category !== 'all') filter.category = category;
      if (privacy) filter.privacy = privacy;
      if (userId) filter.userId = userId;
      
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;
      
      const sort = {};
      sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
      
      const habits = await Habit.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .populate('userId', 'username email')
        .lean();
      
      const total = await Habit.countDocuments(filter);
      
      res.json({
        success: true,
        data: {
          habits,
          pagination: {
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum)
          }
        }
      });
    } catch (error) {
      logger.error('Ошибка загрузки привычек:', error.message);
      res.status(500).json({
        success: false,
        message: 'Ошибка сервера'
      });
    }
  }
);

// ==================== СИСТЕМНЫЕ ФУНКЦИИ ====================
router.get('/system/health', async (req, res) => {
  try {
    const healthInfo = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`
      },
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    };
    
    res.json({
      success: true,
      data: healthInfo
    });
  } catch (error) {
    logger.error('Ошибка проверки здоровья:', error.message);
    res.status(500).json({
      success: false,
      message: 'Ошибка сервера'
    });
  }
});

// ==================== ПРОСТЫЕ МАРШРУТЫ ДЛЯ ОСТАЛЬНОГО ====================
router.get('/system/logs', (req, res) => {
  res.json({
    success: true,
    data: {
      logs: [
        {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: 'Админ-панель загружена'
        }
      ],
      total: 1
    }
  });
});

router.post('/system/cleanup', (req, res) => {
  res.json({
    success: true,
    message: 'Очистка выполнена (заглушка)',
    data: { results: {} }
  });
});

module.exports = router;