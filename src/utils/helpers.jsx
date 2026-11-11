export const formatCurrency = (val) => {
  const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' });
  return formatter.format(val);
};

export const highlightText = (text, highlight) => {
  if (!highlight || !highlight.trim()) return text;
  const regex = new RegExp(`(${highlight})`, 'gi');
  const parts = String(text).split(regex);
  return parts.map((part, i) => 
    regex.test(part) ? <span key={i} style={{ color: 'var(--primary)', fontWeight: 'bold' }}>{part}</span> : part
  );
};

/**
 * Ajusta dinámicamente la altura de un textarea al escribir y lo devuelve a 1 línea al limpiarse.
 */
export const syncTextareaHeight = (el, value, baseHeight = 38, maxHeight = 100) => {
  if (!el) return;
  el.style.height = `${baseHeight}px`;
  if (value) {
    el.style.height = `${Math.min(Math.max(el.scrollHeight, baseHeight), maxHeight)}px`;
  }
};
