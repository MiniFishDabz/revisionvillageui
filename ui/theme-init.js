(() => {
  try {
    const stored = localStorage.getItem('village-theme');
    const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.dataset.theme = stored || preferred;
    document.documentElement.style.colorScheme = document.documentElement.dataset.theme;
  } catch {
    document.documentElement.dataset.theme = 'dark';
    document.documentElement.style.colorScheme = 'dark';
  }
})();
