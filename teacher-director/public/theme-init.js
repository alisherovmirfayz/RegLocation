// Применяем тему до отрисовки страницы, чтобы не было «вспышки» светлой темы.
try {
  var t = localStorage.getItem('rl-theme');
  if (t === 'dark' || (!t && matchMedia('(prefers-color-scheme: dark)').matches)) document.documentElement.classList.add('dark');
} catch (e) {}
