const express = require('express');
const router = express.Router();
const { body, validationResult, param } = require('express-validator');
const Reminder = require('../models/Reminder');
const Habit = require('../models/Habit');
const { auth } = require('../middleware/auth');
const { checkOwnership } = require('../middleware/checkRole');
const logger = require('../utils/logger');
const schedule = require('node-schedule');

// Кэш для планировщика напоминаний
const reminderJobs = new Map();

/**
 * @route   GET /api/reminders
 * @desc    Получить все напоминания пользователя
 * @access  Private
 */
router.get('/', auth, async (req, res) => {
  try {
    const { activeOnly = 'true', habitId } = req.query;
    
    const filter = { userId: req.user.id };
    
    if (activeOnly === 'true') {
      filter.isActive = true;
    }
    
    if (habitId) {
      // Проверяем, что привычка принадлежит пользователю
      const habit = await Habit.findOne({ _id: habitId, userId: req.user.id });
      if (!habit) {
        return res.status(404).json({
          success: false,
          message: 'Привычка не найдена',
          error: 'HABIT_NOT_FOUND'
        });
      }
      filter.habitId = habitId;
    }
    
    const reminders = await Reminder.find(filter)
      .populate('habitId', 'name category color icon')
      .sort({ time: 1 });
    
    // Получаем информацию о следующих запусках
    const remindersWithSchedule = reminders.map(reminder => {
      const reminderObj = reminder.toObject();
      reminderObj.nextSendTime = reminder.nextSendTime;
      reminderObj.isScheduled = reminderJobs.has(reminder._id.toString());
      return reminderObj;
    });
    
    logger.info('Напоминания загружены', {
      userId: req.user.id,
      count: reminders.length,
      activeOnly
    });
    
    res.json({
      success: true,
      data: remindersWithSchedule
    });
  } catch (error) {
    logger.error('Ошибка при получении напоминаний', {
      error: error.message,
      userId: req.user.id
    });
    
    res.status(500).json({
      success: false,
      message: 'Ошибка при загрузке напоминаний',
      error: 'SERVER_ERROR'
    });
  }
});

/**
 * @route   GET /api/reminders/:id
 * @desc    Получить напоминание по ID
 * @access  Private
 */
router.get('/:id',
  auth,
  checkOwnership('Reminder'),
  async (req, res) => {
    try {
      const reminder = await Reminder.findById(req.params.id)
        .populate('habitId', 'name category color icon')
        .populate('userId', 'displayName email');
      
      if (!reminder) {
        return res.status(404).json({
          success: false,
          message: 'Напоминание не найдено',
          error: 'NOT_FOUND'
        });
      }
      
      const reminderObj = reminder.toObject();
      reminderObj.nextSendTime = reminder.nextSendTime;
      reminderObj.isScheduled = reminderJobs.has(reminder._id.toString());
      
      res.json({
        success: true,
        data: reminderObj
      });
    } catch (error) {
      logger.error('Ошибка при получении напоминания', {
        error: error.message,
        userId: req.user.id,
        reminderId: req.params.id
      });
      
      res.status(500).json({
        success: false,
        message: 'Ошибка при загрузке напоминания',
        error: 'SERVER_ERROR'
      });
    }
  }
);

/**
 * @route   POST /api/reminders
 * @desc    Создать новое напоминание
 * @access  Private
 */
