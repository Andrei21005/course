const express = require('express');
const router = express.Router();
const { body, validationResult, param } = require('express-validator');
const Goal = require('../models/Goal');
const Habit = require('../models/Habit');
const { auth } = require('../middleware/auth');
const { checkOwnership } = require('../middleware/checkRole');
const logger = require('../utils/logger');

/**
 * @route   GET /api/goals
 * @desc    Получить все цели пользователя
 * @access  Private
 */
router.get('/', auth, async (req, res) => {
  try {
    const {
      status,
      category,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 20,
      includeArchived = false
    } = req.query;
    
    // Подготавливаем фильтр
    const filter = { userId: req.user.id };
    
    if (status && status !== 'all') {
      filter.status = status;
    }
    
    if (category && category !== 'all') {
      filter.category = category;
    }
    
    if (includeArchived === 'false') {
      filter.isArchived = false;
    }
    
    // Настройки пагинации
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Настройки сортировки
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    
    // Получаем цели
    const goals = await Goal.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .populate('habitId', 'name category color')
      .lean();
    
    // Получаем общее количество для пагинации
    const total = await Goal.countDocuments(filter);
    const totalPages = Math.ceil(total / limitNum);
    
    // Вычисляем общую статистику
    const stats = await Goal.aggregate([
      { $match: { userId: req.user._id } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalProgress: { $avg: '$progress' }
        }
      }
    ]);
    
    logger.info('Цели успешно загружены', {
      userId: req.user.id,
      totalGoals: total,
      page: pageNum,
      limit: limitNum
    });
    
    res.json({
      success: true,
      data: {
        goals,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages,
          hasNextPage: pageNum < totalPages,
          hasPrevPage: pageNum > 1
        },
        stats: stats.reduce((acc, stat) => {
          acc[stat._id] = {
            count: stat.count,
            avgProgress: stat.totalProgress
          };
          return acc;
        }, {})
      }
    });
  } catch (error) {
    logger.error('Ошибка при получении целей', {
      error: error.message,
      userId: req.user.id,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      message: 'Ошибка при загрузке целей',
      error: 'SERVER_ERROR'
    });
  }
});

/**
 * @route   GET /api/goals/:id
 * @desc    Получить цель по ID
 * @access  Private
 */
router.get('/:id', 
  auth,
  checkOwnership('Goal'),
  async (req, res) => {
    try {
      const goal = await Goal.findById(req.params.id)
        .populate('habitId', 'name category color icon')
        .populate('userId', 'displayName avatar');
      
      if (!goal) {
        return res.status(404).json({
          success: false,
          message: 'Цель не найдена',
          error: 'NOT_FOUND'
        });
      }
      
      // Получаем прогресс за последние 30 дней
      const progressHistory = await getGoalProgressHistory(goal._id, 30);
      
      logger.info('Цель успешно загружена', {
        userId: req.user.id,
        goalId: goal._id
      });
      
      res.json({
        success: true,
        data: {
          goal: goal.toObject(),
          progressHistory,
          suggestions: generateGoalSuggestions(goal)
        }
      });
    } catch (error) {
      logger.error('Ошибка при получении цели', {
        error: error.message,
        userId: req.user.id,
        goalId: req.params.id
      });
      
      res.status(500).json({
        success: false,
        message: 'Ошибка при загрузке цели',
        error: 'SERVER_ERROR'
      });
    }
  }
);

/**
 * @route   POST /api/goals
 * @desc    Создать новую цель
 * @access  Private
 */
