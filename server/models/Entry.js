const mongoose = require('mongoose');

const entrySchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'ID пользователя обязателен'],
    index: true
  },
  habitId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Habit', 
    required: [true, 'ID привычки обязателен'],
    index: true
  },
  date: { 
    type: Date, 
    required: [true, 'Дата записи обязательна'],
    index: true
  },
  status: { 
    type: String, 
    enum: ['completed', 'skipped', 'partial', 'not_done'], 
    default: 'not_done',
    required: true
  },
  value: { 
    type: Number,
    min: [0, 'Значение не может быть отрицательным'],
    default: 0
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [1000, 'Заметка не должна превышать 1000 символов']
  },
  mood: {
    type: String,
    enum: ['excellent', 'good', 'neutral', 'bad', 'awful'],
    default: 'neutral'
  },
  difficulty: {
    type: Number,
    min: 1,
    max: 5,
    default: 3
  },
  duration: { // в минутах
    type: Number,
    min: 0
  },
  location: {
    type: String,
    trim: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  isSynced: {
    type: Boolean,
    default: true
  },
  syncedAt: {
    type: Date,
    default: Date.now
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
}, {
  timestamps: true
});

// Составной уникальный индекс (пользователь + привычка + дата)
entrySchema.index({ userId: 1, habitId: 1, date: 1 }, { unique: true });

// Предварительная обработка даты (приводим к началу дня)
entrySchema.pre('save', function(next) {
  if (this.date) {
    const date = new Date(this.date);
    date.setHours(0, 0, 0, 0);
    this.date = date;
  }
  this.updatedAt = Date.now();
  next();
});

// Виртуальное поле для получения дня недели
entrySchema.virtual('dayOfWeek').get(function() {
  return this.date.getDay();
});

// Статический метод для получения статистики
entrySchema.statics.getStats = async function(userId, startDate, endDate) {
  const stats = await this.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        date: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalValue: { $sum: '$value' },
        avgDifficulty: { $avg: '$difficulty' }
      }
    },
    {
      $project: {
        status: '$_id',
        count: 1,
        totalValue: 1,
        avgDifficulty: { $round: ['$avgDifficulty', 2] }
      }
    }
  ]);
  
  return stats;
};

module.exports = mongoose.model('Entry', entrySchema);