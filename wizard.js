(function () {
  const form = document.querySelector('#request-form');
  if (!form) return;

  const total = 5;
  const labels = ['Тип покупателя', 'Данные покупателя', 'Получение товара', 'Подписание', 'Проверка заявки'];
  let currentStep = 1;

  function visibleStepCard(step) {
    return Array.from(document.querySelectorAll('.wizard-step[data-step="' + step + '"]'))
      .find(function (card) { return !card.classList.contains('hidden'); });
  }

  function setError(message) {
    document.querySelectorAll('.wizard-error').forEach(function (item) { item.remove(); });
    if (!message) return;
    const card = visibleStepCard(currentStep);
    if (!card) return;
    const error = document.createElement('p');
    error.className = 'wizard-error';
    error.setAttribute('role', 'alert');
    error.textContent = message;
    card.appendChild(error);
  }

  function requireValue(selector, label) {
    const input = form.querySelector(selector);
    if (!input || !input.value.trim()) throw new Error('Заполните поле: «' + label + '».');
  }

  function validateStep(step) {
    if (step === 2) {
      const type = form.querySelector('[name="customerType"]:checked').value;
      if (type === 'legal') {
        if (form.querySelector('#legal-details').classList.contains('hidden')) throw new Error('Введите ИНН и дождитесь завершения поиска организации.');
        requireValue('[name="legalName"]', 'Полное наименование организации');
        requireValue('[name="legalInn"]', 'ИНН');
        requireValue('[name="legalSigner"]', 'ФИО подписанта');
      } else {
        requireValue('[name="personName"]', 'Фамилия, имя, отчество');
        requireValue('[name="contactPhone"]', 'Телефон');
        const isIp = form.querySelector('[name="isIp"]').checked;
        if (isIp) requireValue('[name="personInn"]', 'ИНН ИП');
      }
    }
    if (step === 3) {
      const delivery = form.querySelector('[name="deliveryType"]:checked').value;
      if (delivery === 'carrier') {
        requireValue('[name="carrier"]', 'Транспортная компания');
        requireValue('[name="carrierCity"]', 'Город получения');
        requireValue('[name="recipient"]', 'Грузополучатель');
        if (form.querySelector('[name="carrierDeliveryMode"]').value === 'address') {
          requireValue('[name="deliveryAddress"]', 'Адрес доставки');
        } else {
          requireValue('[name="terminal"]', 'Терминал транспортной компании');
        }
      }
      if (delivery === 'representative') {
        requireValue('[name="repPosition"]', 'Должность получателя');
        requireValue('[name="repName"]', 'ФИО получателя');
        requireValue('[name="repPassport"]', 'Паспорт: серия и номер');
        requireValue('[name="repPassportIssued"]', 'Кем и когда выдан паспорт');
      }
      requireValue('[name="shipmentBasis"]', 'Счёт, договор или спецификация');
    }
  }

  function updateProgress() {
    document.querySelector('#wizard-title').textContent = 'Шаг ' + currentStep + ' из ' + total;
    document.querySelector('#wizard-label').textContent = labels[currentStep - 1];
    document.querySelector('#wizard-bar').style.width = (currentStep / total * 100) + '%';
  }

  function showStep(step, shouldScroll) {
    currentStep = step;
    document.querySelectorAll('.wizard-step').forEach(function (card) {
      const cardStep = Number(card.dataset.step);
      card.classList.toggle('active-step', cardStep === currentStep && !card.classList.contains('hidden'));
    });
    setError('');
    updateProgress();
    if (shouldScroll) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function addNavigation() {
    document.querySelectorAll('.wizard-step').forEach(function (card) {
      const step = Number(card.dataset.step);
      if (step === total) return;
      const nav = document.createElement('div');
      nav.className = 'wizard-nav';
      nav.innerHTML = '<button type="button" class="secondary' + (step === 1 ? ' hidden' : '') + '" data-wizard-back>Назад</button><button type="button" class="primary" data-wizard-next>' + (step === 4 ? 'Проверить заявку' : 'Продолжить') + '</button>';
      card.appendChild(nav);
    });
  }

  document.addEventListener('click', function (event) {
    const next = event.target.closest('[data-wizard-next]');
    const back = event.target.closest('[data-wizard-back]');
    if (next) {
      try {
        validateStep(currentStep);
        showStep(Math.min(total, currentStep + 1), true);
      } catch (error) {
        setError(error.message);
      }
    }
    if (back) showStep(Math.max(1, currentStep - 1), true);
  });

  document.querySelectorAll('[name="customerType"], [name="deliveryType"], [name="isIp"]').forEach(function (input) {
    input.addEventListener('change', function () {
      if (currentStep === 2 || currentStep === 3) showStep(currentStep, false);
    });
  });

  addNavigation();
  showStep(1, false);
}());


