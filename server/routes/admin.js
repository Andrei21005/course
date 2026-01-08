const express = require('express');
const router = express.Router();
const { body, validationResult, param, query } = require('express-validator');
const User = require('../models/User');
const Habit = require('../models/Habit');
const Goal = require('../models/Goal');
const Entry = require('../models/Entry');
const Reminder = require('../models/Reminder');
const { auth } = require('../middleware/auth');
const { checkRole } = require('../middleware/checkRole');
const logger = require('../utils/logger');

// Все маршруты требуют роли admin
router.use(auth, checkRole(['admin']));

/**
 * @route   GET /api/admin/dashboard
 * @desc    Получить статистику для админ-панели
 * @access  Private (Admin only)
 */
router.get('/dashboard', async (req, res) => {
  try {
    // Получаем статистику за последние 30 дней
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const [
      userStats,
      habitStats,
      entryStats,
      recentActivities,
      systemStats
    ] = await Promise.all([
      // Статистика пользователей
      User.aggregate([
        {
          $facet: {
            totalUsers: [{ $count: 'count' }],
            newUsersLast30Days: [
              { $match: { createdAt: { $gte: thirtyDaysAgo } } },
              { $count: 'count' }
            ],
            activeUsers: [
              { $match: { 'stats.lastActive': { $gte: thirtyDaysAgo } } },
              { $count: 'count' }
            ],
            byRole: [
              { $group: { _id: '$role', count: { $sum: 1 } } }
            ]
          }
        }
      ]),
      
      // Статистика привычек
      Habit.aggregate([
        {
          $facet: {
            totalHabits: [{ $count: 'count' }],
            habitsLast30Days: [
              { $match: { createdAt: { $gte: thirtyDaysAgo } } },
              { $count: 'count' }
            ],
            byCategory: [
              { $group: { _id: '$category', count: { $sum: 1 } } }
            ],
            byPrivacy: [
              { $group: { _id: '$privacy', count: { $sum: 1 } } }
            ]
          }
        }
      ]),
      
      // Статистика записей
      Entry.aggregate([
        {
          $match: { createdAt: { $gte: thirtyDaysAgo } }
        },
        {
          $facet: {
            totalEntries: [{ $count: 'count' }],
            byStatus: [
              { $group: { _id: '$status', count: { $sum: 1 } } }
            ],
            dailyAverage: [
              {
                $group: {
                  _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                  count: { $sum: 1 }
                }
              },
              {
                $group: {
                  _id: null,
                  average: { $avg: '$count' }
                }
              }
            ]
          }
        }
      ]),
      
      // Последние активности
      Entry.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('userId', 'displayName username')
        .populate('habitId', 'name category'),
      
      // Системная статистика
      Promise.all([
        Goal.countDocuments(),
        Reminder.countDocuments()
      ])
    ]);
    
    const dashboardData = {
      users: {
        total: userStats[0].totalUsers[0]?.count || 0,
        newLast30Days: userStats[0].newUsersLast30Days[0]?.count || 0,
        active: userStats[0].activeUsers[0]?.count || 0,
        byRole: userStats[0].byRole.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {})
      },
      habits: {
        total: habitStats[0].totalHabits[0]?.count || 0,
        newLast30Days: habitStats[0].habitsLast30Days[0]?.count || 0,
        byCategory: habitStats[0].byCategory.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        byPrivacy: habitStats[0].byPrivacy.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {})
      },
      entries: {
        totalLast30Days: entryStats[0].totalEntries[0]?.count || 0,
        byStatus: entryStats[0].byStatus.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        dailyAverage: entryStats[0].dailyAverage[0]?.average || 0
      },
      other: {
        totalGoals: systemStats[0],
        totalReminders: systemStats[1]
      },
      recentActivities: recentActivities.map(activity => ({
        id: activity._id,
        user: activity.userId ? {
          id: activity.userId._id,
          name: activity.userId.displayName,
          username: activity.userId.username
        } : null,
        habit: activity.habitId ? {
          id: activity.habitId._id,
          name: activity.habitId.name,
          category: activity.habitId.category
        } : null,
        action: activity.status === 'completed' ? 'completed_habit' : 'updated_habit',
        timestamp: activity.createdAt,
        details: {
          status: activity.status,
          value: activity.value,
          notes: activity.notes
        }
      }))
    };
    
    logger.info('Админ-дашборд загружен', {
      adminId: req.user.id
    });
    
    res.json({
      success: true,
      data: dashboardData
    });
  } catch (error) {
    logger.error('Ошибка при загрузке админ-дашборда', {
      error: error.message,
      adminId: req.user.id,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      message: 'Ошибка при загрузке админ-панели',
      error: 'SERVER_ERROR'
    });
  }
});

