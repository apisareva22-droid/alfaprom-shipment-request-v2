(function () {
  const cityInput = document.querySelector('[name="carrierCity"]');
  const cityOptions = document.querySelector('#carrier-city-options');
  const mode = document.querySelector('[name="carrierDeliveryMode"]');
  const terminal = document.querySelector('.terminal-choice');
  const address = document.querySelector('.address-choice');
  const terminalHelp = document.querySelector('#terminal-help');
  const carrier = document.querySelector('[name="carrier"]');
  if (!cityInput || !cityOptions || !mode || !terminal || !address) return;

  let timer;
  let controller;
  let requestId = 0;
  const cache = new Map();

  function closeCities() {
    cityOptions.classList.add('hidden');
    cityInput.setAttribute('aria-expanded', 'false');
  }

  function updateRoute() {
    const toAddress = mode.value === 'address';
    terminal.classList.toggle('hidden', toAddress);
    address.classList.toggle('hidden', !toAddress);
    if (!toAddress && terminalHelp) {
      const name = carrier.value || 'выбранной ТК';
      const city = cityInput.value ? ' в населённом пункте «' + cityInput.value + '»' : '';
      terminalHelp.textContent = 'Выберите или укажите терминал ' + name + city + '.';
    }
  }

  function placeTitle(place) {
    const address = place.address || {};
    const locality = address.city || address.town || address.village || address.municipality || address.hamlet || place.display_name.split(',')[0];
    const region = address.state || address.region || address.county || '';
    return region && locality ? locality + ' — ' + region : place.display_name;
  }

  function renderCities(places) {
    const seen = new Set();
    const options = places.filter(function (place) {
      const title = placeTitle(place);
      if (seen.has(title)) return false;
      seen.add(title);
      return true;
    }).map(function (place) {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'city-option';
      option.setAttribute('role', 'option');
      option.textContent = placeTitle(place);
      option.addEventListener('mousedown', function (event) {
        event.preventDefault();
        cityInput.value = option.textContent;
        closeCities();
        updateRoute();
      });
      return option;
    });
    cityOptions.replaceChildren(...options);
    cityOptions.classList.toggle('hidden', options.length === 0);
    cityInput.setAttribute('aria-expanded', options.length ? 'true' : 'false');
  }

  function showLoading() {
    const status = document.createElement('div');
    status.className = 'city-option';
    status.setAttribute('aria-live', 'polite');
    status.textContent = 'Ищем населённые пункты…';
    cityOptions.replaceChildren(status);
    cityOptions.classList.remove('hidden');
    cityInput.setAttribute('aria-expanded', 'true');
  }

  async function searchPlaces(query) {
    const value = query.trim();
    if (value.length < 2) {
      closeCities();
      return;
    }

    const key = value.toLocaleLowerCase('ru');
    if (cache.has(key)) {
      renderCities(cache.get(key));
      return;
    }

    const currentRequest = ++requestId;
    if (controller) controller.abort();
    controller = new AbortController();
    showLoading();

    try {
      const response = await fetch(
        'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=ru&limit=8&q=' + encodeURIComponent(value),
        { signal: controller.signal }
      );
      if (!response.ok) throw new Error('Не удалось найти населённые пункты.');
      const places = await response.json();
      cache.set(key, places);
      if (currentRequest === requestId) renderCities(places);
    } catch (error) {
      if (error.name !== 'AbortError' && currentRequest === requestId) closeCities();
    }
  }

  cityInput.addEventListener('focus', function () {
    if (cityInput.value.trim().length >= 2) searchPlaces(cityInput.value);
  });
  cityInput.addEventListener('input', function () {
    clearTimeout(timer);
    timer = setTimeout(function () { searchPlaces(cityInput.value); }, 250);
    updateRoute();
  });
  cityInput.addEventListener('blur', function () { setTimeout(closeCities, 150); });
  cityInput.addEventListener('change', updateRoute);
  carrier.addEventListener('change', updateRoute);
  mode.addEventListener('change', updateRoute);
  updateRoute();
}());
