const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const validator = require('validator');

const userSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: [true, 'Имя пользователя обязательно'],
    unique: true,
    trim: true,
    minlength: [3, 'Имя пользователя должно содержать минимум 3 символа'],
    maxlength: [30, 'Имя пользователя не должно превышать 30 символов'],
    match: [/^[a-zA-Z0-9_]+$/, 'Имя пользователя может содержать только буквы, цифры и подчеркивания']
  },
  email: { 
    type: String, 
    required: [true, 'Email обязателен'],
    unique: true,
    trim: true,
    lowercase: true,
    validate: [validator.isEmail, 'Некорректный email адрес']
  },
  password: { 
    type: String, 
    required: [true, 'Пароль обязателен'],
    minlength: [6, 'Пароль должен содержать минимум 6 символов'],
    select: false // Не возвращать пароль по умолчанию
  },
  displayName: { 
    type: String, 
    required: [true, 'Отображаемое имя обязательно'],
    trim: true,
    maxlength: [50, 'Отображаемое имя не должно превышать 50 символов']
  },
  avatar: {
    type: String,
    default: 'https://ui-avatars.com/api/?name=User&background=random'
  },
  role: { 
    type: String, 
    enum: ['user', 'admin', 'moderator'], 
    default: 'user',
    required: true
  },
  settings: {
    theme: { type: String, enum: ['light', 'dark', 'auto'], default: 'light' },
    language: { type: String, default: 'ru' },
    notifications: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      reminders: { type: Boolean, default: true }
    },
    privacy: {
      profileVisible: { type: Boolean, default: true },
      habitsVisible: { type: Boolean, default: false },
      statsVisible: { type: Boolean, default: false }
    }
  },
  stats: {
    streak: { type: Number, default: 0 },
    maxStreak: { type: Number, default: 0 },
    totalHabits: { type: Number, default: 0 },
    completedHabits: { type: Number, default: 0 },
    totalGoals: { type: Number, default: 0 },
    completedGoals: { type: Number, default: 0 },
    lastActive: { type: Date, default: Date.now }
  },
  isActive: { 
    type: Boolean, 
    default: true 
  },
  isVerified: { 
    type: Boolean, 
    default: false 
  },
  verificationToken: String,
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  lastLogin: Date,
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: Date,
  preferences: {
    timezone: { type: String, default: 'Europe/Moscow' },
    weeklyStartDay: { type: Number, min: 0, max: 6, default: 1 }, // 1 = понедельник
    dailyReminderTime: {
      hour: { type: Number, min: 0, max: 23, default: 20 },
      minute: { type: Number, min: 0, max: 59, default: 0 }
    }
  },
  achievements: [{
    id: String,
    title: String,
    description: String,
    icon: String,
    unlockedAt: Date,
    metadata: mongoose.Schema.Types.Mixed
  }],
  createdAt: { 
    type: Date, 
    default: Date.now,
    immutable: true
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

// Хэширование пароля перед сохранением
userSchema.pre('save', async function(next) {
  // Хэшируем пароль только если он был изменен
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Метод для проверки пароля
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Метод для увеличения счетчика попыток входа
userSchema.methods.incLoginAttempts = function() {
  // Если у нас уже есть предыдущие неудачные попытки в течение периода блокировки
  if (this.lockUntil && this.lockUntil > new Date()) {
    return this;
  }
  
  this.loginAttempts += 1;
  
  // Блокировка после 5 неудачных попыток на 2 часа
  if (this.loginAttempts >= 5) {
    this.lockUntil = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 часа
  }
  
  return this.save();
};

// Метод для сброса счетчика попыток
userSchema.methods.resetLoginAttempts = function() {
  this.loginAttempts = 0;
  this.lockUntil = undefined;
  return this.save();
};

// Виртуальное поле - активен ли пользователь
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > new Date());
});

// Индексы
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ role: 1 });
userSchema.index({ 'stats.lastActive': -1 });
userSchema.index({ createdAt: -1 });

module.exports = mongoose.model('User', userSchema);