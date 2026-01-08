const express = require('express');
const router = express.Router();
const { body, validationResult, param } = require('express-validator');

// Импорты
const Reminder = require('../models/Reminder');
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

// Кэш для планировщика (упрощенный)
const reminderJobs = new Map();

// ==================== ВСЕ НАПОМИНАНИЯ ====================
router.get('/', auth, async (req, res) => {
  try {
    const { activeOnly = 'true', habitId } = req.query;
    
    const filter = { userId: req.user.id };
    
    if (activeOnly === 'true') {
      filter.isActive = true;
    }
    
    if (habitId) {
      // Проверяем привычку
      const habit = await Habit.findOne({ _id: habitId, userId: req.user.id });
      if (!habit) {
        return res.status(404).json({
          success: false,
          message: 'Привычка не найдена'
        });
      }
      filter.habitId = habitId;
    }
    
    const reminders = await Reminder.find(filter)
      .populate('habitId', 'name category')
      .sort({ time: 1 });
    
    res.json({
      success: true,
      data: reminders
    });
  } catch (error) {
    logger.error('Ошибка получения напоминаний:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при загрузке напоминаний'
    });
  }
});

// ==================== КОНКРЕТНОЕ НАПОМИНАНИЕ ====================
router.get('/:id', auth, async (req, res) => {
  try {
    const reminderId = req.params.id;
    
    const reminder = await Reminder.findOne({ 
      _id: reminderId, 
      userId: req.user.id 
    }).populate('habitId', 'name category');
    
    if (!reminder) {
      return res.status(404).json({
        success: false,
        message: 'Напоминание не найдено'
      });
    }
    
    res.json({
      success: true,
      data: reminder
    });
  } catch (error) {
    logger.error('Ошибка получения напоминания:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при загрузке напоминания'
    });
  }
});

// ==================== СОЗДАНИЕ НАПОМИНАНИЯ ====================
router.post('/',
  auth,
  [
    body('title').trim().notEmpty(),
    body('message').optional().trim(),
    body('type').isIn(['push', 'email', 'sms', 'in_app']),
    body('frequency').isIn(['once', 'daily', 'weekly', 'monthly']),
    body('time.hour').isInt({ min: 0, max: 23 }),
    body('time.minute').isInt({ min: 0, max: 59 }),
    body('habitId').optional().isMongoId()
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
      
      const { habitId, ...reminderData } = req.body;
      
      // Проверка привычки
      if (habitId) {
        const habit = await Habit.findOne({ _id: habitId, userId: req.user.id });
        if (!habit) {
          return res.status(404).json({
            success: false,
            message: 'Привычка не найдена'
          });
        }
      }
      
      // Создаем напоминание
      const reminder = new Reminder({
        ...reminderData,
        userId: req.user.id,
        habitId
      });
      
      await reminder.save();
      
      // Если привязано к привычке
      if (habitId) {
        await Habit.findByIdAndUpdate(habitId, {
          $addToSet: { reminders: reminder._id }
        });
      }
      
      logger.info(`Напоминание создано: ${reminder._id}`);
      
      res.status(201).json({
        success: true,
        message: 'Напоминание создано',
        data: reminder
      });
    } catch (error) {
      logger.error('Ошибка создания напоминания:', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка при создании напоминания'
      });
    }
  }
);

// ==================== ОБНОВЛЕНИЕ НАПОМИНАНИЯ ====================
router.put('/:id', auth, async (req, res) => {
  try {
    const reminderId = req.params.id;
    const updateData = req.body;
    
    // Не позволяем менять владельца
    delete updateData.userId;
    
    // Проверяем существование
    const reminder = await Reminder.findOne({ 
      _id: reminderId, 
      userId: req.user.id 
    });
    
    if (!reminder) {
      return res.status(404).json({
        success: false,
        message: 'Напоминание не найдено'
      });
    }
    
    // Обновляем
    const updatedReminder = await Reminder.findByIdAndUpdate(
      reminderId,
      { $set: updateData },
      { new: true }
    );
    
    logger.info(`Напоминание обновлено: ${reminderId}`);
    
    res.json({
      success: true,
      message: 'Напоминание обновлено',
      data: updatedReminder
    });
  } catch (error) {
    logger.error('Ошибка обновления напоминания:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при обновлении напоминания'
    });
  }
});

// ==================== УДАЛЕНИЕ НАПОМИНАНИЯ ====================
router.delete('/:id', auth, async (req, res) => {
  try {
    const reminderId = req.params.id;
    
    // Проверяем существование
    const reminder = await Reminder.findOne({ 
      _id: reminderId, 
      userId: req.user.id 
    });
    
    if (!reminder) {
      return res.status(404).json({
        success: false,
        message: 'Напоминание не найдено'
      });
    }
    
    // Удаляем ссылку из привычки
    if (reminder.habitId) {
      await Habit.findByIdAndUpdate(reminder.habitId, {
        $pull: { reminders: reminderId }
      });
    }
    
    // Удаляем напоминание
    await Reminder.findByIdAndDelete(reminderId);
    
    logger.info(`Напоминание удалено: ${reminderId}`);
    
    res.json({
      success: true,
      message: 'Напоминание удалено'
    });
  } catch (error) {
    logger.error('Ошибка удаления напоминания:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при удалении напоминания'
    });
  }
});

// ==================== ВКЛЮЧЕНИЕ/ВЫКЛЮЧЕНИЕ ====================
router.post('/:id/toggle', auth, async (req, res) => {
  try {
    const reminderId = req.params.id;
    
    const reminder = await Reminder.findOne({ 
      _id: reminderId, 
      userId: req.user.id 
    });
    
    if (!reminder) {
      return res.status(404).json({
        success: false,
        message: 'Напоминание не найдено'
      });
    }
    
    // Переключаем статус
    reminder.isActive = !reminder.isActive;
    await reminder.save();
    
    logger.info(`Напоминание ${reminder.isActive ? 'включено' : 'выключено'}: ${reminderId}`);
    
    res.json({
      success: true,
      message: reminder.isActive ? 'Напоминание включено' : 'Напоминание выключено',
      data: reminder
    });
  } catch (error) {
    logger.error('Ошибка переключения напоминания:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при изменении статуса'
    });
  }
});

// ==================== БЛИЖАЙШИЕ НАПОМИНАНИЯ ====================
router.get('/upcoming', auth, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const reminders = await Reminder.find({
      userId: req.user.id,
      isActive: true
    })
    .sort({ time: 1 })
    .limit(parseInt(limit))
    .populate('habitId', 'name category');
    
    res.json({
      success: true,
      data: reminders
    });
  } catch (error) {
    logger.error('Ошибка получения ближайших напоминаний:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при загрузке напоминаний'
    });
  }
});

// ==================== ФУНКЦИИ ПЛАНИРОВЩИКА (упрощенные) ====================
function initializeScheduler() {
  console.log('[INFO] Планировщик напоминаний инициализирован (заглушка)');
  return Promise.resolve();
}

module.exports = {
  router,
  initializeScheduler,
  reminderJobs: []
};