router.post('/', 
  auth,
  [
    body('title').trim().notEmpty().withMessage('Название цели обязательно')
      .isLength({ max: 100 }).withMessage('Название не должно превышать 100 символов'),
    body('description').optional().trim()
      .isLength({ max: 500 }).withMessage('Описание не должно превышать 500 символов'),
    body('targetType').isIn(['days', 'count', 'streak']).withMessage('Некорректный тип цели'),
    body('targetValue').isInt({ min: 1 }).withMessage('Целевое значение должно быть положительным числом'),
    body('deadline').optional().isISO8601().withMessage('Некорректный формат даты'),
    body('habitId').optional().isMongoId().withMessage('Некорректный ID привычки'),
    body('isPublic').optional().isBoolean().withMessage('Некорректное значение публичности')
  ],
  async (req, res) => {
    try {
      // Проверка валидации
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn('Ошибка валидации при создании цели', {
          userId: req.user.id,
          errors: errors.array()
        });
        
        return res.status(400).json({
          success: false,
          message: 'Ошибка валидации',
          errors: errors.array().map(err => ({
            field: err.param,
            message: err.msg
          }))
        });
      }
      
      // Проверяем, существует ли привязанная привычка
      if (req.body.habitId) {
        const habit = await Habit.findOne({
          _id: req.body.habitId,
          userId: req.user.id
        });
        
        if (!habit) {
          return res.status(404).json({
            success: false,
            message: 'Привычка не найдена',
            error: 'HABIT_NOT_FOUND'
          });
        }
      }
      
      // Проверяем deadline (должен быть в будущем)
      if (req.body.deadline && new Date(req.body.deadline) <= new Date()) {
        return res.status(400).json({
          success: false,
          message: 'Срок выполнения должен быть в будущем',
          error: 'INVALID_DEADLINE'
        });
      }
      
      // Создаем цель
      const goalData = {
        ...req.body,
        userId: req.user.id,
        currentValue: 0,
        status: 'active'
      };
      
      const goal = new Goal(goalData);
      await goal.save();
      
      // Если цель привязана к привычке, обновляем привычку
      if (goal.habitId) {
        await Habit.findByIdAndUpdate(goal.habitId, {
          $addToSet: { goals: goal._id }
        });
      }
      
      logger.info('Цель успешно создана', {
        userId: req.user.id,
        goalId: goal._id,
        title: goal.title
      });
      
      res.status(201).json({
        success: true,
        message: 'Цель успешно создана',
        data: goal
      });
    } catch (error) {
      logger.error('Ошибка при создании цели', {
        error: error.message,
        userId: req.user.id,
        stack: error.stack
      });
      
      res.status(500).json({
        success: false,
        message: 'Ошибка при создании цели',
        error: 'SERVER_ERROR'
      });
    }
  }
);

/**
 * @route   PUT /api/goals/:id
 * @desc    Обновить цель
 * @access  Private
 */
router.put('/:id',
  auth,
  checkOwnership('Goal'),
  [
    body('title').optional().trim()
      .isLength({ min: 1, max: 100 }).withMessage('Название должно быть от 1 до 100 символов'),
    body('description').optional().trim()
      .isLength({ max: 500 }).withMessage('Описание не должно превышать 500 символов'),
    body('targetValue').optional().isInt({ min: 1 }).withMessage('Целевое значение должно быть положительным числом'),
    body('deadline').optional().isISO8601().withMessage('Некорректный формат даты'),
    body('currentValue').optional().isInt({ min: 0 }).withMessage('Текущее значение не может быть отрицательным'),
    body('status').optional().isIn(['active', 'completed', 'failed']).withMessage('Некорректный статус'),
    body('isPublic').optional().isBoolean().withMessage('Некорректное значение публичности')
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
      
      const goalId = req.params.id;
      const updateData = req.body;
      
      // Не позволяем менять userId
      delete updateData.userId;
      delete updateData.habitId;
      
      // Проверяем deadline
      if (updateData.deadline && new Date(updateData.deadline) <= new Date()) {
        return res.status(400).json({
          success: false,
          message: 'Срок выполнения должен быть в будущем',
          error: 'INVALID_DEADLINE'
        });
      }
      
      // Обновляем цель
      const goal = await Goal.findByIdAndUpdate(
        goalId,
        { $set: updateData },
        { new: true, runValidators: true }
      ).populate('habitId', 'name category color');
      
      if (!goal) {
        return res.status(404).json({
          success: false,
          message: 'Цель не найдена',
          error: 'NOT_FOUND'
        });
      }
      
      logger.info('Цель успешно обновлена', {
        userId: req.user.id,
        goalId: goal._id
      });
      
      res.json({
        success: true,
        message: 'Цель успешно обновлена',
        data: goal
      });
    } catch (error) {
      logger.error('Ошибка при обновлении цели', {
        error: error.message,
        userId: req.user.id,
        goalId: req.params.id
      });
      
      res.status(500).json({
        success: false,
        message: 'Ошибка при обновлении цели',
        error: 'SERVER_ERROR'
      });
    }
  }
);

/**
 * @route   DELETE /api/goals/:id
 * @desc    Удалить цель
 * @access  Private
 */
router.delete('/:id',
  auth,
  checkOwnership('Goal'),
  async (req, res) => {
    try {
      const goalId = req.params.id;
      const goal = await Goal.findById(goalId);
      
      if (!goal) {
        return res.status(404).json({
          success: false,
          message: 'Цель не найдена',
          error: 'NOT_FOUND'
        });
      }
      
      // Удаляем ссылку на цель из привычки
      if (goal.habitId) {
        await Habit.findByIdAndUpdate(goal.habitId, {
          $pull: { goals: goalId }
        });
      }
      
      // Удаляем цель
      await Goal.findByIdAndDelete(goalId);
      
      logger.info('Цель успешно удалена', {
        userId: req.user.id,
        goalId: goalId,
        title: goal.title
      });
      
      res.json({
        success: true,
        message: 'Цель успешно удалена',
        data: { id: goalId }
      });
    } catch (error) {
      logger.error('Ошибка при удалении цели', {
        error: error.message,
        userId: req.user.id,
        goalId: req.params.id
      });
      
      res.status(500).json({
        success: false,
        message: 'Ошибка при удалении цели',
        error: 'SERVER_ERROR'
      });
    }
  }
);