/**
 * @route   GET /api/admin/users
 * @desc    Получить список пользователей с фильтрами
 * @access  Private (Admin only)
 */
router.get('/users', 
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Номер страницы должен быть положительным числом'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Лимит должен быть от 1 до 100'),
    query('role').optional().isIn(['user', 'admin', 'moderator']).withMessage('Некорректная роль'),
    query('status').optional().isIn(['active', 'inactive']).withMessage('Некорректный статус'),
    query('search').optional().trim(),
    query('sortBy').optional().isIn(['createdAt', 'lastActive', 'username', 'email']).withMessage('Некорректное поле сортировки'),
    query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Некорректный порядок сортировки')
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
      
      // Строим фильтр
      const filter = {};
      
      if (role) filter.role = role;
      if (status === 'active') filter.isActive = true;
      if (status === 'inactive') filter.isActive = false;
      
      if (search) {
        filter.$or = [
          { username: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { displayName: { $regex: search, $options: 'i' } }
        ];
      }
      
      // Настройки пагинации и сортировки
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;
      
      const sort = {};
      sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
      
      // Получаем пользователей
      const users = await User.find(filter, '-password -verificationToken -resetPasswordToken -resetPasswordExpires')
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean();
      
      // Общее количество
      const total = await User.countDocuments(filter);
      
      // Статистика по пользователям
      const stats = await User.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            avgStreak: { $avg: '$stats.streak' },
            avgHabits: { $avg: '$stats.totalHabits' },
            activeToday: {
              $sum: {
                $cond: [
                  {
                    $gte: [
                      '$stats.lastActive',
                      new Date(new Date().setHours(0, 0, 0, 0))
                    ]
                  },
                  1,
                  0
                ]
              }
            }
          }
        }
      ]);
      
      logger.info('Список пользователей загружен', {
        adminId: req.user.id,
        totalUsers: total,
        filter
      });
      
      res.json({
        success: true,
        data: {
          users,
          pagination: {
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum),
            hasNextPage: pageNum < Math.ceil(total / limitNum),
            hasPrevPage: pageNum > 1
          },
          stats: stats[0] || {
            totalUsers: 0,
            avgStreak: 0,
            avgHabits: 0,
            activeToday: 0
          }
        }
      });
    } catch (error) {
      logger.error('Ошибка при загрузке списка пользователей', {
        error: error.message,
        adminId: req.user.id,
        stack: error.stack
      });
      
      res.status(500).json({
        success: false,
        message: 'Ошибка при загрузке пользователей',
        error: 'SERVER_ERROR'
      });
    }
  }
);

/**
 * @route   GET /api/admin/users/:id
 * @desc    Получить детальную информацию о пользователе
 * @access  Private (Admin only)
 */
router.get('/users/:id',
  [
    param('id').isMongoId().withMessage('Некорректный ID пользователя')
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
      
      // Получаем пользователя
      const user = await User.findById(userId, '-password')
        .lean();
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Пользователь не найден',
          error: 'USER_NOT_FOUND'
        });
      }
      
      // Получаем статистику пользователя
      const [habits, goals, entries, reminders] = await Promise.all([
        Habit.countDocuments({ userId }),
        Goal.countDocuments({ userId }),
        Entry.countDocuments({ userId }),
        Reminder.countDocuments({ userId })
      ]);
      
      // Получаем последние активности
      const recentActivities = await Entry.find({ userId })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('habitId', 'name category')
        .lean();
      
      const userDetails = {
        ...user,
        statistics: {
          habits,
          goals,
          entries,
          reminders
        },
        recentActivities: recentActivities.map(activity => ({
          id: activity._id,
          habit: activity.habitId,
          status: activity.status,
          date: activity.date,
          createdAt: activity.createdAt
        }))
      };
      
      logger.info('Детали пользователя загружены', {
        adminId: req.user.id,
        userId
      });
      
      res.json({
        success: true,
        data: userDetails
      });
    } catch (error) {
      logger.error('Ошибка при загрузке деталей пользователя', {
        error: error.message,
        adminId: req.user.id,
        userId: req.params.id
      });
      
      res.status(500).json({
        success: false,
        message: 'Ошибка при загрузке информации о пользователе',
        error: 'SERVER_ERROR'
      });
    }
  }
);

/**
 * @route   PUT /api/admin/users/:id
 * @desc    Обновить информацию о пользователе
 * @access  Private (Admin only)
 */
