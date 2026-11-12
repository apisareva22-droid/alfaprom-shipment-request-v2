/* Public reads only. Mutations use POST; status reads contain no customer data. */
(function () {
  let sequence = 0;
  window.ShipmentTransport = {
    endpoint: 'https://script.google.com/macros/s/AKfycbyg0Ov5Gc632N16R61A1MySKK4jiU-Jh9AO4yoDiJvS7Y5m2FWt7emuiClrQXFrcXKrPA/exec',
    jsonp: function (url, timeoutMs) {
      return new Promise(function (resolve, reject) {
        const callback = '__shipment_' + Date.now() + '_' + (++sequence);
        const script = document.createElement('script');
        let settled = false;
        function finish(error, value) {
          if (settled) return;
          settled = true; clearTimeout(timer); script.remove();
          window[callback] = function () {};
          setTimeout(function () { delete window[callback]; }, 30000);
          if (error) reject(error); else resolve(value);
        }
        const timer = setTimeout(function () { finish(new Error('Сервис не ответил вовремя. Повторите попытку.')); }, timeoutMs || 12000);
        window[callback] = function (value) { finish(null, value); };
        script.onerror = function () { finish(new Error('Не удалось связаться с сервисом. Проверьте соединение и повторите попытку.')); };
        script.referrerPolicy = 'no-referrer';
        script.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + callback;
        document.head.appendChild(script);
      });
    }
  };
}());
