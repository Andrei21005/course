/**
 * Habit Calendar - основной класс для управления календарем привычек
 */
class HabitCalendar {
    constructor() {
        this.currentDate = new Date();
        this.selectedDate = new Date();
        this.entries = [];
        this.habits = [];
        this.isLoading = false;
        
        // DOM элементы
        this.elements = {
            calendar: document.getElementById('calendar'),
            monthYear: document.getElementById('month-year'),
            prevMonthBtn: document.getElementById('prev-month'),
            nextMonthBtn: document.getElementById('next-month'),
            todayBtn: document.getElementById('today-btn'),
            loadingIndicator: document.getElementById('loading-indicator'),
            errorContainer: document.getElementById('error-container'),
            datePicker: document.getElementById('date-picker'),
            habitSelector: document.getElementById('habit-selector'),
            statusSelector: document.getElementById('status-selector'),
            saveEntryBtn: document.getElementById('save-entry-btn'),
            entryNotes: document.getElementById('entry-notes'),
            entryModal: document.getElementById('entry-modal'),
            closeModalBtn: document.getElementById('close-modal-btn')
        };
        
        this.init();
    }
    
    /**
     * Инициализация календаря
     */
    async init() {
        try {
            this.setupEventListeners();
            await this.loadHabits();
            await this.loadEntries();
            this.renderCalendar();
            this.renderQuickStats();
        } catch (error) {
            this.showError('Ошибка инициализации календаря: ' + error.message);
        }
    }
    