router.post('/',
  auth,
  [
    body('title').trim().notEmpty().withMessage('Название напоминания обязательно')
      .isLength({ max: 100 }).withMessage('Название не должно превышать 100 символов'),
    body('message').optional().trim()
      .isLength({ max: 500 }).withMessage('Сообщение не должно превышать 500 символов'),
    body('type').isIn(['push', 'email', 'sms', 'in_app']).withMessage('Некорректный тип напоминания'),
    body('frequency').isIn(['once', 'daily', 'weekly', 'monthly', 'custom']).withMessage('Некорректная частота'),
    body('time.hour').isInt({ min: 0, max: 23 }).withMessage('Час должен быть от 0 до 23'),
    body('time.minute').isInt({ min: 0, max: 59 }).withMessage('Минуты должны быть от 0 до 59'),
    body('daysOfWeek').optional().isArray().withMessage('daysOfWeek должен быть массивом'),
    body('daysOfWeek.*').optional().isInt({ min: 0, max: 6 }).withMessage('Дни недели должны быть от 0 до 6'),
    body('startDate').optional().isISO8601().withMessage('Некорректный формат даты начала'),
    body('endDate').optional().isISO8601().withMessage('Некорректный формат даты окончания'),
    body('habitId').optional().isMongoId().withMessage('Некорректный ID привычки'),
    body('isActive').optional().isBoolean().withMessage('isActive должен быть boolean')
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
      
      const { habitId, ...reminderData } = req.body;
      
      // Проверяем привычку, если указана
      if (habitId) {
        const habit = await Habit.findOne({ _id: habitId, userId: req.user.id });
        if (!habit) {
          return res.status(404).json({
            success: false,
            message: 'Привычка не найдена',
            error: 'HABIT_NOT_FOUND'
          });
        }
      }
      
      // Проверяем даты
      if (reminderData.startDate && new Date(reminderData.startDate) < new Date()) {
        return res.status(400).json({
          success: false,
          message: 'Дата начала должна быть в будущем',
          error: 'INVALID_START_DATE'
        });
      }
      
      if (reminderData.endDate && reminderData.startDate && 
          new Date(reminderData.endDate) <= new Date(reminderData.startDate)) {
        return res.status(400).json({
          success: false,
          message: 'Дата окончания должна быть позже даты начала',
          error: 'INVALID_END_DATE'
        });
      }
      
      // Создаем напоминание
      const reminder = new Reminder({
        ...reminderData,
        userId: req.user.id,
        habitId
      });
      
      await reminder.save();
      
      // Если напоминание активно, добавляем в планировщик
      if (reminder.isActive) {
        scheduleReminder(reminder);
      }
      
      // Если напоминание привязано к привычке, обновляем привычку
      if (habitId) {
        await Habit.findByIdAndUpdate(habitId, {
          $addToSet: { reminders: reminder._id }
        });
      }
      
      logger.info('Напоминание создано', {
        userId: req.user.id,
        reminderId: reminder._id,
        title: reminder.title,
        frequency: reminder.frequency
      });
      
      const reminderObj = reminder.toObject();
      reminderObj.nextSendTime = reminder.nextSendTime;
      
      res.status(201).json({
        success: true,
        message: 'Напоминание создано',
        data: reminderObj
      });
    } catch (error) {
      logger.error('Ошибка при создании напоминания', {
        error: error.message,
        userId: req.user.id,
        stack: error.stack
      });
      
      res.status(500).json({
        success: false,
        message: 'Ошибка при создании напоминания',
        error: 'SERVER_ERROR'
      });
    }
  }
);

/**
 * @route   PUT /api/reminders/:id
 * @desc    Обновить напоминание
 * @access  Private
 */
