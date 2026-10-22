(function () {
  const fields = document.querySelectorAll('[name="repPassport"], [name="personPassport"]');
  if (!fields.length) return;
  function formatPassport(value) {
    const compact = value.toUpperCase().replace(/[^0-9A-ZА-ЯЁ]/g, '');
    if (/^\d+$/.test(compact)) return compact.length > 4 ? compact.slice(0, 4) + ' ' + compact.slice(4) : compact;
    const foreign = compact.match(/^([A-ZА-ЯЁ]+)(\d[A-ZА-ЯЁ0-9]*)$/);
    return foreign ? foreign[1] + ' ' + foreign[2] : compact;
  }
  fields.forEach(field => field.addEventListener('input', () => {
    const position = field.selectionStart;
    const before = field.value;
    const formatted = formatPassport(before);
    field.value = formatted;
    const shift = formatted.length - before.length;
    field.setSelectionRange(Math.max(0, position + shift), Math.max(0, position + shift));
  }));
}());
