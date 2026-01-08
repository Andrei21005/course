console.log('=== SIMPLE SERVER START ===');

// Безопасная загрузка окружения
try {
  require('dotenv').config();
  console.log('✅ Environment loaded');
} catch (e) {
  console.log('⚠️ dotenv not available');
}

const express = require('express');
const app = express();
const PORT = process.env.PORT || 5000;

// Минимальные middleware
app.use(express.json());

// Простой маршрут
app.get('/', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Habit Tracker API',
    timestamp: new Date().toISOString()
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    database: 'not connected',
    message: 'Running in simple mode'
  });
});

// Статические файлы
app.use(express.static('public'));

// Запускаем без MongoDB
app.listen(PORT, () => {
  console.log(`🚀 Simple server running on http://localhost:${PORT}`);
  console.log(`📁 Frontend: http://localhost:${PORT}`);
  console.log(`🔗 API: http://localhost:${PORT}/api/health`);
});

console.log('=== SERVER STARTED ===');