router.put('/:id',
  auth,
  checkOwnership('Reminder'),
  [
    body('title').optional().trim()
      .isLength({ min: 1, max: 100 }).withMessage('Название должно быть от 1 до 100 символов'),
    body('message').optional().trim()
      .isLength({ max: 500 }).withMessage('Сообщение не должно превышать 500 символов'),
    body('type').optional().isIn(['push', 'email', 'sms', 'in_app']).withMessage('Некорректный тип напоминания'),
    body('frequency').optional().isIn(['once', 'daily', 'weekly', 'monthly', 'custom']).withMessage('Некорректная частота'),
    body('time.hour').optional().isInt({ min: 0, max: 23 }).withMessage('Час должен быть от 0 до 23'),
    body('time.minute').optional().isInt({ min: 0, max: 59 }).withMessage('Минуты должны быть от 0 до 59'),
    body('daysOfWeek').optional().isArray().withMessage('daysOfWeek должен быть массивом'),
    body('daysOfWeek.*').optional().isInt({ min: 0, max: 6 }).withMessage('Дни недели должны быть от 0 до 6'),
    body('startDate').optional().isISO8601().withMessage('Некорректный формат даты начала'),
    body('endDate').optional().isISO8601().withMessage('Некорректный формат даты окончания'),
    body('isActive').optional().isBoolean().withMessage('isActive должен быть boolean')
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
      
      const reminderId = req.params.id;
      const updateData = req.body;
      
      // Не позволяем менять userId и habitId
      delete updateData.userId;
      delete updateData.habitId;
      
      // Получаем текущее напоминание
      const currentReminder = await Reminder.findById(reminderId);
      if (!currentReminder) {
        return res.status(404).json({
          success: false,
          message: 'Напоминание не найдено',
          error: 'NOT_FOUND'
        });
      }
      
      // Проверяем даты
      if (updateData.startDate && new Date(updateData.startDate) < new Date()) {
        return res.status(400).json({
          success: false,
          message: 'Дата начала должна быть в будущем',
          error: 'INVALID_START_DATE'
        });
      }
      
      if (updateData.endDate && updateData.startDate && 
          new Date(updateData.endDate) <= new Date(updateData.startDate)) {
        return res.status(400).json({
          success: false,
          message: 'Дата окончания должна быть позже даты начала',
          error: 'INVALID_END_DATE'
        });
      }
      
      // Обновляем напоминание
      const reminder = await Reminder.findByIdAndUpdate(
        reminderId,
        { $set: updateData },
        { new: true, runValidators: true }
      );
      
      // Обновляем планировщик
      updateReminderSchedule(reminder);
      
      logger.info('Напоминание обновлено', {
        userId: req.user.id,
        reminderId,
        changes: Object.keys(updateData)
      });
      
      const reminderObj = reminder.toObject();
      reminderObj.nextSendTime = reminder.nextSendTime;
      reminderObj.isScheduled = reminderJobs.has(reminder._id.toString());
      
      res.json({
        success: true,
        message: 'Напоминание обновлено',
        data: reminderObj
      });
    } catch (error) {
      logger.error('Ошибка при обновлении напоминания', {
        error: error.message,
        userId: req.user.id,
        reminderId: req.params.id
      });
      
      res.status(500).json({
        success: false,
        message: 'Ошибка при обновлении напоминания',
        error: 'SERVER_ERROR'
      });
    }
  }
);

/**
 * @route   DELETE /api/reminders/:id
 * @desc    Удалить напоминание
 * @access  Private
 */
router.delete('/:id',
  auth,
  checkOwnership('Reminder'),
  async (req, res) => {
    try {
      const reminderId = req.params.id;
      const reminder = await Reminder.findById(reminderId);
      
      if (!reminder) {
        return res.status(404).json({
          success: false,
          message: 'Напоминание не найдено',
          error: 'NOT_FOUND'
        });
      }
      
      // Удаляем из планировщика
      cancelReminderSchedule(reminderId);
      
      // Удаляем ссылку из привычки
      if (reminder.habitId) {
        await Habit.findByIdAndUpdate(reminder.habitId, {
          $pull: { reminders: reminderId }
        });
      }
      
      // Удаляем напоминание
      await Reminder.findByIdAndDelete(reminderId);
      
      logger.info('Напоминание удалено', {
        userId: req.user.id,
        reminderId,
        title: reminder.title
      });
      
      res.json({
        success: true,
        message: 'Напоминание удалено',
        data: { id: reminderId }
      });
    } catch (error) {
      logger.error('Ошибка при удалении напоминания', {
        error: error.message,
        userId: req.user.id,
        reminderId: req.params.id
      });
      
      res.status(500).json({
        success: false,
        message: 'Ошибка при удалении напоминания',
        error: 'SERVER_ERROR'
      });
    }
  }
);

/**
 * @route   POST /api/reminders/:id/toggle
 * @desc    Включить/выключить напоминание
 * @access  Private
 */