/**
 * @route   POST /api/goals/:id/progress
 * @desc    Обновить прогресс цели
 * @access  Private
 */
router.post('/:id/progress',
  auth,
  checkOwnership('Goal'),
  [
    body('value').isInt({ min: 0 }).withMessage('Значение должно быть неотрицательным числом'),
    body('action').optional().isIn(['add', 'set']).withMessage('Некорректное действие')
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
      
      const goalId = req.params.id;
      const { value, action = 'add' } = req.body;
      
      const goal = await Goal.findById(goalId);
      
      if (!goal) {
        return res.status(404).json({
          success: false,
          message: 'Цель не найдена',
          error: 'NOT_FOUND'
        });
      }
      
      // Обновляем текущее значение
      let newValue;
      if (action === 'add') {
        newValue = goal.currentValue + value;
      } else {
        newValue = value;
      }
      
      goal.currentValue = Math.min(newValue, goal.targetValue);
      await goal.save();
      
      // Проверяем, достигнута ли цель
      const isCompleted = goal.currentValue >= goal.targetValue;
      
      logger.info('Прогресс цели обновлен', {
        userId: req.user.id,
        goalId: goalId,
        oldValue: goal.currentValue - value,
        newValue: goal.currentValue,
        isCompleted
      });
      
      res.json({
        success: true,
        message: isCompleted ? 'Цель достигнута! 🎉' : 'Прогресс обновлен',
        data: {
          goal,
          isCompleted,
          progress: goal.progress
        }
      });
    } catch (error) {
      logger.error('Ошибка при обновлении прогресса цели', {
        error: error.message,
        userId: req.user.id,
        goalId: req.params.id
      });
      
      res.status(500).json({
        success: false,
        message: 'Ошибка при обновлении прогресса',
        error: 'SERVER_ERROR'
      });
    }
  }
);

/**
 * @route   GET /api/goals/:id/history
 * @desc    Получить историю прогресса цели
 * @access  Private
 */
router.get('/:id/history',
  auth,
  checkOwnership('Goal'),
  async (req, res) => {
    try {
      const goalId = req.params.id;
      const { days = 30 } = req.query;
      
      const history = await getGoalProgressHistory(goalId, parseInt(days));
      
      res.json({
        success: true,
        data: history
      });
    } catch (error) {
      logger.error('Ошибка при получении истории цели', {
        error: error.message,
        userId: req.user.id,
        goalId: req.params.id
      });
      
      res.status(500).json({
        success: false,
        message: 'Ошибка при загрузке истории',
        error: 'SERVER_ERROR'
      });
    }
  }
);

// Вспомогательные функции

/**
 * Получить историю прогресса цели
 */
async function getGoalProgressHistory(goalId, days) {
  const history = [];
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  // В реальной реализации здесь был бы запрос к коллекции Entry
  // Для примера генерируем тестовые данные
  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    
    history.push({
      date: date.toISOString().split('T')[0],
      value: Math.floor(Math.random() * 10), // Тестовое значение
      completed: Math.random() > 0.3
    });
  }
  
  return history;
}

/**
 * Генерация рекомендаций для цели
 */
function generateGoalSuggestions(goal) {
  const suggestions = [];
  
  if (goal.progress < 25) {
    suggestions.push({
      type: 'motivation',
      title: 'Начните с малого',
      message: 'Разбейте большую цель на маленькие шаги. Например, по 5 минут в день.',
      priority: 'high'
    });
  }
  
  if (goal.deadline && daysUntil(goal.deadline) < 7) {
    suggestions.push({
      type: 'deadline',
      title: 'Срок близко!',
      message: `До дедлайна осталось ${daysUntil(goal.deadline)} дней. Увеличьте ежедневные усилия.`,
      priority: 'high'
    });
  }
  
  if (goal.progress >= 75 && goal.progress < 100) {
    suggestions.push({
      type: 'encouragement',
      title: 'Почти у цели!',
      message: 'Вы на финишной прямой! Осталось совсем немного.',
      priority: 'medium'
    });
  }
  
  if (!goal.habitId) {
    suggestions.push({
      type: 'habit',
      title: 'Свяжите с привычкой',
      message: 'Привяжите цель к конкретной привычке для автоматического отслеживания прогресса.',
      priority: 'low'
    });
  }
  
  return suggestions;
}

function daysUntil(date) {
  const now = new Date();
  const target = new Date(date);
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

module.exports = router;