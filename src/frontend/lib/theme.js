// Tema claro / oscuro. La preferencia ('system' | 'light' | 'dark') vive en
// los ajustes del backend; aquí se resuelve y se aplica como
// <html data-theme="light|dark">. La última resolución se copia en
// localStorage para que el script del <head> la ponga antes de pintar.

const CACHE_KEY = 'tempo.theme';

let pref = 'system';
let systemDark = true;
let watching = false;

function paint() {
  const theme = pref === 'system' ? (systemDark ? 'dark' : 'light') : pref;
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(CACHE_KEY, theme); } catch {}
}

export async function applyTheme(next) {
  pref = next || 'system';
  if (!watching) {
    watching = true;
    try {
      const st = await tiny.theme.get();
      if (st) systemDark = !!st.dark;
    } catch {}
    tiny.theme.on((dark) => { systemDark = !!dark; paint(); });
  }
  paint();
}
