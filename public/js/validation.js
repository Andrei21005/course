/**
 * Валидатор форм - универсальный класс для валидации
 */
class FormValidator {
    constructor() {
        this.patterns = {
            email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            password: /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{6,}$/,
            username: /^[a-zA-Z0-9_]{3,30}$/,
            hexColor: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/,
            date: /^\d{4}-\d{2}-\d{2}$/,
            time: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/,
            url: /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/,
            phone: /^\+?[\d\s\-\(\)]{10,}$/
        };
        
        this.messages = {
            required: 'Поле обязательно для заполнения',
            email: 'Введите корректный email адрес',
            password: 'Пароль должен содержать минимум 6 символов, включая буквы и цифры',
            username: 'Имя пользователя может содержать только буквы, цифры и подчеркивания (3-30 символов)',
            minLength: (min) => `Минимальная длина: ${min} символов`,
            maxLength: (max) => `Максимальная длина: ${max} символов`,
            match: 'Пароли не совпадают',
            hexColor: 'Введите корректный hex-цвет (например, #FF5733)',
            date: 'Введите дату в формате ГГГГ-ММ-ДД',
            time: 'Введите время в формате ЧЧ:ММ',
            number: 'Введите число',
            min: (min) => `Минимальное значение: ${min}`,
            max: (max) => `Максимальное значение: ${max}`,
            url: 'Введите корректный URL',
            phone: 'Введите корректный номер телефона'
        };
    }
    
    /**
     * Валидация формы
     */
    validateForm(form) {
        const inputs = form.querySelectorAll('[data-validate]');
        let isValid = true;
        
        // Сбрасываем предыдущие ошибки
        this.clearErrors(form);
        
        inputs.forEach(input => {
            if (!this.validateInput(input)) {
                isValid = false;
            }
        });
        
        return isValid;
    }
    
    /**
     * Валидация отдельного поля
     */
    validateInput(input) {
        const rules = input.dataset.validate.split('|');
        let isValid = true;
        
        rules.forEach(rule => {
            const [ruleName, ruleValue] = rule.split(':');
            
            switch (ruleName) {
                case 'required':
                    if (!this.validateRequired(input.value)) {
                        this.showError(input, this.messages.required);
                        isValid = false;
                    }
                    break;
                    
                case 'email':
                    if (input.value && !this.validateEmail(input.value)) {
                        this.showError(input, this.messages.email);
                        isValid = false;
                    }
                    break;
                    
                case 'password':
                    if (input.value && !this.validatePassword(input.value)) {
                        this.showError(input, this.messages.password);
                        isValid = false;
                    }
                    break;
                    
                case 'username':
                    if (input.value && !this.validateUsername(input.value)) {
                        this.showError(input, this.messages.username);
                        isValid = false;
                    }
                    break;
                    
                case 'min':
                    if (input.value && !this.validateMin(input.value, ruleValue)) {
                        this.showError(input, this.messages.min(ruleValue));
                        isValid = false;
                    }
                    break;
                    
                case 'max':
                    if (input.value && !this.validateMax(input.value, ruleValue)) {
                        this.showError(input, this.messages.max(ruleValue));
                        isValid = false;
                    }
                    break;
                    
                case 'minLength':
                    if (input.value && !this.validateMinLength(input.value, ruleValue)) {
                        this.showError(input, this.messages.minLength(ruleValue));
                        isValid = false;
                    }
                    break;
                    
                case 'maxLength':
                    if (input.value && !this.validateMaxLength(input.value, ruleValue)) {
                        this.showError(input, this.messages.maxLength(ruleValue));
                        isValid = false;
                    }
                    break;
                    
                case 'match':
                    const matchField = document.querySelector(`[name="${ruleValue}"]`);
                    if (matchField && input.value !== matchField.value) {
                        this.showError(input, this.messages.match);
                        isValid = false;
                    }
                    break;
                    
                case 'hexColor':
                    if (input.value && !this.validateHexColor(input.value)) {
                        this.showError(input, this.messages.hexColor);
                        isValid = false;
                    }
                    break;
                    
                case 'date':
                    if (input.value && !this.validateDate(input.value)) {
                        this.showError(input, this.messages.date);
                        isValid = false;
                    }
                    break;
                    
                case 'time':
                    if (input.value && !this.validateTime(input.value)) {
                        this.showError(input, this.messages.time);
                        isValid = false;
                    }
                    break;
                    
                case 'number':
                    if (input.value && !this.validateNumber(input.value)) {
                        this.showError(input, this.messages.number);
                        isValid = false;
                    }
                    break;
                    
                case 'url':
                    if (input.value && !this.validateUrl(input.value)) {
                        this.showError(input, this.messages.url);
                        isValid = false;
                    }
                    break;
                    
                case 'phone':
                    if (input.value && !this.validatePhone(input.value)) {
                        this.showError(input, this.messages.phone);
                        isValid = false;
                    }
                    break;
                    
                case 'custom':
                    if (input.value && !this.validateCustom(input, ruleValue)) {
                        isValid = false;
                    }
                    break;
            }
        });
        
        if (isValid) {
            this.showSuccess(input);
        }
        
        return isValid;
    }
    
