const express = require('express');
const router = express.Router();
const { body, validationResult, param } = require('express-validator');

// Импорты
const Goal = require('../models/Goal');
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

// ==================== ВСЕ ЦЕЛИ ПОЛЬЗОВАТЕЛЯ ====================
router.get('/', auth, async (req, res) => {
  try {
    const {
      status,
      category,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 20
    } = req.query;
    
    // Фильтр
    const filter = { userId: req.user.id };
    
    if (status && status !== 'all') {
      filter.status = status;
    }
    
    if (category && category !== 'all') {
      filter.category = category;
    }
    
    // Пагинация
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Сортировка
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    
    // Получаем цели
    const goals = await Goal.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .populate('habitId', 'name category color')
      .lean();
    
    const total = await Goal.countDocuments(filter);
    
    // Простая статистика
    const activeGoals = await Goal.countDocuments({ 
      userId: req.user.id, 
      status: 'active' 
    });
    
    const completedGoals = await Goal.countDocuments({ 
      userId: req.user.id, 
      status: 'completed' 
    });
    
    res.json({
      success: true,
      data: {
        goals,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum)
        },
        stats: {
          active: activeGoals,
          completed: completedGoals,
          total: activeGoals + completedGoals
        }
      }
    });
  } catch (error) {
    logger.error('Ошибка получения целей:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при загрузке целей'
    });
  }
});

// ==================== ПОЛУЧЕНИЕ КОНКРЕТНОЙ ЦЕЛИ ====================
router.get('/:id', auth, async (req, res) => {
  try {
    const goalId = req.params.id;
    
    // Получаем цель и проверяем владельца
    const goal = await Goal.findOne({ _id: goalId, userId: req.user.id })
      .populate('habitId', 'name category color');
    
    if (!goal) {
      return res.status(404).json({
        success: false,
        message: 'Цель не найдена'
      });
    }
    
    res.json({
      success: true,
      data: goal
    });
  } catch (error) {
    logger.error('Ошибка получения цели:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при загрузке цели'
    });
  }
});

// ==================== СОЗДАНИЕ ЦЕЛИ ====================
router.post('/', 
  auth,
  [
    body('title').trim().notEmpty().withMessage('Название обязательно'),
    body('description').optional().trim(),
    body('targetType').isIn(['days', 'count', 'streak']),
    body('targetValue').isInt({ min: 1 }),
    body('deadline').optional().isISO8601(),
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
      
      const { habitId, ...goalData } = req.body;
      
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
      
      // Проверка дедлайна
      if (goalData.deadline && new Date(goalData.deadline) <= new Date()) {
        return res.status(400).json({
          success: false,
          message: 'Дедлайн должен быть в будущем'
        });
      }
      
      // Создаем цель
      const goal = new Goal({
        ...goalData,
        userId: req.user.id,
        habitId,
        currentValue: 0,
        status: 'active'
      });
      
      await goal.save();
      
      logger.info(`Цель создана: ${goal._id}`);
      
      res.status(201).json({
        success: true,
        message: 'Цель создана',
        data: goal
      });
    } catch (error) {
      logger.error('Ошибка создания цели:', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка при создании цели'
      });
    }
  }
);

// ==================== ОБНОВЛЕНИЕ ЦЕЛИ ====================
router.put('/:id', auth, async (req, res) => {
  try {
    const goalId = req.params.id;
    const updateData = req.body;
    
    // Не позволяем менять владельца
    delete updateData.userId;
    
    // Проверяем существование цели и владельца
    const goal = await Goal.findOne({ _id: goalId, userId: req.user.id });
    
    if (!goal) {
      return res.status(404).json({
        success: false,
        message: 'Цель не найдена'
      });
    }
    
    // Обновляем
    const updatedGoal = await Goal.findByIdAndUpdate(
      goalId,
      { $set: updateData },
      { new: true }
    );
    
    logger.info(`Цель обновлена: ${goalId}`);
    
    res.json({
      success: true,
      message: 'Цель обновлена',
      data: updatedGoal
    });
  } catch (error) {
    logger.error('Ошибка обновления цели:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при обновлении цели'
    });
  }
});

// ==================== УДАЛЕНИЕ ЦЕЛИ ====================
router.delete('/:id', auth, async (req, res) => {
  try {
    const goalId = req.params.id;
    
    // Проверяем существование цели и владельца
    const goal = await Goal.findOne({ _id: goalId, userId: req.user.id });
    
    if (!goal) {
      return res.status(404).json({
        success: false,
        message: 'Цель не найдена'
      });
    }
    
    // Удаляем цель
    await Goal.findByIdAndDelete(goalId);
    
    logger.info(`Цель удалена: ${goalId}`);
    
    res.json({
      success: true,
      message: 'Цель удалена'
    });
  } catch (error) {
    logger.error('Ошибка удаления цели:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при удалении цели'
    });
  }
});

// ==================== ОБНОВЛЕНИЕ ПРОГРЕССА ====================
router.post('/:id/progress', 
  auth,
  [
    body('value').isInt({ min: 0 })
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
      
      const goalId = req.params.id;
      const { value } = req.body;
      
      // Получаем цель
      const goal = await Goal.findOne({ _id: goalId, userId: req.user.id });
      
      if (!goal) {
        return res.status(404).json({
          success: false,
          message: 'Цель не найдена'
        });
      }
      
      // Обновляем прогресс
      goal.currentValue = Math.min(goal.currentValue + value, goal.targetValue);
      
      // Проверяем выполнение
      if (goal.currentValue >= goal.targetValue) {
        goal.status = 'completed';
        goal.completedAt = new Date();
      }
      
      await goal.save();
      
      const isCompleted = goal.status === 'completed';
      
      logger.info(`Прогресс цели обновлен: ${goalId}, выполнена: ${isCompleted}`);
      
      res.json({
        success: true,
        message: isCompleted ? 'Цель достигнута!' : 'Прогресс обновлен',
        data: {
          goal,
          isCompleted,
          progress: goal.progress
        }
      });
    } catch (error) {
      logger.error('Ошибка обновления прогресса:', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка при обновлении прогресса'
      });
    }
  }
);

module.exports = router;