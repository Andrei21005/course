const mongoose = require('mongoose');

const goalSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'ID пользователя обязателен'] 
  },
  habitId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Habit',
    required: false // Цель может быть не привязана к конкретной привычке
  },
  title: { 
    type: String, 
    required: [true, 'Название цели обязательно'],
    trim: true,
    maxlength: [100, 'Название не должно превышать 100 символов']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Описание не должно превышать 500 символов']
  },
  targetType: {
    type: String,
    enum: ['days', 'count', 'streak'],
    default: 'days',
    required: [true, 'Тип цели обязателен']
  },
  targetValue: { 
    type: Number, 
    required: [true, 'Целевое значение обязательно'],
    min: [1, 'Целевое значение должно быть не менее 1']
  },
  currentValue: { 
    type: Number, 
    default: 0,
    min: [0, 'Текущее значение не может быть отрицательным']
  },
  deadline: { 
    type: Date,
    validate: {
      validator: function(value) {
        return !value || value > new Date();
      },
      message: 'Срок выполнения должен быть в будущем'
    }
  },
  status: { 
    type: String, 
    enum: ['active', 'completed', 'failed'], 
    default: 'active' 
  },
  progress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
    get: function() {
      return Math.round((this.currentValue / this.targetValue) * 100);
    }
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  notifications: {
    enabled: { type: Boolean, default: true },
    frequency: { 
      type: String, 
      enum: ['daily', 'weekly', 'monthly'], 
      default: 'weekly' 
    }
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
  toJSON: { getters: true },
  toObject: { getters: true }
});

// Автоматическое обновление updatedAt
goalSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Автоматическое обновление статуса
  if (this.currentValue >= this.targetValue) {
    this.status = 'completed';
  } else if (this.deadline && new Date() > this.deadline) {
    this.status = 'failed';
  }
  
  next();
});

// Индексы для быстрого поиска
goalSchema.index({ userId: 1, status: 1 });
goalSchema.index({ deadline: 1 });
goalSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Goal', goalSchema);