    /**
     * Валидация обязательного поля
     */
    validateRequired(value) {
        return value !== null && value !== undefined && value.toString().trim() !== '';
    }
    
    /**
     * Валидация email
     */
    validateEmail(value) {
        return this.patterns.email.test(value);
    }
    
    /**
     * Валидация пароля
     */
    validatePassword(value) {
        return this.patterns.password.test(value);
    }
    
    /**
     * Валидация имени пользователя
     */
    validateUsername(value) {
        return this.patterns.username.test(value);
    }
    
    /**
     * Валидация минимального значения
     */
    validateMin(value, min) {
        const num = parseFloat(value);
        return !isNaN(num) && num >= parseFloat(min);
    }
    
    /**
     * Валидация максимального значения
     */
    validateMax(value, max) {
        const num = parseFloat(value);
        return !isNaN(num) && num <= parseFloat(max);
    }
    
    /**
     * Валидация минимальной длины
     */
    validateMinLength(value, minLength) {
        return value.length >= parseInt(minLength);
    }
    
    /**
     * Валидация максимальной длины
     */
    validateMaxLength(value, maxLength) {
        return value.length <= parseInt(maxLength);
    }
    
    /**
     * Валидация hex-цвета
     */
    validateHexColor(value) {
        return this.patterns.hexColor.test(value);
    }
    
    /**
     * Валидация даты
     */
    validateDate(value) {
        if (!this.patterns.date.test(value)) return false;
        
        const date = new Date(value);
        return date instanceof Date && !isNaN(date);
    }
    
    /**
     * Валидация времени
     */
    validateTime(value) {
        return this.patterns.time.test(value);
    }
    
    /**
     * Валидация числа
     */
    validateNumber(value) {
        return !isNaN(parseFloat(value)) && isFinite(value);
    }
    
    /**
     * Валидация URL
     */
    validateUrl(value) {
        return this.patterns.url.test(value);
    }
    
    /**
     * Валидация телефона
     */
    validatePhone(value) {
        return this.patterns.phone.test(value);
    }
    
