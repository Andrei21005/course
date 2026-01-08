/**
 * Statistics Manager - управление статистикой привычек
 */
class StatisticsManager {
    constructor() {
        this.statsData = null;
        this.charts = {};
        this.timeRange = 'month'; // month, week, year, all
        this.chartType = 'completion'; // completion, streak, habits, mood
        
        // DOM элементы
        this.elements = {
            loadingIndicator: document.getElementById('loading-indicator'),
            errorContainer: document.getElementById('error-container'),
            statsContainer: document.getElementById('stats-container'),
            timeRangeSelector: document.getElementById('time-range'),
            chartTypeSelector: document.getElementById('chart-type'),
            dateRangePicker: document.getElementById('date-range'),
            customDateStart: document.getElementById('custom-date-start'),
            customDateEnd: document.getElementById('custom-date-end'),
            applyCustomDate: document.getElementById('apply-custom-date'),
            exportBtn: document.getElementById('export-stats-btn'),
            refreshBtn: document.getElementById('refresh-stats-btn')
        };
        
        this.init();
    }
    
    /**
     * Инициализация менеджера статистики
     */
    async init() {
        try {
            this.setupEventListeners();
            await this.loadStatistics();
            this.renderOverviewCards();
            this.renderCharts();
            this.renderHabitsTable();
        } catch (error) {
            this.showError('Ошибка инициализации статистики: ' + error.message);
        }
    }
    
    /**
     * Настройка обработчиков событий
     */
    setupEventListeners() {
        // Изменение диапазона времени
        if (this.elements.timeRangeSelector) {
            this.elements.timeRangeSelector.addEventListener('change', (e) => {
                this.timeRange = e.target.value;
                this.toggleCustomDateRange(e.target.value === 'custom');
                this.loadStatistics();
            });
        }
        
        // Изменение типа графика
        if (this.elements.chartTypeSelector) {
            this.elements.chartTypeSelector.addEventListener('change', (e) => {
                this.chartType = e.target.value;
                this.renderCharts();
            });
        }
        
        // Применение пользовательского диапазона дат
        if (this.elements.applyCustomDate) {
            this.elements.applyCustomDate.addEventListener('click', () => {
                this.loadStatistics();
            });
        }
        
        // Экспорт статистики
        if (this.elements.exportBtn) {
            this.elements.exportBtn.addEventListener('click', () => this.exportStatistics());
        }
        
        // Обновление статистики
        if (this.elements.refreshBtn) {
            this.elements.refreshBtn.addEventListener('click', () => this.loadStatistics());
        }
        
        // Горячие клавиши
        document.addEventListener('keydown', (e) => {
            if (e.key === 'r' && e.ctrlKey) {
                e.preventDefault();
                this.loadStatistics();
            }
            if (e.key === 'e' && e.ctrlKey && e.shiftKey) {
                e.preventDefault();
                this.exportStatistics();
            }
        });
    }
    
    /**
     * Показать/скрыть выбор пользовательского диапазона дат
     */
    toggleCustomDateRange(show) {
        const customDateContainer = document.getElementById('custom-date-container');
        if (customDateContainer) {
            customDateContainer.style.display = show ? 'block' : 'none';
        }
    }
    
    /**
     * Загрузить статистику
     */
    async loadStatistics() {
        this.showLoading(true);
        
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                throw new Error('Необходима авторизация');
            }
            
            let url = `/api/entries/stats?period=${this.timeRange}`;
            
