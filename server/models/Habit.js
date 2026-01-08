const mongoose = require('mongoose');

const habitSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'ID пользователя обязателен'] 
  },
  name: { 
    type: String, 
    required: [true, 'Название привычки обязательно'],
    trim: true,
    maxlength: [100, 'Название не должно превышать 100 символов']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Описание не должно превышать 500 символов']
  },
  category: {
    type: String,
    enum: ['health', 'fitness', 'learning', 'work', 'mindfulness', 'social', 'finance', 'other'],
    default: 'other',
    required: true
  },
  frequency: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'custom'],
    default: 'daily',
    required: true
  },
  customFrequency: {
    daysOfWeek: [{ type: Number, min: 0, max: 6 }], // 0-воскресенье, 6-суббота
    daysOfMonth: [{ type: Number, min: 1, max: 31 }],
    interval: { type: Number, min: 1 } // Каждые N дней
  },
  color: { 
    type: String, 
    default: '#667eea',
    match: [/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Некорректный цветовой код']
  },
  icon: {
    type: String,
    default: '📝'
  },
  privacy: { 
    type: String, 
    enum: ['private', 'public', 'friends_only'], 
    default: 'private',
    required: true
  },
  targetType: { 
    type: String, 
    enum: ['boolean', 'numeric', 'timer'], 
    default: 'boolean',
    required: true
  },
  targetValue: {
    type: Number,
    min: [1, 'Целевое значение должно быть не менее 1'],
    default: 1
  },
  targetUnit: {
    type: String,
    enum: ['times', 'minutes', 'hours', 'pages', 'words', 'other'],
    default: 'times'
  },
  isArchived: {
    type: Boolean,
    default: false
  },
  archivedAt: Date,
  startDate: {
    type: Date,
    default: Date.now
  },
  endDate: {
    type: Date,
    validate: {
      validator: function(value) {
        return !value || value > this.startDate;
      },
      message: 'Дата окончания должна быть позже даты начала'
    }
  },
  reminders: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Reminder' 
  }],
  goals: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Goal' 
  }],
  tags: [{
    type: String,
    trim: true
  }],
  metadata: {
    streak: { type: Number, default: 0 },
    maxStreak: { type: Number, default: 0 },
    totalCompletions: { type: Number, default: 0 },
    totalAttempts: { type: Number, default: 0 },
    successRate: { 
      type: Number, 
      default: 0,
      min: 0,
      max: 100 
    },
    lastCompleted: Date,
    lastUpdated: Date
  },
  motivation: {
    type: String,
    trim: true,
    maxlength: [200, 'Мотивация не должна превышать 200 символов']
  },
  difficulty: {
    type: Number,
    min: 1,
    max: 5,
    default: 3
  },
  isTemplate: {
    type: Boolean,
    default: false
  },
  templateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Habit'
  },
  sharedWith: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    permission: { type: String, enum: ['view', 'edit'], default: 'view' },
    sharedAt: { type: Date, default: Date.now }
  }],
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Индексы
habitSchema.index({ userId: 1, isArchived: 1 });
habitSchema.index({ userId: 1, category: 1 });
habitSchema.index({ userId: 1, createdAt: -1 });
habitSchema.index({ privacy: 1 });
habitSchema.index({ tags: 1 });
habitSchema.index({ 'metadata.streak': -1 });

// Виртуальное поле для вычисления успешности
habitSchema.virtual('completionRate').get(function() {
  if (this.metadata.totalAttempts === 0) return 0;
  return Math.round((this.metadata.totalCompletions / this.metadata.totalAttempts) * 100);
});

// Предварительная обработка перед сохранением
habitSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Автоматическое вычисление successRate
  if (this.metadata.totalAttempts > 0) {
    this.metadata.successRate = Math.round(
      (this.metadata.totalCompletions / this.metadata.totalAttempts) * 100
    );
  }
  
  next();
});

// Статический метод для архивации старых привычек
habitSchema.statics.archiveOldHabits = async function(userId, days = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  return await this.updateMany(
    {
      userId: userId,
      isArchived: false,
      'metadata.lastUpdated': { $lt: cutoffDate },
      'metadata.totalCompletions': 0
    },
    {
      $set: {
        isArchived: true,
        archivedAt: new Date()
      }
    }
  );
};

module.exports = mongoose.model('Habit', habitSchema);