    /**
     * Кастомная валидация
     */
    validateCustom(input, ruleValue) {
        // Поддержка кастомных валидаторов через data-validator атрибут
        const validatorName = input.dataset.validator;
        
        if (validatorName && typeof window[validatorName] === 'function') {
            const result = window[validatorName](input.value, ruleValue);
            
            if (result !== true) {
                this.showError(input, result || 'Неверное значение');
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * Показать ошибку
     */
    showError(input, message) {
        // Удаляем предыдущие сообщения об ошибке
        this.removeError(input);
        
        // Добавляем класс ошибки
        input.classList.add('error');
        
        // Создаем элемент с сообщением об ошибке
        const errorElement = document.createElement('div');
        errorElement.className = 'error-message';
        errorElement.textContent = message;
        errorElement.style.color = '#f44336';
        errorElement.style.fontSize = '0.85rem';
        errorElement.style.marginTop = '4px';
        
        // Вставляем после input
        input.parentNode.insertBefore(errorElement, input.nextSibling);
        
        // Фокус на поле с ошибкой
        if (!input.hasAttribute('data-no-focus')) {
            input.focus();
        }
    }
    
    /**
     * Показать успех
     */
    showSuccess(input) {
        this.removeError(input);
        input.classList.remove('error');
        input.classList.add('success');
    }
    
    /**
     * Удалить сообщение об ошибке
     */
    removeError(input) {
        const errorElement = input.parentNode.querySelector('.error-message');
        if (errorElement) {
            errorElement.remove();
        }
        input.classList.remove('error');
    }
    
    /**
     * Очистить все ошибки в форме
     */
    clearErrors(form) {
        const errorElements = form.querySelectorAll('.error-message');
        errorElements.forEach(element => element.remove());
        
        const errorInputs = form.querySelectorAll('.error');
        errorInputs.forEach(input => input.classList.remove('error'));
        
        const successInputs = form.querySelectorAll('.success');
        successInputs.forEach(input => input.classList.remove('success'));
    }
    
    /**
     * Инициализация валидации для всех форм на странице
     */
    init() {
        const forms = document.querySelectorAll('form[data-validate-form]');
        
        forms.forEach(form => {
            // Валидация при отправке формы
            form.addEventListener('submit', (e) => {
                if (!this.validateForm(form)) {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                }
            });
            
            // Реальная валидация при изменении полей
            const inputs = form.querySelectorAll('[data-validate]');
            inputs.forEach(input => {
                // Валидация при потере фокуса
                input.addEventListener('blur', () => {
                    this.validateInput(input);
                });
                
                // Очистка ошибки при вводе
                input.addEventListener('input', () => {
                    this.removeError(input);
                    input.classList.remove('error', 'success');
                });
            });
        });
    }
    
    /**
     * Добавить кастомное правило валидации
     */
    addRule(ruleName, validator, message) {
        this.patterns[ruleName] = validator;
        this.messages[ruleName] = message;
    }
    
    /**
     * Валидация даты в прошлом (не будущее)
     */
    validatePastDate(value) {
        if (!this.validateDate(value)) return false;
        
        const inputDate = new Date(value);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        return inputDate <= today;
    }
    
    /**
     * Валидация даты в будущем
     */
    validateFutureDate(value) {
        if (!this.validateDate(value)) return false;
        
        const inputDate = new Date(value);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        return inputDate >= today;
    }
    
    /**
     * Валидация возраста (минимальный возраст)
     */
    validateMinAge(value, minAge) {
        if (!this.validateDate(value)) return false;
        
        const birthDate = new Date(value);
        const today = new Date();
        
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        
        return age >= parseInt(minAge);
    }
    
    /**
     * Валидация файла (расширение и размер)
     */
    validateFile(input, allowedExtensions, maxSizeMB) {
        if (!input.files || input.files.length === 0) {
            return true; // Файл не обязателен
        }
        
        const file = input.files[0];
        const extension = file.name.split('.').pop().toLowerCase();
        const sizeMB = file.size / (1024 * 1024);
        
        // Проверка расширения
        if (allowedExtensions && !allowedExtensions.includes(extension)) {
            this.showError(input, `Разрешены только файлы: ${allowedExtensions.join(', ')}`);
            return false;
        }
        
        // Проверка размера
        if (maxSizeMB && sizeMB > maxSizeMB) {
            this.showError(input, `Максимальный размер файла: ${maxSizeMB}MB`);
            return false;
        }
        
        return true;
    }
}

// Инициализация валидатора
const formValidator = new FormValidator();

// Кастомные валидаторы для привычек
window.validateHabitName = function(value, ruleValue) {
    if (!value || value.trim().length < 3) {
        return 'Название привычки должно содержать минимум 3 символа';
    }
    
    if (value.trim().length > 100) {
        return 'Название привычки не должно превышать 100 символов';
    }
    
    return true;
};

window.validateHabitFrequency = function(value, ruleValue) {
    const allowedValues = ['daily', 'weekly', 'monthly', 'custom'];
    
    if (!allowedValues.includes(value)) {
        return `Частота должна быть одним из: ${allowedValues.join(', ')}`;
    }
    
    return true;
};

window.validateHabitCategory = function(value, ruleValue) {
    const allowedCategories = ['health', 'fitness', 'learning', 'work', 'mindfulness', 'social', 'finance', 'other'];
    
    if (!allowedCategories.includes(value)) {
        return `Категория должна быть одной из: ${allowedCategories.join(', ')}`;
    }
    
    return true;
};

window.validateGoalTarget = function(value, ruleValue) {
    const num = parseFloat(value);
    
    if (isNaN(num)) {
        return 'Целевое значение должно быть числом';
    }
    
    if (num <= 0) {
        return 'Целевое значение должно быть положительным';
    }
    
    return true;
};

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    formValidator.init();
    
    // Добавляем кастомные правила
    formValidator.addRule('pastDate', (value) => formValidator.validatePastDate(value), 
        'Дата должна быть в прошлом');
    
    formValidator.addRule('futureDate', (value) => formValidator.validateFutureDate(value), 
        'Дата должна быть в будущем');
    
    formValidator.addRule('minAge', (value, minAge) => formValidator.validateMinAge(value, minAge), 
        (minAge) => `Минимальный возраст: ${minAge} лет`);
});

// Экспорт для использования в других скриптах
window.FormValidator = FormValidator;
window.formValidator = formValidator;

/**
 * Утилиты для валидации API ответов
 */
const ApiValidator = {
    /**
     * Валидация ответа API
     */
    validateResponse(response, schema) {
        if (!response || typeof response !== 'object') {
            return { isValid: false, error: 'Некорректный ответ API' };
        }
        
        // Проверка успешности
        if (response.success === false) {
            return { 
                isValid: false, 
                error: response.message || 'Ошибка API',
                data: response 
            };
        }
        
        // Если есть схема, валидируем по ней
        if (schema) {
            return this.validateSchema(response.data || response, schema);
        }
        
        return { isValid: true, data: response.data || response };
    },
    
    /**
     * Валидация по схеме
     */
    validateSchema(data, schema) {
        const errors = [];
        
        for (const [key, rules] of Object.entries(schema)) {
            if (rules.required && (data[key] === undefined || data[key] === null)) {
                errors.push(`Поле "${key}" обязательно`);
                continue;
            }
            
            if (data[key] !== undefined && data[key] !== null) {
                if (rules.type && typeof data[key] !== rules.type) {
                    errors.push(`Поле "${key}" должно быть типа ${rules.type}`);
                }
                
                if (rules.min !== undefined && data[key] < rules.min) {
                    errors.push(`Поле "${key}" должно быть не менее ${rules.min}`);
                }
                
                if (rules.max !== undefined && data[key] > rules.max) {
                    errors.push(`Поле "${key}" должно быть не более ${rules.max}`);
                }
                
                if (rules.pattern && !rules.pattern.test(data[key])) {
                    errors.push(`Поле "${key}" имеет неверный формат`);
                }
                
                if (rules.enum && !rules.enum.includes(data[key])) {
                    errors.push(`Поле "${key}" должно быть одним из: ${rules.enum.join(', ')}`);
                }
            }
        }
        
        if (errors.length > 0) {
            return { isValid: false, errors };
        }
        
        return { isValid: true, data };
    },
    
    /**
     * Обработка ошибок API
     */
    handleApiError(error, defaultMessage = 'Ошибка при загрузке данных') {
        console.error('API Error:', error);
        
        if (error.response) {
            // Ошибка HTTP
            switch (error.response.status) {
                case 400:
                    return 'Неверный запрос. Проверьте введенные данные.';
                case 401:
                    return 'Неавторизованный доступ. Пожалуйста, войдите снова.';
                case 403:
                    return 'Доступ запрещен. У вас нет прав для этого действия.';
                case 404:
                    return 'Ресурс не найден.';
                case 409:
                    return 'Конфликт данных. Возможно, запись уже существует.';
                case 422:
                    return 'Ошибка валидации данных.';
                case 429:
                    return 'Слишком много запросов. Попробуйте позже.';
                case 500:
                    return 'Внутренняя ошибка сервера. Попробуйте позже.';
                case 503:
                    return 'Сервис временно недоступен. Попробуйте позже.';
                default:
                    return `Ошибка ${error.response.status}: ${error.response.statusText}`;
            }
        } else if (error.request) {
            // Нет ответа от сервера
            return 'Нет ответа от сервера. Проверьте подключение к интернету.';
        } else {
            // Ошибка настройки запроса
            return error.message || defaultMessage;
        }
    },
    
    /**
     * Валидация токена
     */
    validateToken(token) {
        if (!token) return false;
        
        try {
            // Проверяем, что токен имеет правильный формат JWT
            const parts = token.split('.');
            if (parts.length !== 3) return false;
            
            // Декодируем payload
            const payload = JSON.parse(atob(parts[1]));
            
            // Проверяем срок действия
            if (payload.exp && Date.now() >= payload.exp * 1000) {
                return false;
            }
            
            return true;
        } catch (error) {
            console.error('Token validation error:', error);
            return false;
        }
    }
};

// Экспорт API валидатора
window.ApiValidator = ApiValidator;