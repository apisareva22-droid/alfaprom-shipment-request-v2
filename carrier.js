(function () {
  const cityInput = document.querySelector('[name="carrierCity"]');
  const cityOptions = document.querySelector('#carrier-city-options');
  const mode = document.querySelector('[name="carrierDeliveryMode"]');
  const terminal = document.querySelector('.terminal-choice');
  const terminalInput = document.querySelector('[name="terminal"]');
  const terminalSelect = document.querySelector('[name="pekTerminal"]');
  const warehouseId = document.querySelector('[name="pekWarehouseId"]');
  const address = document.querySelector('.address-choice');
  const terminalHelp = document.querySelector('#terminal-help');
  const carrier = document.querySelector('[name="carrier"]');
  const endpoint = 'https://script.google.com/macros/s/AKfycbyg0Ov5Gc632N16R61A1MySKK4jiU-Jh9AO4yoDiJvS7Y5m2FWt7emuiClrQXFrcXKrPA/exec';
  const carrierDropdown = setupDropdown(carrier, 'Выберите транспортную компанию');
  const modeDropdown = setupDropdown(mode, 'Выберите способ доставки');
  const terminalDropdown = setupDropdown(terminalSelect, 'Выберите ближайший терминал');
  if (!cityInput || !cityOptions || !mode || !terminal || !address) return;

  function setupDropdown(select, placeholder) {
    if (!select) return null;
    const dropdown = document.createElement('div');
    const trigger = document.createElement('button');
    const menu = document.createElement('div');
    dropdown.className = 'custom-dropdown' + (select.classList.contains('hidden') ? ' hidden' : '');
    trigger.type = 'button';
    trigger.className = 'custom-dropdown-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    menu.className = 'custom-dropdown-menu hidden';
    menu.setAttribute('role', 'listbox');
    dropdown.append(trigger, menu);
    select.classList.add('dropdown-native');
    select.insertAdjacentElement('afterend', dropdown);

    function close() {
      menu.classList.add('hidden');
      trigger.setAttribute('aria-expanded', 'false');
      dropdown.classList.remove('open');
    }
    function render() {
      const selected = select.options[select.selectedIndex];
      trigger.textContent = selected && selected.value ? selected.textContent : placeholder;
      trigger.classList.toggle('is-placeholder', !(selected && selected.value));
      menu.replaceChildren();
      Array.from(select.options).forEach(function (option) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'custom-dropdown-option' + (option.selected ? ' selected' : '');
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', option.selected ? 'true' : 'false');
        item.textContent = option.textContent;
        item.disabled = option.disabled;
        item.addEventListener('click', function () {
          select.value = option.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          close();
        });
        menu.appendChild(item);
      });
    }
    trigger.addEventListener('click', function () {
      const willOpen = menu.classList.contains('hidden');
      document.querySelectorAll('.custom-dropdown-menu').forEach(function (other) {
        if (other !== menu) other.classList.add('hidden');
      });
      document.querySelectorAll('.custom-dropdown').forEach(function (other) {
        if (other !== dropdown) other.classList.remove('open');
      });
      menu.classList.toggle('hidden', !willOpen);
      trigger.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      dropdown.classList.toggle('open', willOpen);
    });
    document.addEventListener('click', function (event) {
      if (!dropdown.contains(event.target)) close();
    });
    select.addEventListener('change', render);
    render();
    return {
      render: render,
      setVisible: function (visible) { dropdown.classList.toggle('hidden', !visible); if (!visible) close(); }
    };
  }


  let cityTimer;
  let pekTimer;
  let controller;
  let requestId = 0;
  let jsonpId = 0;
  const cityCache = new Map();
  const pekCache = new Map();

  function isTerminalLookupRoute() {
    return (carrier.value === 'ПЭК' || carrier.value === 'Деловые Линии') && mode.value === 'terminal';
  }

  function closeCities() {
    cityOptions.classList.add('hidden');
    cityInput.setAttribute('aria-expanded', 'false');
  }

  function clearPekChoices() {
    if (!terminalSelect) return;
    terminalSelect.replaceChildren(new Option('Выберите терминал ПЭК', ''));
    terminalSelect.classList.add('hidden');
    if (terminalDropdown) terminalDropdown.setVisible(false);
    terminalInput.classList.remove('hidden');
    if (warehouseId) warehouseId.value = '';
  }

  function updateRoute() {
    const toAddress = mode.value === 'address';
    terminal.classList.toggle('hidden', toAddress);
    address.classList.toggle('hidden', !toAddress);
    if (toAddress) return;

    const name = carrier.value || 'выбранной ТК';
    const city = cityInput.value ? ' в населённом пункте «' + cityInput.value + '»' : '';
    if (terminalHelp) terminalHelp.textContent = 'Выберите или укажите терминал ' + name + city + '.';

    clearTimeout(pekTimer);
    if (isTerminalLookupRoute() && cityInput.value.trim().length >= 2) {
      pekTimer = setTimeout(function () { loadCarrierTerminals(cityInput.value); }, 450);
    } else {
      clearPekChoices();
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
    if (cityCache.has(key)) {
      renderCities(cityCache.get(key));
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
      cityCache.set(key, places);
      if (currentRequest === requestId) renderCities(places);
    } catch (error) {
      if (error.name !== 'AbortError' && currentRequest === requestId) closeCities();
    }
  }

  function getJsonp(url) {
    return new Promise(function (resolve, reject) {
      const callback = '__pekCallback' + (++jsonpId);
      const script = document.createElement('script');
      const timeout = setTimeout(cleanup, 12000);

      function cleanup() {
        clearTimeout(timeout);
        script.remove();
        delete window[callback];
      }
      window[callback] = function (payload) {
        cleanup();
        resolve(payload);
      };
      script.onerror = function () {
        cleanup();
        reject(new Error('Не удалось получить терминалы ПЭК.'));
      };
      script.src = url + '&callback=' + callback;
      document.head.appendChild(script);
    });
  }

  function terminalLabel(item) {
    return [item.name, item.address].filter(Boolean).join(' — ');
  }

  function renderCarrierTerminals(result) {
    const terminals = (result && result.terminals) || [];
    if (!terminalSelect || !terminals.length) {
      clearPekChoices();
      if (terminalHelp) terminalHelp.textContent = 'Транспортная компания не нашла терминалы рядом. Укажите терминал вручную.';
      return;
    }

    terminalSelect.replaceChildren(new Option('Выберите ближайший терминал', ''));
    terminals.forEach(function (item) {
      const option = new Option(terminalLabel(item), item.id);
      option.dataset.label = terminalLabel(item);
      terminalSelect.add(option);
    });
    terminalSelect.classList.remove('hidden');
    if (terminalDropdown) { terminalDropdown.setVisible(true); terminalDropdown.render(); }
    terminalInput.classList.add('hidden');
    terminalInput.value = '';
    if (warehouseId) warehouseId.value = '';
    if (terminalHelp) terminalHelp.textContent = 'Транспортная компания подобрала ближайшие терминалы к указанному населённому пункту.';
  }

  async function loadCarrierTerminals(location) {
    if (!isTerminalLookupRoute()) return;
    const normalized = location.trim();
    const selectedCarrier = carrier.value;
    const key = selectedCarrier + ':' + normalized.toLocaleLowerCase('ru');
    if (pekCache.has(key)) {
      renderCarrierTerminals(pekCache.get(key));
      return;
    }
    if (terminalHelp) terminalHelp.textContent = 'Подбираем ближайшие терминалы ' + selectedCarrier + '…';

    try {
      const action = selectedCarrier === 'ПЭК' ? 'pekTerminals' : 'dellinTerminals';
      const result = await getJsonp(endpoint + '?action=' + action + '&location=' + encodeURIComponent(normalized));
      if (!isTerminalLookupRoute() || carrier.value !== selectedCarrier || cityInput.value.trim() !== normalized) return;
      pekCache.set(key, result);
      renderCarrierTerminals(result);
    } catch (error) {
      clearPekChoices();
      if (terminalHelp) terminalHelp.textContent = 'Не удалось подобрать терминалы. Укажите терминал вручную.';
    }
  }

  cityInput.addEventListener('focus', function () {
    if (cityInput.value.trim().length >= 2) searchPlaces(cityInput.value);
  });
  cityInput.addEventListener('input', function () {
    clearTimeout(cityTimer);
    cityTimer = setTimeout(function () { searchPlaces(cityInput.value); }, 250);
    updateRoute();
  });
  cityInput.addEventListener('blur', function () { setTimeout(closeCities, 150); });
  cityInput.addEventListener('change', updateRoute);
  carrier.addEventListener('change', updateRoute);
  mode.addEventListener('change', updateRoute);
  if (terminalSelect) terminalSelect.addEventListener('change', function () {
    const option = terminalSelect.options[terminalSelect.selectedIndex];
    terminalInput.value = option && option.dataset.label ? option.dataset.label : '';
    if (warehouseId) warehouseId.value = terminalSelect.value;
  });
  updateRoute();
}());
