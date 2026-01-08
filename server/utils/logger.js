const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Создаем директорию для логов если она не существует
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// Форматы логов
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        return `${timestamp} [${level}]: ${message}${metaStr}`;
    })
);

const fileFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.json()
);

// Создаем логгер
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: fileFormat,
    transports: [
        // Логи ошибок в отдельный файл
        new winston.transports.File({
            filename: path.join(logDir, 'error.log'),
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
            tailable: true
        }),
        
        // Все логи в общий файл
        new winston.transports.File({
            filename: path.join(logDir, 'combined.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 10,
            tailable: true
        }),
        
        // Логи в консоль в development
        ...(process.env.NODE_ENV !== 'production' ? [
            new winston.transports.Console({
                format: consoleFormat
            })
        ] : [])
    ],
    exceptionHandlers: [
        new winston.transports.File({
            filename: path.join(logDir, 'exceptions.log')
        })
    ],
    rejectionHandlers: [
        new winston.transports.File({
            filename: path.join(logDir, 'rejections.log')
        })
    ]
});

// Если продакшн, добавляем консоль с минимальным уровнем warn
if (process.env.NODE_ENV === 'production') {
    logger.add(new winston.transports.Console({
        format: consoleFormat,
        level: 'warn'
    }));
}

// Stream для Morgan (HTTP логгирование)
logger.stream = {
    write: (message) => {
        logger.info(message.trim());
    }
};

// Вспомогательные методы
logger.api = (message, meta = {}) => {
    logger.info(`[API] ${message}`, meta);
};

logger.database = (message, meta = {}) => {
    logger.info(`[DB] ${message}`, meta);
};

logger.auth = (message, meta = {}) => {
    logger.info(`[AUTH] ${message}`, meta);
};

logger.security = (message, meta = {}) => {
    logger.warn(`[SECURITY] ${message}`, meta);
};

logger.performance = (message, duration, meta = {}) => {
    logger.debug(`[PERF] ${message} - ${duration}ms`, meta);
};

// Middleware для логирования запросов
logger.requestLogger = (req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        const logLevel = res.statusCode >= 400 ? 'warn' : 'info';
        
        logger.log(logLevel, `HTTP ${req.method} ${req.originalUrl}`, {
            status: res.statusCode,
            duration: `${duration}ms`,
            ip: req.ip,
            userAgent: req.get('user-agent'),
            userId: req.user?.id || 'anonymous',
            ...(res.statusCode >= 400 && { 
                body: req.body,
                query: req.query,
                params: req.params 
            })
        });
    });
    
    next();
};

module.exports = logger;