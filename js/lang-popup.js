/*
 * Regla general de los popups de idiomas (Catalogue.langPopup). Vale para TODAS las secciones que muestren un recurso
 * con enlaces en varios idiomas; cualquier sección nueva debe pasar por aquí en vez de decidirlo por su cuenta:
 *
 *   1. El popup muestra solo los idiomas que tienen enlace, sean 1, 3 o 10 (nunca una lista fija de 4).
 *   2. Si el recurso solo tiene enlace en inglés, no hay popup: la fila es directamente ese enlace.
 *   3. Todos los enlaces se abren en una pestaña nueva (target="_blank" rel="noopener noreferrer").
 *   4. Si la fila tiene texto en la columna "Popup" del Excel, ese texto es el título dentro del popup. Como el título
 *      solo tiene sentido en un popup, una fila con título siempre abre popup (aunque solo tenga inglés).
 *
 * Un recurso llega aquí como una lista de enlaces por idioma: [{ code, label, url }] (code = 'en', 'fr'…;
 * label = nombre de la columna del Excel cuando no es un idioma conocido). Ver js/data/schema.js → toLinks.
 * El abrir/cerrar del popup lo hace js/continuum.js (manejadores de documento sobre .lang-clickable).
 */
(function () {
  'use strict';

  const C = (window.Catalogue = window.Catalogue || {});

  // El idioma se muestra con su propio nombre ("Français", "العربية") sin necesidad de una lista fija.
  function languageName(code) {
    try {
      const name = new Intl.DisplayNames([code], { type: 'language' }).of(code);
      return name.charAt(0).toLocaleUpperCase(code) + name.slice(1);
    } catch (e) {
      return code.toUpperCase();
    }
  }

  const EXTERNAL_ICON =
    '<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true" focusable="false"><path d="M4.5 2H2v8h8V7.5M7 2h3v3M10 2L5.5 6.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // Regla 3: un único sitio decide cómo se abre un enlace.
  function newTabLink(className, href, label) {
    const a = document.createElement('a');
    if (className) a.className = className;
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.setAttribute('aria-label', `${label} (opens in a new tab)`);
    return a;
  }

  // Reglas 1, 2 y 4. → { mode: 'direct', url } | { mode: 'popup', links } | { mode: 'none' }
  //   links: enlaces por idioma (solo los que tienen URL). fallbackUrl: enlace sin idioma, si la fila no tiene ninguno.
  //   popupTitle: título del popup (columna "Popup"); si existe, la fila abre popup aunque solo tenga inglés.
  function resolve(links, fallbackUrl, popupTitle) {
    const withUrl = (links || []).filter((link) => link.url);
    if (!withUrl.length) return fallbackUrl ? { mode: 'direct', url: fallbackUrl } : { mode: 'none' };
    if (withUrl.length === 1 && withUrl[0].code === 'en' && !popupTitle) return { mode: 'direct', url: withUrl[0].url };
    return { mode: 'popup', links: withUrl };
  }

  // Popup con un botón por idioma con enlace, en el orden recibido. Clases del popup existente (continuum.css).
  // popupTitle (opcional): título que encabeza el popup.
  function buildPopover(title, links, popupTitle) {
    const popover = document.createElement('div');
    popover.className = 'lang-popover';
    popover.hidden = true;
    if (popupTitle) {
      const heading = document.createElement('p');
      heading.className = 'lang-popover__title';
      heading.textContent = popupTitle;
      popover.append(heading);
    }
    links.forEach(({ code, label, url }) => {
      const name = code ? languageName(code) : label;
      const a = newTabLink('link-button', url, `${title}, ${name}`);
      if (code) {
        a.lang = code;
        a.dir = 'auto';
      }
      a.append(name);
      a.insertAdjacentHTML('beforeend', EXTERNAL_ICON);
      popover.append(a);
    });
    return popover;
  }

  C.langPopup = { languageName, newTabLink, resolve, buildPopover };
})();
