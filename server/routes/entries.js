const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Entry = require('../models/Entry');
const Habit = require('../models/Habit');
const { auth } = require('../middleware/auth');
const logger = require('../utils/logger');

// Все роуты требуют аутентификации
router.use(auth);

/**
 * @route   GET /api/entries
 * @desc    Получить записи с фильтрами
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { startDate, endDate, habitId, status, page = 1, limit = 20 } = req.query;
    
    const filter = { userId: req.user.id };
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }
    if (habitId) filter.habitId = habitId;
    if (status) filter.status = status;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const entries = await Entry.find(filter)
      .sort({ date: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('habitId', 'name color category');
    
    const total = await Entry.countDocuments(filter);
    
    res.json({
      success: true,
      data: entries,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Ошибка при получении записей:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при загрузке записей'
    });
  }
});

/**
 * @route   POST /api/entries
 * @desc    Создать запись о выполнении привычки
 * @access  Private
 */
router.post('/', [
  body('habitId').isMongoId().withMessage('Некорректный ID привычки'),
  body('date').isISO8601().withMessage('Некорректный формат даты'),
  body('status').isIn(['completed', 'skipped', 'partial', 'not_done']).withMessage('Некорректный статус')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Ошибка валидации',
        errors: errors.array()
      });
    }
    
    const { habitId, date, status, notes, value } = req.body;
    
    // Проверяем существование привычки
    const habit = await Habit.findOne({ _id: habitId, userId: req.user.id });
    if (!habit) {
      return res.status(404).json({
        success: false,
        message: 'Привычка не найдена'
      });
    }
    
    // Создаем или обновляем запись
    const entry = await Entry.findOneAndUpdate(
      { userId: req.user.id, habitId, date: new Date(date) },
      { status, notes, value, updatedAt: new Date() },
      { upsert: true, new: true, runValidators: true }
    );
    
    logger.info(`Запись создана: ${entry._id} для привычки ${habitId}`);
    
    res.status(201).json({
      success: true,
      message: 'Запись сохранена',
      data: entry
    });
  } catch (error) {
    logger.error('Ошибка при создании записи:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при сохранении записи'
    });
  }
});

/**
 * @route   GET /api/entries/stats
 * @desc    Получить статистику по записям
 * @access  Private
 */
router.get('/stats', async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const stats = await Entry.aggregate([
      {
        $match: {
          userId: req.user._id,
          date: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$count' },
          completed: {
            $sum: {
              $cond: [{ $eq: ['$_id', 'completed'] }, '$count', 0]
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          total: 1,
          completed: 1,
          completionRate: {
            $cond: [
              { $eq: ['$total', 0] },
              0,
              { $multiply: [{ $divide: ['$completed', '$total'] }, 100] }
            ]
          }
        }
      }
    ]);
    
    // Расчет текущего стрика
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let streak = 0;
    let checkDate = new Date(today);
    
    while (true) {
      const dateStr = checkDate.toISOString().split('T')[0];
      const entry = await Entry.findOne({
        userId: req.user.id,
        date: checkDate,
        status: 'completed'
      });
      
      if (entry) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
    
    res.json({
      success: true,
      data: {
        stats: stats[0] || { total: 0, completed: 0, completionRate: 0 },
        currentStreak: streak
      }
    });
  } catch (error) {
    logger.error('Ошибка при получении статистики:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при загрузке статистики'
    });
  }
});

module.exports = router;