router.post('/:id/toggle',
  auth,
  checkOwnership('Reminder'),
  async (req, res) => {
    try {
      const reminderId = req.params.id;
      const reminder = await Reminder.findById(reminderId);
      
      if (!reminder) {
        return res.status(404).json({
          success: false,
          message: 'Напоминание не найдено',
          error: 'NOT_FOUND'
        });
      }
      
      // Переключаем статус
      reminder.isActive = !reminder.isActive;
      await reminder.save();
      
      // Обновляем планировщик
      if (reminder.isActive) {
        scheduleReminder(reminder);
      } else {
        cancelReminderSchedule(reminderId);
      }
      
      logger.info('Статус напоминания изменен', {
        userId: req.user.id,
        reminderId,
        isActive: reminder.isActive
      });
      
      const reminderObj = reminder.toObject();
      reminderObj.nextSendTime = reminder.nextSendTime;
      reminderObj.isScheduled = reminderJobs.has(reminder._id.toString());
      
      res.json({
        success: true,
        message: reminder.isActive ? 'Напоминание включено' : 'Напоминание выключено',
        data: reminderObj
      });
    } catch (error) {
      logger.error('Ошибка при переключении напоминания', {
        error: error.message,
        userId: req.user.id,
        reminderId: req.params.id
      });
      
      res.status(500).json({
        success: false,
        message: 'Ошибка при изменении статуса напоминания',
        error: 'SERVER_ERROR'
      });
    }
  }
);

/**
 * @route   POST /api/reminders/:id/test
 * @desc    Отправить тестовое напоминание
 * @access  Private
 */
router.post('/:id/test',
  auth,
  checkOwnership('Reminder'),
  async (req, res) => {
    try {
      const reminderId = req.params.id;
      const reminder = await Reminder.findById(reminderId);
      
      if (!reminder) {
        return res.status(404).json({
          success: false,
          message: 'Напоминание не найдено',
          error: 'NOT_FOUND'
        });
      }
      
      // Отправляем тестовое напоминание
      await sendReminder(reminder, true);
      
      logger.info('Тестовое напоминание отправлено', {
        userId: req.user.id,
        reminderId,
        type: reminder.type
      });
      
      res.json({
        success: true,
        message: 'Тестовое напоминание отправлено',
        data: {
          type: reminder.type,
          sentAt: new Date()
        }
      });
    } catch (error) {
      logger.error('Ошибка при отправке тестового напоминания', {
        error: error.message,
        userId: req.user.id,
        reminderId: req.params.id
      });
      
      res.status(500).json({
        success: false,
        message: 'Ошибка при отправке тестового напоминания',
        error: 'SERVER_ERROR'
      });
    }
  }
);

/**
 * @route   GET /api/reminders/upcoming
 * @desc    Получить предстоящие напоминания
 * @access  Private
 */
router.get('/upcoming', auth, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const reminders = await Reminder.find({
      userId: req.user.id,
      isActive: true
    })
    .sort({ time: 1 })
    .limit(parseInt(limit))
    .populate('habitId', 'name category color icon');
    
    // Фильтруем напоминания, которые должны сработать в ближайшие 24 часа
    const now = new Date();
    const twentyFourHoursLater = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    
    const upcomingReminders = reminders.filter(reminder => {
      const nextSend = reminder.nextSendTime;
      return nextSend && nextSend > now && nextSend <= twentyFourHoursLater;
    });
    
    // Добавляем информацию о времени до напоминания
    const remindersWithTime = upcomingReminders.map(reminder => {
      const reminderObj = reminder.toObject();
      const nextSend = reminder.nextSendTime;
      const timeDiff = nextSend - now;
      
      reminderObj.nextSendTime = nextSend;
      reminderObj.timeUntil = {
        hours: Math.floor(timeDiff / (1000 * 60 * 60)),
        minutes: Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60))
      };
      reminderObj.isToday = nextSend.toDateString() === now.toDateString();
      
      return reminderObj;
    });
    
    res.json({
      success: true,
      data: remindersWithTime
    });
  } catch (error) {
    logger.error('Ошибка при получении предстоящих напоминаний', {
      error: error.message,
      userId: req.user.id
    });
    
    res.status(500).json({
      success: false,
      message: 'Ошибка при загрузке предстоящих напоминаний',
      error: 'SERVER_ERROR'
    });
  }
});