router.put('/users/:id',
  [
    param('id').isMongoId().withMessage('Некорректный ID пользователя'),
    body('role').optional().isIn(['user', 'admin', 'moderator']).withMessage('Некорректная роль'),
    body('isActive').optional().isBoolean().withMessage('isActive должен быть boolean'),
    body('settings').optional().isObject().withMessage('settings должен быть объектом'),
    body('stats').optional().isObject().withMessage('stats должен быть объектом')
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
      delete updateData.createdAt;
      
      // Обновляем пользователя
      const user = await User.findByIdAndUpdate(
        userId,
        { $set: updateData },
        { new: true, runValidators: true }
      ).select('-password');
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Пользователь не найден',
          error: 'USER_NOT_FOUND'
        });
      }
      
      logger.info('Пользователь обновлен администратором', {
        adminId: req.user.id,
        userId,
        updatedFields: Object.keys(updateData)
      });
      
      res.json({
        success: true,
        message: 'Пользователь успешно обновлен',
        data: user
      });
    } catch (error) {
      logger.error('Ошибка при обновлении пользователя', {
        error: error.message,
        adminId: req.user.id,
        userId: req.params.id
      });
      
      res.status(500).json({
        success: false,
        message: 'Ошибка при обновлении пользователя',
        error: 'SERVER_ERROR'
      });
    }
  }
);

/**
 * @route   DELETE /api/admin/users/:id
 * @desc    Удалить пользователя (мягкое удаление)
 * @access  Private (Admin only)
 */
router.delete('/users/:id',
  [
    param('id').isMongoId().withMessage('Некорректный ID пользователя')
  ],
  async (req, res) => {
    try {
      const userId = req.params.id;
      
      // Проверяем, не пытается ли админ удалить себя
      if (userId === req.user.id) {
        return res.status(400).json({
          success: false,
          message: 'Нельзя удалить свой собственный аккаунт',
          error: 'SELF_DELETION'
        });
      }
      
      // Мягкое удаление: деактивируем пользователя
      const user = await User.findByIdAndUpdate(
        userId,
        { 
          $set: { 
            isActive: false,
            deactivatedAt: new Date(),
            deactivatedBy: req.user.id
          }
        },
        { new: true }
      ).select('-password');
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Пользователь не найден',
          error: 'USER_NOT_FOUND'
        });
      }
      
      logger.warn('Пользователь деактивирован администратором', {
        adminId: req.user.id,
        userId,
        username: user.username
      });
      
      res.json({
        success: true,
        message: 'Пользователь деактивирован',
        data: user
      });
    } catch (error) {
      logger.error('Ошибка при деактивации пользователя', {
        error: error.message,
        adminId: req.user.id,
        userId: req.params.id
      });
      
      res.status(500).json({
        success: false,
        message: 'Ошибка при деактивации пользователя',
        error: 'SERVER_ERROR'
      });
    }
  }
);

/**
 * @route   POST /api/admin/users/:id/restore
 * @desc    Восстановить деактивированного пользователя
 * @access  Private (Admin only)
 */
router.post('/users/:id/restore',
  [
    param('id').isMongoId().withMessage('Некорректный ID пользователя')
  ],
  async (req, res) => {
    try {
      const userId = req.params.id;
      
      const user = await User.findByIdAndUpdate(
        userId,
        { 
          $set: { 
            isActive: true 
          },
          $unset: {
            deactivatedAt: '',
            deactivatedBy: ''
          }
        },
        { new: true }
      ).select('-password');
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Пользователь не найден',
          error: 'USER_NOT_FOUND'
        });
      }
      
      logger.info('Пользователь восстановлен администратором', {
        adminId: req.user.id,
        userId,
        username: user.username
      });
      
      res.json({
        success: true,
        message: 'Пользователь восстановлен',
        data: user
      });
    } catch (error) {
      logger.error('Ошибка при восстановлении пользователя', {
        error: error.message,
        adminId: req.user.id,
        userId: req.params.id
      });
      
      res.status(500).json({
        success: false,
        message: 'Ошибка при восстановлении пользователя',
        error: 'SERVER_ERROR'
      });
    }
  }
);

/**
 * @route   GET /api/admin/habits
 * @desc    Получить список привычек с фильтрами
 * @access  Private (Admin only)
 */
