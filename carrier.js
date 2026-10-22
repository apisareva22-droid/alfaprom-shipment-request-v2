(function () {
  const cities = ['Москва','Санкт-Петербург','Самара','Тольятти','Казань','Уфа','Екатеринбург','Нижний Новгород','Новосибирск','Челябинск','Омск','Пермь','Ростов-на-Дону','Краснодар','Воронеж','Тюмень','Саратов','Волгоград','Ижевск','Ульяновск'];
  const cityInput = document.querySelector('[name="carrierCity"]');
  const cityOptions = document.querySelector('#carrier-city-options');
  const mode = document.querySelector('[name="carrierDeliveryMode"]');
  const terminal = document.querySelector('.terminal-choice');
  const address = document.querySelector('.address-choice');
  const terminalHelp = document.querySelector('#terminal-help');
  const carrier = document.querySelector('[name="carrier"]');
  if (!cityInput || !cityOptions || !mode || !terminal || !address) return;

  function closeCities() {
    cityOptions.classList.add('hidden');
    cityInput.setAttribute('aria-expanded', 'false');
  }
  function showCities(query) {
    const value = query.trim().toLocaleLowerCase('ru');
    const matches = cities.filter(city => !value || city.toLocaleLowerCase('ru').includes(value));
    cityOptions.replaceChildren(...matches.map(city => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'city-option';
      option.setAttribute('role', 'option');
      option.textContent = city;
      option.addEventListener('mousedown', event => {
        event.preventDefault();
        cityInput.value = city;
        closeCities();
        updateRoute();
      });
      return option;
    }));
    cityOptions.classList.toggle('hidden', matches.length === 0);
    cityInput.setAttribute('aria-expanded', matches.length ? 'true' : 'false');
  }
  function updateRoute() {
    const toAddress = mode.value === 'address';
    terminal.classList.toggle('hidden', toAddress);
    address.classList.toggle('hidden', !toAddress);
    if (!toAddress && terminalHelp) {
      const name = carrier.value || 'выбранной ТК';
      const city = cityInput.value ? ' в городе «' + cityInput.value + '»' : '';
      terminalHelp.textContent = 'Выберите или укажите терминал ' + name + city + '.';
    }
  }
  cityInput.addEventListener('focus', () => showCities(cityInput.value));
  cityInput.addEventListener('input', () => { showCities(cityInput.value); updateRoute(); });
  cityInput.addEventListener('blur', () => setTimeout(closeCities, 120));
  cityInput.addEventListener('change', updateRoute);
  carrier.addEventListener('change', updateRoute);
  mode.addEventListener('change', updateRoute);
  updateRoute();
}());