// Функции планировщика

/**
 * Запланировать напоминание
 */
function scheduleReminder(reminder) {
  const reminderId = reminder._id.toString();
  
  // Отменяем существующее задание
  cancelReminderSchedule(reminderId);
  
  if (!reminder.isActive || !reminder.nextSendTime) {
    return;
  }
  
  const job = schedule.scheduleJob(reminder.nextSendTime, async () => {
    try {
      await sendReminder(reminder);
      
      // Обновляем время последней отправки
      await Reminder.findByIdAndUpdate(reminderId, {
        $set: { lastSent: new Date() }
      });
      
      // Если напоминание не разовое, планируем следующее
      if (reminder.frequency !== 'once') {
        const updatedReminder = await Reminder.findById(reminderId);
        if (updatedReminder && updatedReminder.isActive) {
          scheduleReminder(updatedReminder);
        }
      }
    } catch (error) {
      logger.error('Ошибка при отправке запланированного напоминания', {
        error: error.message,
        reminderId,
        userId: reminder.userId
      });
    }
  });
  
  if (job) {
    reminderJobs.set(reminderId, job);
    logger.info('Напоминание запланировано', {
      reminderId,
      nextSendTime: reminder.nextSendTime,
      userId: reminder.userId
    });
  }
}

/**
 * Отменить запланированное напоминание
 */
function cancelReminderSchedule(reminderId) {
  const job = reminderJobs.get(reminderId);
  if (job) {
    job.cancel();
    reminderJobs.delete(reminderId);
    logger.info('Планирование напоминания отменено', { reminderId });
  }
}

/**
 * Обновить планировщик для напоминания
 */
function updateReminderSchedule(reminder) {
  cancelReminderSchedule(reminder._id.toString());
  
  if (reminder.isActive) {
    scheduleReminder(reminder);
  }
}

/**
 * Отправить напоминание
 */
async function sendReminder(reminder, isTest = false) {
  const User = require('../models/User');
  const user = await User.findById(reminder.userId);
  
  if (!user) {
    throw new Error('Пользователь не найден');
  }
  
  const message = {
    id: reminder._id,
    type: reminder.type,
    title: reminder.title,
    message: reminder.message || `Не забудьте про ${reminder.habitId ? 'привычку' : 'задачу'}!`,
    data: {
      habitId: reminder.habitId,
      userId: reminder.userId,
      isTest
    },
    timestamp: new Date(),
    priority: isTest ? 'low' : 'high'
  };
  
  // В реальном приложении здесь была бы интеграция с:
  // 1. Push-уведомлениями (Firebase Cloud Messaging)
  // 2. Email сервисом (SendGrid, Mailgun)
  // 3. SMS сервисом (Twilio)
  // 4. Внутренними уведомлениями (WebSocket)
  
  // Для демонстрации логируем отправку
  logger.info('Напоминание отправлено', {
    reminderId: reminder._id,
    userId: reminder.userId,
    type: reminder.type,
    isTest,
    message: message.message
  });
  
  // Здесь можно добавить реальную отправку
  // Например, для in_app уведомлений можно использовать WebSocket
  
  return message;
}

/**
 * Инициализация планировщика при запуске сервера
 */
async function initializeScheduler() {
  try {
    // Загружаем активные напоминания
    const activeReminders = await Reminder.find({ isActive: true });
    
    for (const reminder of activeReminders) {
      scheduleReminder(reminder);
    }
    
    logger.info('Планировщик напоминаний инициализирован', {
      scheduledCount: activeReminders.length
    });
  } catch (error) {
    logger.error('Ошибка при инициализации планировщика напоминаний', {
      error: error.message
    });
  }
}

// Экспортируем функцию инициализации
module.exports = {
  router,
  initializeScheduler
};