router.get('/habits',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Номер страницы должен быть положительным числом'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Лимит должен быть от 1 до 100'),
    query('category').optional(),
    query('privacy').optional().isIn(['private', 'public', 'friends_only']).withMessage('Некорректный уровень приватности'),
    query('userId').optional().isMongoId().withMessage('Некорректный ID пользователя'),
    query('search').optional().trim(),
    query('sortBy').optional().isIn(['createdAt', 'updatedAt', 'name', 'streak']).withMessage('Некорректное поле сортировки'),
    query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Некорректный порядок сортировки')
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
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;
      
      // Строим фильтр
      const filter = {};
      
      if (category && category !== 'all') filter.category = category;
      if (privacy) filter.privacy = privacy;
      if (userId) filter.userId = userId;
      
      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ];
      }
      
      // Настройки пагинации и сортировки
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;
      
      const sort = {};
      if (sortBy === 'streak') {
        sort['metadata.streak'] = sortOrder === 'asc' ? 1 : -1;
      } else {
        sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
      }
      
      // Получаем привычки
      const habits = await Habit.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .populate('userId', 'username displayName email')
        .lean();
      
      // Общее количество
      const total = await Habit.countDocuments(filter);
      
      // Статистика по привычкам
      const stats = await Habit.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            totalHabits: { $sum: 1 },
            avgStreak: { $avg: '$metadata.streak' },
            avgSuccessRate: { $avg: '$metadata.successRate' },
            totalCompletions: { $sum: '$metadata.totalCompletions' }
          }
        }
      ]);
      
      logger.info('Список привычек загружен администратором', {
        adminId: req.user.id,
        totalHabits: total,
        filter
      });
      
      res.json({
        success: true,
        data: {
          habits,
          pagination: {
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum),
            hasNextPage: pageNum < Math.ceil(total / limitNum),
            hasPrevPage: pageNum > 1
          },
          stats: stats[0] || {
            totalHabits: 0,
            avgStreak: 0,
            avgSuccessRate: 0,
            totalCompletions: 0
          }
        }
      });
    } catch (error) {
      logger.error('Ошибка при загрузке списка привычек', {
        error: error.message,
        adminId: req.user.id,
        stack: error.stack
      });
      
      res.status(500).json({
        success: false,
        message: 'Ошибка при загрузке привычек',
        error: 'SERVER_ERROR'
      });
    }
  }
);

/**
 * @route   GET /api/admin/system/logs
 * @desc    Получить системные логи
 * @access  Private (Admin only)
 */
router.get('/system/logs',
  [
    query('level').optional().isIn(['error', 'warn', 'info', 'debug']).withMessage('Некорректный уровень лога'),
    query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Лимит должен быть от 1 до 1000')
  ],
  async (req, res) => {
    try {
      // В реальном приложении здесь был бы запрос к базе данных с логами
      // или чтение лог-файлов
      
      // Для демонстрации возвращаем заглушку
      const logs = [
        {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: 'Админ-панель загружена',
          userId: req.user.id,
          ip: req.ip
        }
      ];
      
      res.json({
        success: true,
        data: {
          logs,
          total: logs.length
        }
      });
    } catch (error) {
      logger.error('Ошибка при получении системных логов', {
        error: error.message,
        adminId: req.user.id
      });
      
      res.status(500).json({
        success: false,
        message: 'Ошибка при получении логов',
        error: 'SERVER_ERROR'
      });
    }
  }
);

/**
 * @route   GET /api/admin/system/health
 * @desc    Получить информацию о здоровье системы
 * @access  Private (Admin only)
 */
router.get('/system/health', async (req, res) => {
  try {
    const startTime = Date.now();
    
    // Проверяем подключение к базе данных
    const dbStatus = await checkDatabaseHealth();
    
    // Проверяем использование памяти
    const memoryUsage = process.memoryUsage();
    
    // Собираем статистику
    const healthInfo = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      responseTime: Date.now() - startTime,
      database: dbStatus,
      memory: {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
        external: `${Math.round(memoryUsage.external / 1024 / 1024)} MB`
      },
      process: {
        pid: process.pid,
        version: process.version,
        platform: process.platform,
        arch: process.arch
      },
      environment: process.env.NODE_ENV || 'development'
    };
    
    // Определяем общий статус
    if (!dbStatus.connected) {
      healthInfo.status = 'unhealthy';
      healthInfo.issues = ['Database connection failed'];
    }
    
    if (memoryUsage.heapUsed / memoryUsage.heapTotal > 0.9) {
      healthInfo.status = 'warning';
      healthInfo.warnings = ['High memory usage'];
    }
    
    logger.info('Проверка здоровья системы выполнена', {
      adminId: req.user.id,
      status: healthInfo.status
    });
    
    res.json({
      success: true,
      data: healthInfo
    });
  } catch (error) {
    logger.error('Ошибка при проверке здоровья системы', {
      error: error.message,
      adminId: req.user.id
    });
    
    res.status(500).json({
      success: false,
      message: 'Ошибка при проверке здоровья системы',
      error: 'SERVER_ERROR'
    });
  }
});

