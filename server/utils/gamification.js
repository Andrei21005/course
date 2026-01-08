/**
 * Система геймификации для мотивации пользователей
 */

const AchievementSystem = {
    // Определения достижений
    achievements: {
        // Начальные достижения
        'first_habit': {
            id: 'first_habit',
            title: 'Первый шаг',
            description: 'Создайте свою первую привычку',
            icon: '🎯',
            points: 10,
            condition: (userStats) => userStats.totalHabits >= 1,
            category: 'habits'
        },
        
        'week_streak': {
            id: 'week_streak',
            title: 'Неделя дисциплины',
            description: 'Выполняйте привычки 7 дней подряд',
            icon: '🔥',
            points: 25,
            condition: (userStats) => userStats.streak >= 7,
            category: 'streak'
        },
        
        'month_streak': {
            id: 'month_streak',
            title: 'Месяц силы воли',
            description: '30 дней последовательного выполнения',
            icon: '🏆',
            points: 50,
            condition: (userStats) => userStats.streak >= 30,
            category: 'streak'
        },
        
        'habit_master': {
            id: 'habit_master',
            title: 'Мастер привычек',
            description: 'Создайте 10 различных привычек',
            icon: '👑',
            points: 30,
            condition: (userStats) => userStats.totalHabits >= 10,
            category: 'habits'
        },
        
        'perfect_week': {
            id: 'perfect_week',
            title: 'Идеальная неделя',
            description: 'Выполните все привычки каждый день в течение недели',
            icon: '⭐',
            points: 40,
            condition: (userStats) => userStats.perfectWeeks >= 1,
            category: 'performance'
        },
        
        'early_bird': {
            id: 'early_bird',
            title: 'Жаворонок',
            description: 'Выполните привычку до 8 утра 5 дней подряд',
            icon: '🌅',
            points: 20,
            condition: (userStats) => userStats.earlyCompletions >= 5,
            category: 'time'
        },
        
        'consistency_king': {
            id: 'consistency_king',
            title: 'Король постоянства',
            description: '90%+ успешности в течение месяца',
            icon: '👑',
            points: 35,
            condition: (userStats) => userStats.monthlySuccessRate >= 90,
            category: 'performance'
        },
        
        'social_butterfly': {
            id: 'social_butterfly',
            title: 'Социальная бабочка',
            description: 'Поделитесь 5 привычками с друзьями',
            icon: '🦋',
            points: 15,
            condition: (userStats) => userStats.sharedHabits >= 5,
            category: 'social'
        },
        
        'goal_crusher': {
            id: 'goal_crusher',
            title: 'Разрушитель целей',
            description: 'Достигните 5 целей',
            icon: '🎯',
            points: 30,
            condition: (userStats) => userStats.completedGoals >= 5,
            category: 'goals'
        },
        
        'streak_saver': {
            id: 'streak_saver',
            title: 'Спаситель стрика',
            description: 'Используйте функцию "Не сбрасывать стрик"',
            icon: '🛡️',
            points: 10,
            condition: (userStats) => userStats.streakSavesUsed >= 1,
            category: 'streak'
        }
    },
    
    // Уровни пользователя
    levels: [
        { level: 1, points: 0, title: 'Новичок', color: '#9E9E9E' },
        { level: 2, points: 100, title: 'Ученик', color: '#4CAF50' },
        { level: 3, points: 250, title: 'Практик', color: '#2196F3' },
        { level: 4, points: 500, title: 'Эксперт', color: '#FF9800' },
        { level: 5, points: 1000, title: 'Мастер', color: '#F44336' },
        { level: 6, points: 2000, title: 'Гуру', color: '#9C27B0' },
        { level: 7, points: 5000, title: 'Легенда', color: '#FF5722' },
        { level: 8, points: 10000, title: 'Миф', color: '#3F51B5' }
    ],
    
    /**
     * Проверить достижения пользователя
     */
    async checkAchievements(userId, userStats) {
        const User = require('../models/User');
        const user = await User.findById(userId);
        
        if (!user) {
            throw new Error('Пользователь не найден');
        }
        
        const unlockedAchievements = [];
        const existingAchievementIds = user.achievements.map(a => a.id);
        
        // Проверяем каждое достижение
        for (const [achievementId, achievement] of Object.entries(this.achievements)) {
            // Если достижение уже получено, пропускаем
            if (existingAchievementIds.includes(achievementId)) {
                continue;
            }
            
            // Проверяем условие
            if (achievement.condition(userStats)) {
                unlockedAchievements.push({
                    ...achievement,
                    unlockedAt: new Date()
                });
                
                // Добавляем очки
                user.stats.points = (user.stats.points || 0) + achievement.points;
            }
        }
        
        // Добавляем новые достижения
        if (unlockedAchievements.length > 0) {
            user.achievements.push(...unlockedAchievements);
            
            // Проверяем новый уровень
            const newLevel = this.calculateLevel(user.stats.points || 0);
            if (newLevel > (user.stats.level || 1)) {
                user.stats.level = newLevel;
                
                // Добавляем достижение за новый уровень
                const levelAchievement = this.getLevelAchievement(newLevel);
                if (levelAchievement && !existingAchievementIds.includes(levelAchievement.id)) {
                    user.achievements.push({
                        ...levelAchievement,
                        unlockedAt: new Date()
                    });
                }
            }
            
            await user.save();
        }
        
        return unlockedAchievements;
    },
    
    /**
     * Рассчитать уровень на основе очков
     */
    calculateLevel(points) {
        for (let i = this.levels.length - 1; i >= 0; i--) {
            if (points >= this.levels[i].points) {
                return this.levels[i].level;
            }
        }
        return 1;
    },
    
    /**
     * Получить достижение за уровень
     */
    getLevelAchievement(level) {
        const levelInfo = this.levels.find(l => l.level === level);
        if (!levelInfo) return null;
        
        return {
            id: `level_${level}`,
            title: `Уровень ${level}: ${levelInfo.title}`,
            description: `Достигнут уровень ${level}`,
            icon: this.getLevelIcon(level),
            points: 0,
            category: 'level'
        };
    },
    
    /**
     * Получить иконку для уровня
     */
    getLevelIcon(level) {
        const icons = ['⭐', '🌟🌟', '🌟🌟🌟', '🏅', '🥇', '👑', '🏆', '💎'];
        return icons[level - 1] || '⭐';
    },
    
    /**
     * Получить статистику пользователя для проверки достижений
     */
    async getUserStats(userId) {
        const User = require('../models/User');
        const Habit = require('../models/Habit');
        const Entry = require('../models/Entry');
        const Goal = require('../models/Goal');
        
        const user = await User.findById(userId);
        if (!user) {
            throw new Error('Пользователь не найден');
        }
        
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        // Получаем статистику за последние 30 дней
        const [habitsCount, entriesStats, goalsStats, earlyCompletions] = await Promise.all([
            Habit.countDocuments({ userId }),
            Entry.aggregate([
                {
                    $match: {
                        userId: user._id,
                        date: { $gte: thirtyDaysAgo }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalEntries: { $sum: 1 },
                        completedEntries: {
                            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                        },
                        earlyEntries: {
                            $sum: {
                                $cond: [
                                    { 
                                        $and: [
                                            { $eq: ['$status', 'completed'] },
                                            { $lt: [{ $hour: '$createdAt' }, 8] }
                                        ]
                                    },
                                    1,
                                    0
                                ]
                            }
                        }
                    }
                }
            ]),
            Goal.aggregate([
                {
                    $match: {
                        userId: user._id,
                        status: 'completed'
                    }
                },
                {
                    $group: {
                        _id: null,
                        count: { $sum: 1 }
                    }
                }
            ]),
            Entry.countDocuments({
                userId,
                status: 'completed',
                createdAt: { $hour: { $lt: 8 } }
            })
        ]);
        
        const stats = {
            totalHabits: habitsCount,
            streak: user.stats?.streak || 0,
            perfectWeeks: Math.floor(user.stats?.streak || 0 / 7),
            monthlySuccessRate: entriesStats[0] ? 
                Math.round((entriesStats[0].completedEntries / entriesStats[0].totalEntries) * 100) : 0,
            earlyCompletions: earlyCompletions,
            sharedHabits: 0, // В реальном приложении нужно считать
            completedGoals: goalsStats[0]?.count || 0,
            streakSavesUsed: user.stats?.streakSaves || 0
        };
        
        return stats;
    },
    
    /**
     * Получить прогресс пользователя
     */
    async getUserProgress(userId) {
        const user = await require('../models/User').findById(userId);
        if (!user) return null;
        
        const points = user.stats?.points || 0;
        const level = this.calculateLevel(points);
        const currentLevel = this.levels.find(l => l.level === level);
        const nextLevel = this.levels.find(l => l.level === level + 1);
        
        const progress = {
            level,
            points,
            title: currentLevel?.title || 'Новичок',
            color: currentLevel?.color || '#9E9E9E',
            achievements: user.achievements || [],
            nextLevel: nextLevel ? {
                level: nextLevel.level,
                pointsNeeded: nextLevel.points - points,
                title: nextLevel.title
            } : null,
            levelProgress: nextLevel ? 
                Math.round(((points - currentLevel.points) / (nextLevel.points - currentLevel.points)) * 100) : 
                100
        };
        
        return progress;
    },
    
    /**
     * Создать уведомление о достижении
     */
    createAchievementNotification(achievement) {
        return {
            type: 'achievement',
            title: 'Новое достижение!',
            message: `Вы получили достижение "${achievement.title}"!`,
            data: {
                achievementId: achievement.id,
                points: achievement.points,
                icon: achievement.icon
            },
            priority: 'high'
        };
    },
    
    /**
     * Создать уведомление о новом уровне
     */
    createLevelNotification(level, title) {
        return {
            type: 'level',
            title: 'Новый уровень!',
            message: `Поздравляем! Вы достигли уровня ${level}: ${title}`,
            data: {
                level,
                title
            },
            priority: 'high'
        };
    },
    
    /**
     * Получить лидерборд
     */
    async getLeaderboard(limit = 10) {
        const User = require('../models/User');
        
        const leaders = await User.aggregate([
            {
                $match: {
                    isActive: true,
                    'stats.points': { $gt: 0 }
                }
            },
            {
                $project: {
                    username: 1,
                    displayName: 1,
                    avatar: 1,
                    points: '$stats.points',
                    level: '$stats.level',
                    streak: '$stats.streak',
                    achievementsCount: { $size: '$achievements' }
                }
            },
            { $sort: { points: -1 } },
            { $limit: limit }
        ]);
        
        // Добавляем позиции
        leaders.forEach((leader, index) => {
            leader.position = index + 1;
            leader.medal = this.getMedal(index + 1);
        });
        
        return leaders;
    },
    
    /**
     * Получить медаль для позиции
     */
    getMedal(position) {
        switch (position) {
            case 1: return '🥇';
            case 2: return '🥈';
            case 3: return '🥉';
            default: return `${position}️`;
        }
    },
    
    /**
     * Наградить пользователя очками
     */
    async awardPoints(userId, points, reason) {
        const User = require('../models/User');
        
        const user = await User.findByIdAndUpdate(
            userId,
            {
                $inc: { 'stats.points': points }
            },
            { new: true }
        );
        
        if (user) {
            // Создаем запись о награде
            this.logReward(userId, points, reason);
            
            // Проверяем новые достижения
            const stats = await this.getUserStats(userId);
            await this.checkAchievements(userId, stats);
        }
        
        return user;
    },
    
    /**
     * Записать награду в лог
     */
    logReward(userId, points, reason) {
        const logger = require('./logger');
        
        logger.info('Награждение пользователя', {
            userId,
            points,
            reason,
            timestamp: new Date()
        });
    }
};

module.exports = AchievementSystem;