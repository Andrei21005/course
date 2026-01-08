const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');

// Импорты
const Entry = require('../models/Entry');
const Habit = require('../models/Habit');
const { auth } = require('../middleware/auth');

// Простой логгер
let logger;
try {
  logger = require('../utils/logger');
} catch (error) {
  logger = {
    info: (...args) => console.log('[INFO]', ...args),
    error: (...args) => console.error('[ERROR]', ...args)
  };
}

// ==================== ПОЛУЧЕНИЕ ЗАПИСЕЙ ====================
router.get('/', auth, async (req, res) => {
  try {
    const { startDate, endDate, habitId, status, page = 1, limit = 20 } = req.query;
    
    // Фильтр
    const filter = { userId: req.user.id };
    
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }
    
    if (habitId) filter.habitId = habitId;
    if (status) filter.status = status;
    
    // Пагинация
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Получаем записи
    const entries = await Entry.find(filter)
      .sort({ date: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('habitId', 'name category color');
    
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
    logger.error('Ошибка получения записей:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при загрузке записей'
    });
  }
});

// ==================== СОЗДАНИЕ ЗАПИСИ ====================
router.post('/', 
  auth,
  [
    body('habitId').isMongoId().withMessage('Некорректный ID привычки'),
    body('date').isISO8601().withMessage('Некорректный формат даты'),
    body('status').isIn(['completed', 'skipped', 'partial', 'not_done'])
  ],
  async (req, res) => {
    try {
      // Валидация
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Ошибка валидации',
          errors: errors.array()
        });
      }
      
      const { habitId, date, status, notes, value } = req.body;
      
      // Проверка привычки
      const habit = await Habit.findOne({ _id: habitId, userId: req.user.id });
      if (!habit) {
        return res.status(404).json({
          success: false,
          message: 'Привычка не найдена'
        });
      }
      
      // Создаем запись
      const entryData = {
        userId: req.user.id,
        habitId,
        date: new Date(date),
        status,
        notes,
        value
      };
      
      // Ищем существующую запись на эту дату
      const existingEntry = await Entry.findOne({
        userId: req.user.id,
        habitId,
        date: new Date(date)
      });
      
      let entry;
      if (existingEntry) {
        // Обновляем существующую
        entry = await Entry.findByIdAndUpdate(
          existingEntry._id,
          { $set: entryData },
          { new: true }
        );
      } else {
        // Создаем новую
        entry = new Entry(entryData);
        await entry.save();
      }
      
      logger.info(`Запись ${existingEntry ? 'обновлена' : 'создана'}: ${entry._id}`);
      
      res.status(201).json({
        success: true,
        message: 'Запись сохранена',
        data: entry
      });
    } catch (error) {
      logger.error('Ошибка создания записи:', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка при сохранении записи'
      });
    }
  }
);

// ==================== СТАТИСТИКА ====================
router.get('/stats', auth, async (req, res) => {
  try {
    // Последние 30 дней
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // Простая статистика
    const totalEntries = await Entry.countDocuments({
      userId: req.user.id,
      date: { $gte: thirtyDaysAgo }
    });
    
    const completedEntries = await Entry.countDocuments({
      userId: req.user.id,
      date: { $gte: thirtyDaysAgo },
      status: 'completed'
    });
    
    // Текущий стрик (упрощенный)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let streak = 0;
    let checkDate = new Date(today);
    
    // Проверяем последние 365 дней
    for (let i = 0; i < 365; i++) {
      const hasEntry = await Entry.findOne({
        userId: req.user.id,
        date: checkDate,
        status: 'completed'
      });
      
      if (hasEntry) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
    
    const completionRate = totalEntries > 0 
      ? Math.round((completedEntries / totalEntries) * 100) 
      : 0;
    
    res.json({
      success: true,
      data: {
        stats: {
          total: totalEntries,
          completed: completedEntries,
          completionRate
        },
        currentStreak: streak
      }
    });
  } catch (error) {
    logger.error('Ошибка статистики:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при загрузке статистики'
    });
  }
});

// ==================== УДАЛЕНИЕ ЗАПИСИ ====================
router.delete('/:id', auth, async (req, res) => {
  try {
    const entryId = req.params.id;
    
    // Проверяем владельца
    const entry = await Entry.findOne({ _id: entryId, userId: req.user.id });
    
    if (!entry) {
      return res.status(404).json({
        success: false,
        message: 'Запись не найдена'
      });
    }
    
    await Entry.findByIdAndDelete(entryId);
    
    logger.info(`Запись удалена: ${entryId}`);
    
    res.json({
      success: true,
      message: 'Запись удалена'
    });
  } catch (error) {
    logger.error('Ошибка удаления записи:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при удалении записи'
    });
  }
});

module.exports = router;