/**
 * @route   POST /api/admin/system/cleanup
 * @desc    Выполнить очистку системы
 * @access  Private (Admin only)
 */
router.post('/system/cleanup',
  [
    body('type').isIn(['old_entries', 'inactive_users', 'orphaned_data', 'all']).withMessage('Некорректный тип очистки'),
    body('days').optional().isInt({ min: 1 }).withMessage('Количество дней должно быть положительным числом')
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
      
      const { type, days = 30 } = req.body;
      const results = {};
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      switch (type) {
        case 'old_entries':
          // Удаляем старые записи
          const entriesResult = await Entry.deleteMany({
            createdAt: { $lt: cutoffDate },
            status: 'not_done'
          });
          results.entries = entriesResult.deletedCount;
          break;
          
        case 'inactive_users':
          // Архивируем неактивных пользователей
          const usersResult = await User.updateMany(
            {
              isActive: true,
              'stats.lastActive': { $lt: cutoffDate }
            },
            {
              $set: {
                isActive: false,
                deactivatedAt: new Date(),
                deactivatedBy: req.user.id,
                deactivationReason: 'inactivity'
              }
            }
          );
          results.users = usersResult.modifiedCount;
          break;
          
        case 'orphaned_data':
          // Удаляем данные без пользователей
          const [habitsResult, goalsResult, entriesResult2, remindersResult] = await Promise.all([
            Habit.deleteMany({ userId: { $exists: false } }),
            Goal.deleteMany({ userId: { $exists: false } }),
            Entry.deleteMany({ userId: { $exists: false } }),
            Reminder.deleteMany({ userId: { $exists: false } })
          ]);
          
          results.habits = habitsResult.deletedCount;
          results.goals = goalsResult.deletedCount;
          results.entries = entriesResult2.deletedCount;
          results.reminders = remindersResult.deletedCount;
          break;
          
        case 'all':
          // Выполняем все очистки
          const [oldEntries, inactiveUsers, orphanedData] = await Promise.all([
            Entry.deleteMany({
              createdAt: { $lt: cutoffDate },
              status: 'not_done'
            }),
            User.updateMany(
              {
                isActive: true,
                'stats.lastActive': { $lt: cutoffDate }
              },
              {
                $set: {
                  isActive: false,
                  deactivatedAt: new Date(),
                  deactivatedBy: req.user.id,
                  deactivationReason: 'inactivity'
                }
              }
            ),
            Promise.all([
              Habit.deleteMany({ userId: { $exists: false } }),
              Goal.deleteMany({ userId: { $exists: false } }),
              Entry.deleteMany({ userId: { $exists: false } }),
              Reminder.deleteMany({ userId: { $exists: false } })
            ])
          ]);
          
          results.entries = oldEntries.deletedCount;
          results.users = inactiveUsers.modifiedCount;
          results.habits = orphanedData[0].deletedCount;
          results.goals = orphanedData[1].deletedCount;
          results.entriesOrphaned = orphanedData[2].deletedCount;
          results.reminders = orphanedData[3].deletedCount;
          break;
      }
      
      logger.info('Очистка системы выполнена', {
        adminId: req.user.id,
        type,
        days,
        results
      });
      
      res.json({
        success: true,
        message: 'Очистка системы выполнена успешно',
        data: {
          type,
          cutoffDate,
          results
        }
      });
    } catch (error) {
      logger.error('Ошибка при выполнении очистки системы', {
        error: error.message,
        adminId: req.user.id,
        type: req.body.type
      });
      
      res.status(500).json({
        success: false,
        message: 'Ошибка при выполнении очистки',
        error: 'SERVER_ERROR'
      });
    }
  }
);

// Вспомогательные функции

/**
 * Проверить здоровье базы данных
 */
async function checkDatabaseHealth() {
  try {
    const startTime = Date.now();
    
    // Простой запрос для проверки подключения
    await User.findOne().limit(1);
    
    const responseTime = Date.now() - startTime;
    
    // Получаем статистику базы данных
    const db = User.db;
    const adminDb = db.admin();
    const serverStatus = await adminDb.serverStatus();
    
    return {
      connected: true,
      responseTime: `${responseTime}ms`,
      host: db.host,
      name: db.name,
      collections: (await db.listCollections().toArray()).length,
      stats: {
        version: serverStatus.version,
        uptime: serverStatus.uptime,
        connections: serverStatus.connections
      }
    };
  } catch (error) {
    return {
      connected: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = router;