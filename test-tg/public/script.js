document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('feedbackForm');
    const loading = document.getElementById('loading');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Получаем данные формы
        const formData = {
            name: document.getElementById('name').value,
            email: document.getElementById('email').value,
            rating: document.getElementById('rating').value,
            comment: document.getElementById('comment').value
        };

        // Показываем загрузку
        form.style.display = 'none';
        loading.classList.add('active');

        // Имитация отправки (задержка 1 секунда)
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Скрываем загрузку
        loading.classList.remove('active');
        form.style.display = 'block';

        // Всегда показываем успех
        showCustomAlert('✅ Успешно!', 'Данные отправлены!', 'success');
        
        // Очищаем форму
        form.reset();
    });
});

function showCustomAlert(title, message, type) {
    // Создаем overlay
    const overlay = document.createElement('div');
    overlay.className = 'overlay active';

    // Создаем alert
    const alert = document.createElement('div');
    alert.className = 'alert';

    const icon = type === 'success' ? '✅' : '❌';

    alert.innerHTML = `
        <div class="alert-icon">${icon}</div>
        <div class="alert-title">${title}</div>
        <div class="alert-message">${message}</div>
        <button class="alert-btn" onclick="closeAlert()">OK</button>
    `;

    // Добавляем на страницу
    document.body.appendChild(overlay);
    document.body.appendChild(alert);

    // Функция закрытия alert
    window.closeAlert = () => {
        alert.style.animation = 'popIn 0.3s ease-out reverse';
        setTimeout(() => {
            document.body.removeChild(alert);
            document.body.removeChild(overlay);
        }, 300);
    };

    // Закрытие по клику на overlay
    overlay.addEventListener('click', window.closeAlert);
}

