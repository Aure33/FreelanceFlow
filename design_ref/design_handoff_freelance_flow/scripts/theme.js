/* =========================================================================
   FREELANCE FLOW — Thème clair / sombre
   Chargé dans le <head> de chaque page de l'application pour appliquer la
   préférence AVANT le premier rendu (pas de flash). Persistance locale.
   ========================================================================= */
(function () {
  var KEY = 'ff-theme';

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
  }

  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { /* stockage indisponible */ }
  apply(saved === 'dark' ? 'dark' : 'light');

  window.ffTheme = {
    get: function () {
      return document.documentElement.getAttribute('data-theme') || 'light';
    },
    set: function (theme) {
      apply(theme);
      try { localStorage.setItem(KEY, theme === 'dark' ? 'dark' : 'light'); } catch (e) { /* ignore */ }
    },
    toggle: function () {
      this.set(this.get() === 'dark' ? 'light' : 'dark');
    }
  };
})();
