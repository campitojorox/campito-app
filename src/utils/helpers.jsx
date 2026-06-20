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