    /**
     * Настройка обработчиков событий
     */
    setupEventListeners() {
        // Навигация по месяцам
        this.elements.prevMonthBtn.addEventListener('click', () => this.changeMonth(-1));
        this.elements.nextMonthBtn.addEventListener('click', () => this.changeMonth(1));
        this.elements.todayBtn.addEventListener('click', () => this.goToToday());
        
        // Выбор даты
        this.elements.datePicker.addEventListener('change', (e) => {
            this.selectedDate = new Date(e.target.value);
            this.renderCalendar();
        });
        
        // Сохранение записи
        this.elements.saveEntryBtn.addEventListener('click', () => this.saveEntry());
        
        // Закрытие модального окна
        this.elements.closeModalBtn.addEventListener('click', () => {
            this.elements.entryModal.style.display = 'none';
        });
        
        // Закрытие модального окна при клике вне его
        window.addEventListener('click', (e) => {
            if (e.target === this.elements.entryModal) {
                this.elements.entryModal.style.display = 'none';
            }
        });
        
        // Горячие клавиши
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.elements.entryModal.style.display === 'block') {
                this.elements.entryModal.style.display = 'none';
            }
            if (e.key === 'ArrowLeft' && !e.ctrlKey) {
                this.changeMonth(-1);
            }
            if (e.key === 'ArrowRight' && !e.ctrlKey) {
                this.changeMonth(1);
            }
            if (e.key === 't' && e.ctrlKey) {
                e.preventDefault();
                this.goToToday();
            }
        });
    }
    
    /**
     * Загрузить привычки пользователя
     */
    async loadHabits() {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                throw new Error('Необходима авторизация');
            }
            
            const response = await fetch('/api/habits', {
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
            this.habits = data.data || data;
            
            // Заполняем селектор привычек
            this.renderHabitSelector();
            
        } catch (error) {
            console.error('Ошибка загрузки привычек:', error);
            this.showError('Не удалось загрузить привычки');
        }
    }
    
    /**
     * Загрузить записи за текущий месяц
     */
    async loadEntries() {
        this.showLoading(true);
        
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                throw new Error('Необходима авторизация');
            }
            
            const year = this.currentDate.getFullYear();
            const month = this.currentDate.getMonth() + 1;
            
            const response = await fetch(`/api/entries/calendar/${year}/${month}`, {
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
                this.entries = data.data.calendar || [];
                this.updateStatistics(data.data.statistics);
            } else {
                throw new Error(data.message || 'Ошибка загрузки записей');
            }
            
        } catch (error) {
            console.error('Ошибка загрузки записей:', error);
            this.showError('Не удалось загрузить записи');
        } finally {
            this.showLoading(false);
        }
    }
    
    /**
     * Отрисовать календарь
     */
    renderCalendar() {
        if (!this.elements.calendar) return;
        
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();
        
        // Обновляем заголовок месяца
        const monthNames = [
            'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
            'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
        ];
        
        this.elements.monthYear.textContent = `${monthNames[month]} ${year}`;
        this.elements.datePicker.value = this.selectedDate.toISOString().split('T')[0];
        
        // Получаем первый и последний день месяца
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        
        // Определяем день недели первого дня (0 - воскресенье, 1 - понедельник и т.д.)
        let firstDayIndex = firstDay.getDay();
        if (firstDayIndex === 0) firstDayIndex = 7; // Делаем воскресенье 7-м днем
        
        // Заголовки дней недели
        const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
        
        let html = `
            <div class="calendar-weekdays">
                ${weekdays.map(day => `<div class="weekday">${day}</div>`).join('')}
            </div>
            <div class="calendar-grid">
        `;
        
        // Пустые ячейки перед первым днем месяца
        for (let i = 1; i < firstDayIndex; i++) {
            html += '<div class="calendar-day empty"></div>';
        }
        
        // Дни месяца
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const dateStr = date.toISOString().split('T')[0];
            
            // Находим записи для этого дня
            const dayEntry = this.entries.find(entry => entry.date === dateStr);
            const isToday = date.toDateString() === today.toDateString();
            const isSelected = date.toDateString() === this.selectedDate.toDateString();
            
            let dayClass = 'calendar-day';
            if (isToday) dayClass += ' today';
            if (isSelected) dayClass += ' selected';
            if (dayEntry && dayEntry.completedCount > 0) dayClass += ' has-entries';
            
            // Определяем цвет статуса дня
            let statusColor = '';
            let statusText = '';
            
            if (dayEntry) {
                const completionRate = dayEntry.completionRate || 0;
                
                if (completionRate === 100) {
                    statusColor = 'success';
                    statusText = '✓';
                } else if (completionRate >= 50) {
                    statusColor = 'partial';
                    statusText = '~';
                } else if (completionRate > 0) {
                    statusColor = 'low';
                    statusText = '!';
                }
            }
            
            html += `
                <div class="${dayClass}" data-date="${dateStr}">
                    <div class="day-header">
                        <span class="day-number">${day}</span>
                        ${statusText ? `<span class="day-status ${statusColor}">${statusText}</span>` : ''}
                    </div>
                    
                    ${dayEntry ? `
                        <div class="day-content">
                            <div class="day-stats">
                                <span class="completed">${dayEntry.completedCount || 0}</span>
                                <span class="separator">/</span>
                                <span class="total">${dayEntry.totalCount || 0}</span>
                            </div>
                            ${dayEntry.habits && dayEntry.habits.length > 0 ? `
                                <div class="day-habits">
                                    ${dayEntry.habits.slice(0, 3).map(habit => `
                                        <div class="habit-indicator" style="background-color: ${habit.color || '#667eea'}" 
                                             title="${habit.name}: ${habit.status}">
                                        </div>
                                    `).join('')}
                                    ${dayEntry.habits.length > 3 ? `
                                        <div class="more-habits">+${dayEntry.habits.length - 3}</div>
                                    ` : ''}
                                </div>
                            ` : ''}
                        </div>
                    ` : ''}
                    
                    <div class="day-actions">
                        <button class="btn-add-entry" data-date="${dateStr}" title="Добавить запись">
                            +
                        </button>
                    </div>
                </div>
            `;
        }
        
        html += '</div>';
        this.elements.calendar.innerHTML = html;
        
        // Добавляем обработчики кликов на дни
        this.setupDayEventListeners();
    }
    
    /**
     * Настроить обработчики событий для дней календаря
     */
    setupDayEventListeners() {
        const dayElements = document.querySelectorAll('.calendar-day:not(.empty)');
        
        dayElements.forEach(dayElement => {
            // Клик на день
            dayElement.addEventListener('click', (e) => {
                if (e.target.classList.contains('btn-add-entry')) {
                    return; // Обрабатывается отдельно
                }
                
                const dateStr = dayElement.dataset.date;
                this.selectedDate = new Date(dateStr);
                this.renderCalendar();
                this.showDayDetails(dateStr);
            });
            
            // Кнопка добавления записи
            const addBtn = dayElement.querySelector('.btn-add-entry');
            if (addBtn) {
                addBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const dateStr = dayElement.dataset.date;
                    this.openEntryModal(dateStr);
                });
            }
        });
        
        // Drag & Drop для быстрого добавления привычек
        this.setupDragAndDrop();
    }
    
    /**
     * Настроить Drag & Drop
     */
    setupDragAndDrop() {
        // Получаем все привычки из селектора
        const habitOptions = document.querySelectorAll('#habit-selector option');
        
        habitOptions.forEach(option => {
            option.setAttribute('draggable', 'true');
            
            option.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', option.value);
                e.dataTransfer.effectAllowed = 'copy';
            });
        });
        
        // Разрешаем дроп на дни календаря
        const dayElements = document.querySelectorAll('.calendar-day:not(.empty)');
        
        dayElements.forEach(dayElement => {
            dayElement.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
                dayElement.classList.add('drag-over');
            });
            
            dayElement.addEventListener('dragleave', () => {
                dayElement.classList.remove('drag-over');
            });
            
            dayElement.addEventListener('drop', (e) => {
                e.preventDefault();
                dayElement.classList.remove('drag-over');
                
                const habitId = e.dataTransfer.getData('text/plain');
                const dateStr = dayElement.dataset.date;
                
                if (habitId && dateStr) {
                    this.openEntryModal(dateStr, habitId);
                }
            });
        });
    }
    
    /**
     * Отрисовать селектор привычек
     */
    renderHabitSelector() {
        if (!this.elements.habitSelector) return;
        
        let html = '<option value="">Выберите привычку</option>';
        
        this.habits.forEach(habit => {
            if (!habit.isArchived) {
                html += `
                    <option value="${habit._id}" 
                            data-color="${habit.color || '#667eea'}"
                            data-category="${habit.category}">
                        ${habit.name} (${this.getCategoryName(habit.category)})
                    </option>
                `;
            }
        });
        
        this.elements.habitSelector.innerHTML = html;
        
        // Обновляем цвет выбранной привычки
        this.elements.habitSelector.addEventListener('change', (e) => {
            const selectedOption = e.target.options[e.target.selectedIndex];
            const color = selectedOption.dataset.color || '#667eea';
            e.target.style.borderLeftColor = color;
        });
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
     * Показать детали дня
     */
    showDayDetails(dateStr) {
        const dayEntry = this.entries.find(entry => entry.date === dateStr);
        const detailsContainer = document.getElementById('day-details');
        
        if (!detailsContainer) return;
        
        if (!dayEntry || dayEntry.habits.length === 0) {
            detailsContainer.innerHTML = `
                <div class="empty-state">
                    <p>Нет записей за этот день</p>
                    <button class="btn btn-primary" onclick="calendar.openEntryModal('${dateStr}')">
                        Добавить запись
                    </button>
                </div>
            `;
            return;
        }
        
        const date = new Date(dateStr);
        const dateFormatted = date.toLocaleDateString('ru-RU', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        let html = `
            <div class="day-details-header">
                <h3>${dateFormatted}</h3>
                <div class="day-summary">
                    <span class="badge success">${dayEntry.completedCount} выполнено</span>
                    <span class="badge total">${dayEntry.totalCount} всего</span>
                    <span class="badge rate">${dayEntry.completionRate}% успеха</span>
                </div>
            </div>
            
            <div class="habits-list">
        `;
        
        dayEntry.habits.forEach(habit => {
            const statusClass = this.getStatusClass(habit.status);
            const statusText = this.getStatusText(habit.status);
            
            html += `
                <div class="habit-item" data-habit-id="${habit.habitId}">
                    <div class="habit-header">
                        <div class="habit-color" style="background-color: ${habit.color}"></div>
                        <div class="habit-info">
                            <h4>${habit.name}</h4>
                            <span class="habit-category">${this.getCategoryName(habit.category)}</span>
                        </div>
                        <span class="habit-status ${statusClass}">${statusText}</span>
                    </div>
                    
                    ${habit.value ? `
                        <div class="habit-value">
                            <span>Значение:</span>
                            <strong>${habit.value} ${this.getUnitForHabit(habit.habitId)}</strong>
                        </div>
                    ` : ''}
                    
                    ${habit.mood ? `
                        <div class="habit-mood">
                            <span>Настроение:</span>
                            <span class="mood-${habit.mood}">${this.getMoodText(habit.mood)}</span>
                        </div>
                    ` : ''}
                    
                    <div class="habit-actions">
                        <button class="btn btn-sm btn-edit" 
                                onclick="calendar.editEntry('${dateStr}', '${habit.habitId}')">
                            Редактировать
                        </button>
                        <button class="btn btn-sm btn-danger" 
                                onclick="calendar.deleteEntry('${dateStr}', '${habit.habitId}')">
                            Удалить
                        </button>
                    </div>
                </div>
            `;
        });
        
        html += `
            </div>
            <div class="day-actions">
                <button class="btn btn-primary" onclick="calendar.openEntryModal('${dateStr}')">
                    Добавить еще
                </button>
                <button class="btn btn-secondary" onclick="calendar.exportDay('${dateStr}')">
                    Экспортировать день
                </button>
            </div>
        `;
        
        detailsContainer.innerHTML = html;
    }
    
    /**
     * Открыть модальное окно для добавления/редактирования записи
     */
    openEntryModal(dateStr, habitId = null) {
        this.selectedDate = new Date(dateStr);
        
        // Устанавливаем дату в форме
        document.getElementById('entry-date').value = dateStr;
        
        // Если передана привычка, выбираем ее
        if (habitId && this.elements.habitSelector) {
            this.elements.habitSelector.value = habitId;
            
            // Обновляем цвет границы
            const selectedOption = this.elements.habitSelector.options[this.elements.habitSelector.selectedIndex];
            if (selectedOption) {
                const color = selectedOption.dataset.color || '#667eea';
                this.elements.habitSelector.style.borderLeftColor = color;
            }
        } else {
            this.elements.habitSelector.value = '';
            this.elements.habitSelector.style.borderLeftColor = '#e0e0e0';
        }
        
        // Сбрасываем остальные поля
        this.elements.statusSelector.value = 'completed';
        this.elements.entryNotes.value = '';
        
        // Проверяем, есть ли уже запись для этой даты и привычки
        if (habitId) {
            const existingEntry = this.findEntry(dateStr, habitId);
            if (existingEntry) {
                this.elements.statusSelector.value = existingEntry.status;
                this.elements.entryNotes.value = existingEntry.notes || '';
                
                // Обновляем заголовок модального окна
                document.querySelector('#entry-modal .modal-title').textContent = 'Редактировать запись';
            } else {
                document.querySelector('#entry-modal .modal-title').textContent = 'Добавить запись';
            }
        }
        
        // Показываем модальное окно
        this.elements.entryModal.style.display = 'block';
    }
    
    /**
     * Найти запись по дате и привычке
     */
    findEntry(dateStr, habitId) {
        const dayEntry = this.entries.find(entry => entry.date === dateStr);
        if (dayEntry && dayEntry.habits) {
            return dayEntry.habits.find(habit => habit.habitId === habitId);
        }
        return null;
    }
    
    /**
     * Сохранить запись
     */
    async saveEntry() {
        const date = document.getElementById('entry-date').value;
        const habitId = this.elements.habitSelector.value;
        const status = this.elements.statusSelector.value;
        const notes = this.elements.entryNotes.value.trim();
        
        // Валидация
        if (!habitId) {
            this.showError('Пожалуйста, выберите привычку');
            return;
        }
        
        if (!date) {
            this.showError('Пожалуйста, выберите дату');
            return;
        }
        
        this.showLoading(true);
        
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                throw new Error('Необходима авторизация');
            }
            
            const entryData = {
                habitId,
                date,
                status,
                notes: notes || undefined
            };
            
            const response = await fetch('/api/entries', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(entryData)
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Ошибка сохранения записи');
            }
            
            const result = await response.json();
            
            // Обновляем данные
            await this.loadEntries();
            this.renderCalendar();
            
            // Закрываем модальное окно
            this.elements.entryModal.style.display = 'none';
            
            // Показываем сообщение об успехе
            this.showSuccess(result.message || 'Запись сохранена успешно');
            
        } catch (error) {
            console.error('Ошибка сохранения записи:', error);
            this.showError(error.message || 'Не удалось сохранить запись');
        } finally {
            this.showLoading(false);
        }
    }
    
    /**
     * Редактировать запись
     */
    editEntry(dateStr, habitId) {
        this.openEntryModal(dateStr, habitId);
    }
    
    /**
     * Удалить запись
     */
    async deleteEntry(dateStr, habitId) {
        if (!confirm('Вы уверены, что хотите удалить эту запись?')) {
            return;
        }
        
        this.showLoading(true);
        
        try {
            // Сначала находим ID записи
            const entry = await this.findEntryInDatabase(dateStr, habitId);
            
            if (!entry) {
                throw new Error('Запись не найдена');
            }
            
            const token = localStorage.getItem('token');
            if (!token) {
                throw new Error('Необходима авторизация');
            }
            
            const response = await fetch(`/api/entries/${entry._id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Ошибка удаления записи');
            }
            
            // Обновляем данные
            await this.loadEntries();
            this.renderCalendar();
            
            // Обновляем детали дня
            this.showDayDetails(dateStr);
            
            // Показываем сообщение об успехе
            this.showSuccess('Запись удалена успешно');
            
        } catch (error) {
            console.error('Ошибка удаления записи:', error);
            this.showError(error.message || 'Не удалось удалить запись');
        } finally {
            this.showLoading(false);
        }
    }
    
    /**
     * Найти запись в базе данных
     */
    async findEntryInDatabase(dateStr, habitId) {
        try {
            const token = localStorage.getItem('token');
            if (!token) return null;
            
            const startDate = new Date(dateStr);
            const endDate = new Date(dateStr);
            endDate.setHours(23, 59, 59, 999);
            
            const response = await fetch(`/api/entries?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}&habitId=${habitId}&limit=1`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.data && data.data.entries && data.data.entries.length > 0) {
                    return data.data.entries[0];
                }
            }
            
            return null;
        } catch (error) {
            console.error('Ошибка поиска записи:', error);
            return null;
        }
    }
    
    /**
     * Изменить месяц
     */
    changeMonth(delta) {
        this.currentDate.setMonth(this.currentDate.getMonth() + delta);
        this.loadEntries().then(() => {
            this.renderCalendar();
            this.updateUrl();
        });
    }
    
    /**
     * Перейти к сегодняшнему дню
     */
    goToToday() {
        this.currentDate = new Date();
        this.selectedDate = new Date();
        this.loadEntries().then(() => {
            this.renderCalendar();
            this.updateUrl();
        });
    }
    
    /**
     * Обновить URL с параметрами
     */
    updateUrl() {
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth() + 1;
        const date = this.selectedDate.toISOString().split('T')[0];
        
        const url = new URL(window.location);
        url.searchParams.set('year', year);
        url.searchParams.set('month', month);
        url.searchParams.set('date', date);
        
        window.history.pushState({}, '', url);
    }
    
    /**
     * Отрисовать быструю статистику
     */
    renderQuickStats() {
        const statsContainer = document.getElementById('quick-stats');
        if (!statsContainer) return;
        
        const totalEntries = this.entries.reduce((sum, day) => sum + (day.totalCount || 0), 0);
        const completedEntries = this.entries.reduce((sum, day) => sum + (day.completedCount || 0), 0);
        const completionRate = totalEntries > 0 ? Math.round((completedEntries / totalEntries) * 100) : 0;
        
        // Находим текущий стрик
        const today = new Date().toISOString().split('T')[0];
        let currentStreak = 0;
        
        for (let i = 0; i < 30; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            
            const dayEntry = this.entries.find(entry => entry.date === dateStr);
            if (dayEntry && dayEntry.completedCount > 0) {
                currentStreak++;
            } else {
                break;
            }
        }
        
        statsContainer.innerHTML = `
            <div class="stat-card">
                <div class="stat-value">${completedEntries}</div>
                <div class="stat-label">Выполнено</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${totalEntries}</div>
                <div class="stat-label">Всего записей</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${completionRate}%</div>
                <div class="stat-label">Успешность</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${currentStreak}</div>
                <div class="stat-label">Дней подряд</div>
            </div>
        `;
    }
    
    /**
     * Обновить статистику
     */
    updateStatistics(stats) {
        // Обновляем графики и дополнительную статистику
        if (stats && stats.overall) {
            this.renderCharts(stats);
        }
    }
    
    /**
     * Отрисовать графики
     */
    renderCharts(stats) {
        const chartsContainer = document.getElementById('charts-container');
        if (!chartsContainer) return;
        
        // Простая реализация графиков
        // В реальном приложении здесь можно использовать Chart.js
        
        chartsContainer.innerHTML = `
            <div class="chart-section">
                <h4>Статистика за месяц</h4>
                <div class="chart-bars">
                    ${stats.byDayOfWeek ? stats.byDayOfWeek.map(day => `
                        <div class="chart-bar-container">
                            <div class="chart-bar-label">${this.getDayName(day.dayOfWeek)}</div>
                            <div class="chart-bar">
                                <div class="chart-bar-fill" style="height: ${day.completionRate}%"></div>
                            </div>
                            <div class="chart-bar-value">${day.completionRate}%</div>
                        </div>
                    `).join('') : ''}
                </div>
            </div>
        `;
    }
    
    /**
     * Экспортировать данные дня
     */
    async exportDay(dateStr) {
        try {
            const dayEntry = this.entries.find(entry => entry.date === dateStr);
            if (!dayEntry) {
                this.showError('Нет данных для экспорта');
                return;
            }
            
            const exportData = {
                date: dateStr,
                habits: dayEntry.habits.map(habit => ({
                    name: habit.name,
                    category: habit.category,
                    status: habit.status,
                    value: habit.value,
                    mood: habit.mood
                })),
                summary: {
                    completed: dayEntry.completedCount,
                    total: dayEntry.totalCount,
                    completionRate: dayEntry.completionRate
                }
            };
            
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `habit-tracker-${dateStr}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.showSuccess('Данные экспортированы успешно');
            
        } catch (error) {
            console.error('Ошибка экспорта:', error);
            this.showError('Не удалось экспортировать данные');
        }
    }
    
    /**
     * Показать/скрыть индикатор загрузки
     */
    showLoading(show) {
        this.isLoading = show;
        
        if (this.elements.loadingIndicator) {
            this.elements.loadingIndicator.style.display = show ? 'flex' : 'none';
        }
        
        // Блокируем кнопки во время загрузки
        const buttons = [
            this.elements.prevMonthBtn,
            this.elements.nextMonthBtn,
            this.elements.todayBtn,
            this.elements.saveEntryBtn
        ];
        
        buttons.forEach(btn => {
            if (btn) {
                btn.disabled = show;
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
            
            // Автоматически скрываем через 3 секунды
            setTimeout(() => {
                successContainer.style.display = 'none';
            }, 3000);
        }
    }
    
    /**
     * Получить класс для статуса
     */
    getStatusClass(status) {
        const classes = {
            'completed': 'success',
            'partial': 'warning',
            'skipped': 'info',
            'not_done': 'error'
        };
        return classes[status] || 'default';
    }
    
    /**
     * Получить текст статуса
     */
    getStatusText(status) {
        const texts = {
            'completed': 'Выполнено',
            'partial': 'Частично',
            'skipped': 'Пропущено',
            'not_done': 'Не выполнено'
        };
        return texts[status] || status;
    }
    
    /**
     * Получить единицу измерения для привычки
     */
    getUnitForHabit(habitId) {
        const habit = this.habits.find(h => h._id === habitId);
        if (habit && habit.targetUnit) {
            const units = {
                'times': 'раз',
                'minutes': 'мин',
                'hours': 'ч',
                'pages': 'стр',
                'words': 'слов',
                'other': 'ед.'
            };
            return units[habit.targetUnit] || habit.targetUnit;
        }
        return 'раз';
    }
    
    /**
     * Получить текст настроения
     */
    getMoodText(mood) {
        const moods = {
            'excellent': 'Отлично',
            'good': 'Хорошо',
            'neutral': 'Нормально',
            'bad': 'Плохо',
            'awful': 'Ужасно'
        };
        return moods[mood] || mood;
    }
    
    /**
     * Получить название дня недели
     */
    getDayName(dayNumber) {
        const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
        return days[dayNumber - 1] || `День ${dayNumber}`;
    }
}

// Инициализация календаря при загрузке страницы
let calendar;

document.addEventListener('DOMContentLoaded', () => {
    calendar = new HabitCalendar();
    
    // Обработка параметров URL
    const urlParams = new URLSearchParams(window.location.search);
    const year = urlParams.get('year');
    const month = urlParams.get('month');
    const date = urlParams.get('date');
    
    if (year && month) {
        calendar.currentDate = new Date(year, month - 1, 1);
    }
    
    if (date) {
        calendar.selectedDate = new Date(date);
    }
    
    // Восстановление состояния из localStorage
    const savedState = localStorage.getItem('calendarState');
    if (savedState) {
        try {
            const state = JSON.parse(savedState);
            if (state.currentDate) {
                calendar.currentDate = new Date(state.currentDate);
            }
            if (state.selectedDate) {
                calendar.selectedDate = new Date(state.selectedDate);
            }
        } catch (error) {
            console.error('Ошибка восстановления состояния:', error);
        }
    }
    
    // Сохранение состояния при разгрузке страницы
    window.addEventListener('beforeunload', () => {
        const state = {
            currentDate: calendar.currentDate.toISOString(),
            selectedDate: calendar.selectedDate.toISOString()
        };
        localStorage.setItem('calendarState', JSON.stringify(state));
    });
});

// Экспорт в глобальную область видимости для доступа из HTML
window.calendar = calendar;