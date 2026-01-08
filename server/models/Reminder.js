const mongoose = require('mongoose');

const reminderSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'ID пользователя обязателен'] 
  },
  habitId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Habit',
    required: false // Напоминание может быть общим
  },
  title: { 
    type: String, 
    required: [true, 'Название напоминания обязательно'],
    trim: true,
    maxlength: [100, 'Название не должно превышать 100 символов']
  },
  message: {
    type: String,
    trim: true,
    maxlength: [500, 'Сообщение не должно превышать 500 символов']
  },
  type: {
    type: String,
    enum: ['push', 'email', 'sms', 'in_app'],
    default: 'in_app',
    required: true
  },
  frequency: {
    type: String,
    enum: ['once', 'daily', 'weekly', 'monthly', 'custom'],
    default: 'daily'
  },
  daysOfWeek: [{
    type: Number,
    min: 0,
    max: 6 // 0 - воскресенье, 6 - суббота
  }],
  time: {
    hour: {
      type: Number,
      min: 0,
      max: 23,
      required: true
    },
    minute: {
      type: Number,
      min: 0,
      max: 59,
      required: true,
      default: 0
    }
  },
  startDate: {
    type: Date,
    default: Date.now,
    required: true
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
  isActive: {
    type: Boolean,
    default: true,
    required: true
  },
  lastSent: {
    type: Date
  },
  timezone: {
    type: String,
    default: 'UTC'
  },
  notificationSettings: {
    sound: { type: Boolean, default: true },
    vibration: { type: Boolean, default: true },
    badge: { type: Boolean, default: true }
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Индексы
reminderSchema.index({ userId: 1, isActive: 1 });
reminderSchema.index({ time: 1 });
reminderSchema.index({ nextSendTime: 1 });

// Виртуальное поле для следующего времени отправки
reminderSchema.virtual('nextSendTime').get(function() {
  if (!this.isActive) return null;
  
  const now = new Date();
  const nextDate = new Date();
  
  // Устанавливаем время
  nextDate.setHours(this.time.hour, this.time.minute, 0, 0);
  
  // Если время уже прошло сегодня, планируем на следующий день
  if (nextDate < now) {
    nextDate.setDate(nextDate.getDate() + 1);
  }
  
  // Проверяем дни недели для еженедельных напоминаний
  if (this.frequency === 'weekly' && this.daysOfWeek.length > 0) {
    let dayAdded = 0;
    while (!this.daysOfWeek.includes(nextDate.getDay())) {
      nextDate.setDate(nextDate.getDate() + 1);
      dayAdded++;
      if (dayAdded > 7) break; // Защита от бесконечного цикла
    }
  }
  
  return nextDate;
});

// Предварительная обработка перед сохранением
reminderSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Если daysOfWeek не задан для weekly, используем все дни
  if (this.frequency === 'weekly' && (!this.daysOfWeek || this.daysOfWeek.length === 0)) {
    this.daysOfWeek = [0, 1, 2, 3, 4, 5, 6];
  }
  
  next();
});

module.exports = mongoose.model('Reminder', reminderSchema);