            // Если выбран пользовательский диапазон
            if (this.timeRange === 'custom' && this.elements.customDateStart && this.elements.customDateEnd) {
                const startDate = this.elements.customDateStart.value;
                const endDate = this.elements.customDateEnd.value;
                
                if (startDate && endDate) {
                    url = `/api/entries?startDate=${startDate}&endDate=${endDate}&stats=true`;
                }
            }
            
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                if (response.status === 401) {
                    window.location.href = '/index.html';
                    return;
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success && data.data) {
                this.statsData = data.data;
                this.renderOverviewCards();
                this.renderCharts();
                this.renderHabitsTable();
            } else {
                throw new Error(data.message || 'Ошибка загрузки статистики');
            }
            
        } catch (error) {
            console.error('Ошибка загрузки статистики:', error);
            this.showError('Не удалось загрузить статистику: ' + error.message);
        } finally {
            this.showLoading(false);
        }
    }
    
    /**
     * Отрисовать карточки с общей статистикой
     */
    renderOverviewCards() {
        if (!this.statsData || !this.statsData.stats) return;
        
        const stats = this.statsData.stats;
        const streak = this.statsData.currentStreak || 0;
        
        const overviewContainer = document.getElementById('overview-cards');
        if (!overviewContainer) return;
        
        const completionRate = stats.completionRate || 0;
        const moodEmoji = this.getMoodEmoji(stats.avgMood || 3);
        
        overviewContainer.innerHTML = `
            <div class="stat-card large">
                <div class="stat-icon">📊</div>
                <div class="stat-value">${completionRate}%</div>
                <div class="stat-label">Общая выполненность</div>
                <div class="stat-trend ${completionRate >= 70 ? 'up' : completionRate >= 40 ? 'neutral' : 'down'}">
                    ${this.getTrendText(completionRate)}
                </div>
            </div>
            
            <div class="stat-card">
                <div class="stat-icon">🔥</div>
                <div class="stat-value">${streak}</div>
                <div class="stat-label">Текущий стрик</div>
                <div class="stat-subtext">дней подряд</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-icon">✅</div>
                <div class="stat-value">${stats.completedEntries || 0}</div>
                <div class="stat-label">Выполнено</div>
                <div class="stat-subtext">из ${stats.totalEntries || 0}</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-icon">😊</div>
                <div class="stat-value">${moodEmoji}</div>
                <div class="stat-label">Среднее настроение</div>
                <div class="stat-subtext">${this.getMoodText(stats.avgMood || 3)}</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-icon">🎯</div>
                <div class="stat-value">${stats.uniqueHabitsCount || 0}</div>
                <div class="stat-label">Активных привычек</div>
                <div class="stat-subtext">в периоде</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-icon">⏱️</div>
                <div class="stat-value">${stats.totalValue || 0}</div>
                <div class="stat-label">Общее значение</div>
                <div class="stat-subtext">${this.getUnitText()}</div>
            </div>
        `;
    }
    
    /**
     * Отрисовать графики
     */
    renderCharts() {
        if (!this.statsData) return;
        
        // Проверяем, загружена ли библиотека Chart.js
        if (typeof Chart === 'undefined') {
            console.warn('Chart.js не загружен');
            this.renderSimpleCharts();
            return;
        }
        
        this.destroyCharts();
        
        // График выполнения по дням
        this.renderCompletionChart();
        
        // График по привычкам
        this.renderHabitsChart();
        
        // График настроения
        this.renderMoodChart();
        
        // График стриков
        this.renderStreakChart();
    }
    
    /**
     * Отрисовать простые графики (fallback)
     */
    renderSimpleCharts() {
        const chartsContainer = document.getElementById('charts-container');
        if (!chartsContainer) return;
        
        chartsContainer.innerHTML = `
            <div class="simple-charts">
                <div class="simple-chart">
                    <h4>Выполненность по дням</h4>
                    <div class="chart-bars">
                        ${this.generateSimpleBars()}
                    </div>
                </div>
                
                <div class="simple-chart">
                    <h4>Распределение по статусам</h4>
                    <div class="chart-donut">
                        ${this.generateSimpleDonut()}
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * Сгенерировать простые столбцы для графика
     */
    generateSimpleBars() {
        // Генерируем тестовые данные
        const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
        let html = '';
        
        days.forEach(day => {
            const value = Math.floor(Math.random() * 100);
            html += `
                <div class="simple-bar-container">
                    <div class="simple-bar-label">${day}</div>
                    <div class="simple-bar">
                        <div class="simple-bar-fill" style="height: ${value}%"></div>
                    </div>
                    <div class="simple-bar-value">${value}%</div>
                </div>
            `;
        });
        
        return html;
    }
    
    /**
     * Сгенерировать простую диаграмму
     */
    generateSimpleDonut() {
        const values = [
            { label: 'Выполнено', value: 60, color: '#4CAF50' },
            { label: 'Пропущено', value: 20, color: '#2196F3' },
            { label: 'Частично', value: 15, color: '#FFC107' },
            { label: 'Не сделано', value: 5, color: '#F44336' }
        ];
        
        let html = '<div class="donut-container">';
        
        values.forEach(item => {
            html += `
                <div class="donut-item">
                    <span class="donut-color" style="background-color: ${item.color}"></span>
                    <span class="donut-label">${item.label}</span>
                    <span class="donut-value">${item.value}%</span>
                </div>
            `;
        });
        
        html += '</div>';
        return html;
    }
    
    /**
     * Отрисовать график выполнения
     */
    renderCompletionChart() {
        const canvas = document.getElementById('completion-chart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        // Пример данных
        const labels = this.generateDateLabels();
        const data = this.generateCompletionData();
        
        this.charts.completion = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Выполненность (%)',
                    data: data,
                    borderColor: '#4CAF50',
                    backgroundColor: 'rgba(76, 175, 80, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Динамика выполненности',
                        font: {
                            size: 16
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        title: {
                            display: true,
                            text: 'Выполненность (%)'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Дата'
                        }
                    }
                }
            }
        });
    }
    
    /**
     * Отрисовать график по привычкам
     */
    renderHabitsChart() {
        const canvas = document.getElementById('habits-chart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        // Загружаем данные по привычкам
        this.loadHabitsData().then(habitsData => {
            this.charts.habits = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: habitsData.labels,
                    datasets: [{
                        label: 'Выполнено',
                        data: habitsData.completed,
                        backgroundColor: '#4CAF50',
                        borderColor: '#388E3C',
                        borderWidth: 1
                    }, {
                        label: 'Всего записей',
                        data: habitsData.total,
                        backgroundColor: '#2196F3',
                        borderColor: '#1976D2',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        title: {
                            display: true,
                            text: 'Статистика по привычкам',
                            font: {
                                size: 16
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Количество записей'
                            }
                        },
                        x: {
                            title: {
                                display: true,
                                text: 'Привычки'
                            }
                        }
                    }
                }
            });
        });
    }
    
    /**
     * Отрисовать график настроения
     */
    renderMoodChart() {
        const canvas = document.getElementById('mood-chart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        const moodData = this.generateMoodData();
        
        this.charts.mood = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: moodData.labels,
                datasets: [{
                    data: moodData.values,
                    backgroundColor: [
                        '#4CAF50', // Отлично
                        '#8BC34A', // Хорошо
                        '#FFC107', // Нормально
                        '#FF9800', // Плохо
                        '#F44336'  // Ужасно
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Распределение настроения',
                        font: {
                            size: 16
                        }
                    },
                    legend: {
                        position: 'right'
                    }
                }
            }
        });
    }
    
    /**
     * Отрисовать график стриков
     */
    renderStreakChart() {
        const canvas = document.getElementById('streak-chart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        const streakData = this.generateStreakData();
        
        this.charts.streak = new Chart(ctx, {
            type: 'line',
            data: {
                labels: streakData.labels,
                datasets: [{
                    label: 'Текущий стрик',
                    data: streakData.values,
                    borderColor: '#FF5722',
                    backgroundColor: 'rgba(255, 87, 34, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'История стриков',
                        font: {
                            size: 16
                        }
                    },
                    annotation: {
                        annotations: {
                            line1: {
                                type: 'line',
                                yMin: 7,
                                yMax: 7,
                                borderColor: '#4CAF50',
                                borderWidth: 2,
                                borderDash: [5, 5],
                                label: {
                                    content: 'Цель: 7 дней',
                                    enabled: true,
                                    position: 'end'
                                }
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Дней подряд'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Дата'
                        }
                    }
                }
            }
        });
    }
    
    /**
     * Загрузить данные по привычкам
     */
    async loadHabitsData() {
        try {
            const token = localStorage.getItem('token');
            if (!token) return { labels: [], completed: [], total: [] };
            
            const response = await fetch('/api/habits?limit=10&sortBy=metadata.totalCompletions&sortOrder=desc', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                const habits = data.data || data;
                
                return {
                    labels: habits.map(h => h.name.substring(0, 15) + (h.name.length > 15 ? '...' : '')),
                    completed: habits.map(h => h.metadata?.totalCompletions || 0),
                    total: habits.map(h => h.metadata?.totalAttempts || 0)
                };
            }
            
            return { labels: [], completed: [], total: [] };
        } catch (error) {
            console.error('Ошибка загрузки данных привычек:', error);
            return { labels: [], completed: [], total: [] };
        }
    }
    
    /**
     * Отрисовать таблицу привычек
     */
    renderHabitsTable() {
        const tableContainer = document.getElementById('habits-table-container');
        if (!tableContainer) return;
        
        // Загружаем данные привычек
        this.loadHabitsForTable().then(habits => {
            if (habits.length === 0) {
                tableContainer.innerHTML = '<p class="empty-state">Нет данных о привычках</p>';
                return;
            }
            
            let html = `
                <div class="table-responsive">
                    <table class="stats-table">
                        <thead>
                            <tr>
                                <th>Привычка</th>
                                <th>Категория</th>
                                <th>Стрик</th>
                                <th>Выполнено</th>
                                <th>Успешность</th>
                                <th>Последнее</th>
                                <th>Действия</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            habits.forEach(habit => {
                const successRate = habit.metadata?.successRate || 0;
                const streak = habit.metadata?.streak || 0;
                const lastCompleted = habit.metadata?.lastCompleted 
                    ? new Date(habit.metadata.lastCompleted).toLocaleDateString('ru-RU')
                    : 'Никогда';
                
                const successClass = successRate >= 80 ? 'success' : 
                                   successRate >= 50 ? 'warning' : 'error';
                
                html += `
                    <tr>
                        <td>
                            <div class="habit-cell">
                                <span class="habit-color" style="background-color: ${habit.color || '#667eea'}"></span>
                                <span class="habit-name">${habit.name}</span>
                            </div>
                        </td>
                        <td>
                            <span class="category-badge ${habit.category}">
                                ${this.getCategoryName(habit.category)}
                            </span>
                        </td>
                        <td>
                            <div class="streak-cell">
                                <span class="streak-value">${streak}</span>
                                <span class="streak-label">дней</span>
                            </div>
                        </td>
                        <td>
                            ${habit.metadata?.totalCompletions || 0}/${habit.metadata?.totalAttempts || 0}
                        </td>
                        <td>
                            <div class="progress-cell">
                                <div class="progress-bar">
                                    <div class="progress-fill ${successClass}" style="width: ${successRate}%"></div>
                                </div>
                                <span class="progress-value">${successRate}%</span>
                            </div>
                        </td>
                        <td>${lastCompleted}</td>
                        <td>
                            <button class="btn btn-sm btn-primary" 
                                    onclick="statsManager.viewHabitDetails('${habit._id}')">
                                Детали
                            </button>
                        </td>
                    </tr>
                `;
            });
            
            html += `
                        </tbody>
                    </table>
                </div>
            `;
            
            tableContainer.innerHTML = html;
        });
    }
    
    /**
     * Загрузить привычки для таблицы
     */
    async loadHabitsForTable() {
        try {
            const token = localStorage.getItem('token');
            if (!token) return [];
            
            const response = await fetch('/api/habits?limit=20', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                return data.data || data || [];
            }
            
            return [];
        } catch (error) {
            console.error('Ошибка загрузки привычек для таблицы:', error);
            return [];
        }
    }
    
    /**
     * Показать детали привычки
     */
    viewHabitDetails(habitId) {
        // В реальном приложении здесь можно открыть модальное окно 
        // или перейти на страницу деталей привычки
        window.location.href = `/dashboard.html?habit=${habitId}&tab=details`;
    }
    
    /**
     * Экспортировать статистику
     */
    async exportStatistics() {
        try {
            if (!this.statsData) {
                this.showError('Нет данных для экспорта');
                return;
            }
            
            const exportData = {
                exportDate: new Date().toISOString(),
                timeRange: this.timeRange,
                statistics: this.statsData,
                charts: this.getChartsData()
            };
            
            // Создаем различные форматы экспорта
            const formats = {
                json: JSON.stringify(exportData, null, 2),
                csv: this.convertToCSV(exportData),
                txt: this.convertToText(exportData)
            };
            
            // Показываем диалог выбора формата
            const format = prompt('Выберите формат экспорта (json, csv, txt):', 'json');
            
            if (!format || !formats[format.toLowerCase()]) {
                this.showError('Неверный формат. Используйте json, csv или txt.');
                return;
            }
            
            const blob = new Blob([formats[format.toLowerCase()]], { 
                type: `application/${format.toLowerCase()}` 
            });
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `habit-stats-${new Date().toISOString().split('T')[0]}.${format.toLowerCase()}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.showSuccess('Статистика экспортирована успешно');
            
        } catch (error) {
            console.error('Ошибка экспорта:', error);
            this.showError('Не удалось экспортировать статистику');
        }
    }
    
    /**
     * Получить данные графиков для экспорта
     */
    getChartsData() {
        const chartsData = {};
        
        Object.keys(this.charts).forEach(chartName => {
            if (this.charts[chartName] && this.charts[chartName].data) {
                chartsData[chartName] = {
                    labels: this.charts[chartName].data.labels,
                    datasets: this.charts[chartName].data.datasets.map(dataset => ({
                        label: dataset.label,
                        data: dataset.data
                    }))
                };
            }
        });
        
        return chartsData;
    }
    
    /**
     * Конвертировать данные в CSV
     */
    convertToCSV(data) {
        let csv = 'Статистика привычек\n\n';
        
        // Основная статистика
        csv += 'Основная статистика\n';
        csv += 'Показатель,Значение\n';
        
        const stats = data.statistics.stats;
        if (stats) {
            csv += `Всего записей,${stats.totalEntries || 0}\n`;
            csv += `Выполнено,${stats.completedEntries || 0}\n`;
            csv += `Пропущено,${stats.skippedEntries || 0}\n`;
            csv += `Успешность,${stats.completionRate || 0}%\n`;
            csv += `Среднее настроение,${stats.avgMood || 0}\n`;
            csv += `Уникальных привычек,${stats.uniqueHabitsCount || 0}\n`;
        }
        
        csv += '\nПериод\n';
        csv += `Начало,${data.statistics.startDate}\n`;
        csv += `Конец,${data.statistics.endDate}\n`;
        csv += `Текущий стрик,${data.statistics.currentStreak || 0}\n`;
        
        return csv;
    }
    
    /**
     * Конвертировать данные в текст
     */
    convertToText(data) {
        let text = '='.repeat(50) + '\n';
        text += 'СТАТИСТИКА ПРИВЫЧЕК\n';
        text += '='.repeat(50) + '\n\n';
        
        text += `Дата экспорта: ${new Date(data.exportDate).toLocaleString('ru-RU')}\n`;
        text += `Период: ${data.timeRange}\n\n`;
        
        const stats = data.statistics.stats;
        if (stats) {
            text += 'ОСНОВНЫЕ ПОКАЗАТЕЛИ:\n';
            text += '-'.repeat(30) + '\n';
            text += `Всего записей: ${stats.totalEntries || 0}\n`;
            text += `Выполнено: ${stats.completedEntries || 0}\n`;
            text += `Успешность: ${stats.completionRate || 0}%\n`;
            text += `Текущий стрик: ${data.statistics.currentStreak || 0} дней\n`;
            text += `Уникальных привычек: ${stats.uniqueHabitsCount || 0}\n\n`;
        }
        
        text += 'ПЕРИОД АНАЛИЗА:\n';
        text += '-'.repeat(30) + '\n';
        text += `Начало: ${new Date(data.statistics.startDate).toLocaleDateString('ru-RU')}\n`;
        text += `Конец: ${new Date(data.statistics.endDate).toLocaleDateString('ru-RU')}\n`;
        
        return text;
    }
    
    /**
     * Уничтожить все графики
     */
    destroyCharts() {
        Object.keys(this.charts).forEach(chartName => {
            if (this.charts[chartName]) {
                this.charts[chartName].destroy();
                delete this.charts[chartName];
            }
        });
    }
    
    /**
     * Генерировать метки дат
     */
    generateDateLabels() {
        const labels = [];
        const days = this.timeRange === 'week' ? 7 : 
                    this.timeRange === 'month' ? 30 : 
                    this.timeRange === 'year' ? 12 : 30;
        
        const now = new Date();
        
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date(now);
            
            if (this.timeRange === 'year') {
                date.setMonth(date.getMonth() - i);
                labels.push(date.toLocaleDateString('ru-RU', { month: 'short' }));
            } else {
                date.setDate(date.getDate() - i);
                labels.push(date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }));
            }
        }
        
        return labels;
    }
    
    /**
     * Генерировать данные выполнения
     */
    generateCompletionData() {
        const days = this.timeRange === 'week' ? 7 : 
                    this.timeRange === 'month' ? 30 : 
                    this.timeRange === 'year' ? 12 : 30;
        
        const data = [];
        
        for (let i = 0; i < days; i++) {
            // Генерируем реалистичные данные
            const baseValue = 60 + Math.random() * 30;
            const trend = Math.sin(i / days * Math.PI * 2) * 15;
            const noise = (Math.random() - 0.5) * 20;
            
            let value = baseValue + trend + noise;
            value = Math.max(0, Math.min(100, Math.round(value)));
            data.push(value);
        }
        
        return data;
    }
    
    /**
     * Генерировать данные настроения
     */
    generateMoodData() {
        return {
            labels: ['Отлично', 'Хорошо', 'Нормально', 'Плохо', 'Ужасно'],
            values: [
                Math.floor(Math.random() * 30) + 20,
                Math.floor(Math.random() * 30) + 20,
                Math.floor(Math.random() * 20) + 15,
                Math.floor(Math.random() * 15) + 5,
                Math.floor(Math.random() * 10)
            ]
        };
    }
    
    /**
     * Генерировать данные стриков
     */
    generateStreakData() {
        const days = 30;
        const labels = [];
        const values = [];
        
        let currentStreak = 0;
        
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            
            labels.push(date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }));
            
            // Симулируем случайные пропуски
            if (Math.random() > 0.2) {
                currentStreak++;
            } else if (currentStreak > 0) {
                currentStreak = 0;
            }
            
            values.push(currentStreak);
        }
        
        return { labels, values };
    }
    
    /**
     * Получить emoji для настроения
     */
    getMoodEmoji(moodValue) {
        if (moodValue >= 4.5) return '😄';
        if (moodValue >= 3.5) return '😊';
        if (moodValue >= 2.5) return '😐';
        if (moodValue >= 1.5) return '😔';
        return '😢';
    }
    
    /**
     * Получить текст для настроения
     */
    getMoodText(moodValue) {
        if (moodValue >= 4.5) return 'Отлично';
        if (moodValue >= 3.5) return 'Хорошо';
        if (moodValue >= 2.5) return 'Нормально';
        if (moodValue >= 1.5) return 'Плохо';
        return 'Ужасно';
    }
    
    /**
     * Получить текст тренда
     */
    getTrendText(value) {
        if (value >= 80) return 'Отлично!';
        if (value >= 60) return 'Хорошо';
        if (value >= 40) return 'Нормально';
        return 'Можно лучше';
    }
    
    /**
     * Получить текст единиц измерения
     */
    getUnitText() {
        // В реальном приложении нужно учитывать единицы измерения привычек
        return 'единиц';
    }
    
    /**
     * Получить русское название категории
     */
    getCategoryName(category) {
        const categories = {
            'health': 'Здоровье',
            'fitness': 'Фитнес',
            'learning': 'Обучение',
            'work': 'Работа',
            'mindfulness': 'Осознанность',
            'social': 'Социальное',
            'finance': 'Финансы',
            'other': 'Другое'
        };
        
        return categories[category] || category;
    }
    
    /**
     * Показать/скрыть индикатор загрузки
     */
    showLoading(show) {
        if (this.elements.loadingIndicator) {
            this.elements.loadingIndicator.style.display = show ? 'flex' : 'none';
        }
        
        // Блокируем элементы управления во время загрузки
        const controls = [
            this.elements.timeRangeSelector,
            this.elements.chartTypeSelector,
            this.elements.applyCustomDate,
            this.elements.exportBtn,
            this.elements.refreshBtn
        ];
        
        controls.forEach(control => {
            if (control) {
                control.disabled = show;
            }
        });
    }
    
    /**
     * Показать ошибку
     */
    showError(message) {
        if (this.elements.errorContainer) {
            this.elements.errorContainer.innerHTML = `
                <div class="alert alert-error">
                    <span>${message}</span>
                    <button class="close-btn" onclick="this.parentElement.style.display='none'">×</button>
                </div>
            `;
            this.elements.errorContainer.style.display = 'block';
        } else {
            alert(message);
        }
    }
    
    /**
     * Показать сообщение об успехе
     */
    showSuccess(message) {
        const successContainer = document.getElementById('success-container');
        if (successContainer) {
            successContainer.innerHTML = `
                <div class="alert alert-success">
                    <span>${message}</span>
                    <button class="close-btn" onclick="this.parentElement.style.display='none'">×</button>
                </div>
            `;
            successContainer.style.display = 'block';
            
            setTimeout(() => {
                successContainer.style.display = 'none';
            }, 3000);
        }
    }
}

// Инициализация менеджера статистики
let statsManager;

document.addEventListener('DOMContentLoaded', () => {
    statsManager = new StatisticsManager();
    
    // Загрузка Chart.js если не загружен
    if (typeof Chart === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
        script.onload = () => {
            if (statsManager) {
                statsManager.renderCharts();
            }
        };
        document.head.appendChild(script);
    }
});

// Экспорт в глобальную область видимости
window.statsManager = statsManager;