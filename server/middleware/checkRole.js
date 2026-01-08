const logger = require('../utils/logger');

/**
 * Middleware для проверки ролей пользователя
 * @param {Array} roles - Массив разрешенных ролей
 * @returns {Function} Express middleware
 */
const checkRole = (roles) => {
  return (req, res, next) => {
    // Проверяем, что пользователь аутентифицирован
    if (!req.user) {
      logger.warn('Попытка доступа к защищенному ресурсу без аутентификации', {
        ip: req.ip,
        path: req.path,
        method: req.method
      });
      
      return res.status(401).json({
        success: false,
        message: 'Не авторизован. Пожалуйста, войдите в систему.',
        error: 'UNAUTHORIZED',
        timestamp: new Date().toISOString()
      });
    }
    
    // Проверяем, что у пользователя есть необходимая роль
    if (!roles.includes(req.user.role)) {
      logger.warn('Попытка доступа к ресурсу без достаточных прав', {
        userId: req.user.id,
        userRole: req.user.role,
        requiredRoles: roles,
        ip: req.ip,
        path: req.path
      });
      
      return res.status(403).json({
        success: false,
        message: `Недостаточно прав. Требуемая роль: ${roles.join(', ')}`,
        error: 'FORBIDDEN',
        requiredRoles: roles,
        userRole: req.user.role,
        timestamp: new Date().toISOString()
      });
    }
    
    // Проверяем, активен ли пользователь
    if (!req.user.isActive) {
      logger.warn('Попытка доступа деактивированным пользователем', {
        userId: req.user.id,
        ip: req.ip
      });
      
      return res.status(403).json({
        success: false,
        message: 'Ваш аккаунт деактивирован. Обратитесь к администратору.',
        error: 'ACCOUNT_DEACTIVATED',
        timestamp: new Date().toISOString()
      });
    }
    
    // Проверяем, не заблокирован ли пользователь из-за неудачных попыток входа
    if (req.user.lockUntil && req.user.lockUntil > new Date()) {
      const lockTimeLeft = Math.ceil((req.user.lockUntil - new Date()) / 1000 / 60); // в минутах
      
      logger.warn('Попытка доступа заблокированным пользователем', {
        userId: req.user.id,
        lockUntil: req.user.lockUntil,
        ip: req.ip
      });
      
      return res.status(403).json({
        success: false,
        message: `Ваш аккаунт временно заблокирован. Попробуйте снова через ${lockTimeLeft} минут.`,
        error: 'ACCOUNT_LOCKED',
        lockUntil: req.user.lockUntil,
        timestamp: new Date().toISOString()
      });
    }
    
    // Логируем успешный доступ к защищенному ресурсу (только для админских эндпоинтов)
    if (roles.includes('admin') && req.method !== 'GET') {
      logger.info('Доступ к админскому ресурсу', {
        userId: req.user.id,
        userRole: req.user.role,
        path: req.path,
        method: req.method,
        ip: req.ip
      });
    }
    
    next();
  };
};

/**
 * Middleware для проверки владения ресурсом
 * Проверяет, принадлежит ли ресурс текущему пользователю
 */
const checkOwnership = (modelName, paramName = 'id') => {
  return async (req, res, next) => {
    try {
      const Model = require(`../models/${modelName}`);
      const resourceId = req.params[paramName];
      
      // Получаем ресурс
      const resource = await Model.findById(resourceId);
      
      if (!resource) {
        return res.status(404).json({
          success: false,
          message: 'Ресурс не найден',
          error: 'NOT_FOUND'
        });
      }
      
      // Проверяем, является ли пользователь владельцем
      // (предполагаем, что у ресурса есть поле userId)
      if (resource.userId.toString() !== req.user.id && req.user.role !== 'admin') {
        logger.warn('Попытка доступа к чужому ресурсу', {
          userId: req.user.id,
          resourceId: resourceId,
          resourceOwner: resource.userId,
          path: req.path,
          method: req.method
        });
        
        return res.status(403).json({
          success: false,
          message: 'У вас нет прав для доступа к этому ресурсу',
          error: 'FORBIDDEN'
        });
      }
      
      // Добавляем ресурс в запрос для дальнейшего использования
      req.resource = resource;
      next();
    } catch (error) {
      logger.error('Ошибка при проверке владения ресурсом', {
        error: error.message,
        modelName,
        resourceId: req.params[paramName],
        userId: req.user.id
      });
      
      res.status(500).json({
        success: false,
        message: 'Ошибка при проверке прав доступа',
        error: 'SERVER_ERROR'
      });
    }
  };
};

/**
 * Middleware для проверки публичного доступа
 * Разрешает доступ если ресурс публичный или пользователь - владелец/админ
 */
const checkPublicOrOwned = (modelName, paramName = 'id') => {
  return async (req, res, next) => {
    try {
      const Model = require(`../models/${modelName}`);
      const resourceId = req.params[paramName];
      
      const resource = await Model.findById(resourceId);
      
      if (!resource) {
        return res.status(404).json({
          success: false,
          message: 'Ресурс не найден',
          error: 'NOT_FOUND'
        });
      }
      
      // Разрешаем доступ если:
      // 1. Ресурс публичный
      // 2. Пользователь - владелец
      // 3. Пользователь - админ
      const isPublic = resource.privacy === 'public';
      const isOwner = resource.userId.toString() === req.user.id;
      const isAdmin = req.user.role === 'admin';
      
      if (!isPublic && !isOwner && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Это приватный ресурс',
          error: 'FORBIDDEN'
        });
      }
      
      req.resource = resource;
      next();
    } catch (error) {
      logger.error('Ошибка при проверке публичного доступа', {
        error: error.message,
        modelName,
        resourceId: req.params[paramName]
      });
      
      res.status(500).json({
        success: false,
        message: 'Ошибка при проверке доступа',
        error: 'SERVER_ERROR'
      });
    }
  };
};

module.exports = {
  checkRole,
  checkOwnership,
  checkPublicOrOwned
};