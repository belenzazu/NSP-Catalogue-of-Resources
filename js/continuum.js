/*
 * Sección "PER in the DRM Continuum": diagrama con posiciones fijas (no es una lista). No filtra ni interactúa con la
 * lista de recursos.
 *
 * Todos los elementos con enlace ([data-continuum-link]) se emparejan con las filas de la hoja "PER Links"
 * (config.continuum), por su texto o por la clave que indique el atributo, y siguen la regla general de
 * js/lang-popup.js: popup con los idiomas que tengan enlace (con el título de la columna "Popup" si lo hay), enlace
 * directo si solo hay inglés. Solo se les añade comportamiento (cursor, icono, enlace): ni posición ni tamaño.
 * El propio elemento es el disparador (cursor pointer, icono de enlace por CSS), sin botón aparte.
 */
(function () {
  'use strict';

  const { config, data, schema, langPopup } = window.Catalogue;

  // Clases de posición del popup según dónde esté el elemento.
  function popoverPlacement(el) {
    // El contenedor de scroll horizontal recorta lo que se sale por abajo (ver .continuum__scroll):
    // la franja de Programmes (título y píldoras), al ir pegada al borde inferior, abre el popup hacia arriba.
    const openUpward = el.closest('.continuum__programmes');
    // NSD↔NSP está en el borde izquierdo: su popup se ancla por la izquierda para no salirse del diagrama.
    // Los títulos de PER Full Capacity y de Programmes son de texto corto pegado al margen izquierdo: igual.
    const anchorStart = el.matches('.continuum__nsd-tag, .continuum-block__title, .continuum__programmes-title');
    return [openUpward && 'lang-popover--up', anchorStart && 'lang-popover--start'].filter(Boolean);
  }

  // El propio elemento (una tarjeta, una píldora…) es el disparador de un popup.
  function makePopupTrigger(el, label, popover) {
    el.classList.add('lang-clickable');
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-haspopup', 'true');
    el.setAttribute('aria-expanded', 'false');
    el.setAttribute('aria-label', label + ' — show languages');
    popover.classList.add(...popoverPlacement(el));
    el.appendChild(popover);
  }

  /* ---------- Elementos enlazados con la hoja "PER Links" ---------- */

  // Sin distinguir mayúsculas, tildes ni espacios sobrantes ("Readiness check" = "Readiness Check").
  const textKey = (t) =>
    String(t || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();

  // Deja el elemento como estaba antes de enlazarlo (por si los datos se cargan de nuevo).
  function unlink(el) {
    el.querySelectorAll(':scope > .lang-popover').forEach((popover) => popover.remove());
    el.classList.remove('lang-clickable');
    ['role', 'tabindex', 'aria-haspopup', 'aria-expanded', 'aria-label', 'data-href'].forEach((attr) => el.removeAttribute(attr));
  }

  function openInNewTab(url) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function linkElement(el, item) {
    unlink(el);
    const text = el.textContent.trim();
    const shown = langPopup.resolve(item.links, item.link, item.popupTitle);

    if (shown.mode === 'popup') {
      makePopupTrigger(el, text, langPopup.buildPopover(item.title, shown.links, item.popupTitle));
    } else if (shown.mode === 'direct') {
      // Un solo enlace en inglés (o sin idioma): sin popup, el propio elemento abre el enlace en pestaña nueva.
      // No se envuelve su texto en un <a> para no tocar el maquetado; hace de enlace con role="link".
      el.classList.add('lang-clickable');
      el.setAttribute('role', 'link');
      el.setAttribute('tabindex', '0');
      el.setAttribute('aria-label', text + ' (opens in a new tab)');
      el.dataset.href = shown.url;
    }
  }

  function linkElements(rows) {
    const byText = new Map();
    schema.filterLinks(rows, config.continuum).forEach((item) => byText.set(textKey(item.title), item));
    document.querySelectorAll('[data-continuum-link]').forEach((el) => {
      // Solo el texto propio del elemento: si ya tiene un popup dentro (segunda carga), sus botones no cuentan.
      const ownText = [...el.childNodes].filter((n) => !(n.nodeType === 1 && n.classList.contains('lang-popover'))).map((n) => n.textContent).join('');
      const item = byText.get(textKey(el.dataset.continuumLink || ownText));
      if (item) linkElement(el, item);
      else unlink(el);
    });
  }

  function closeAll(except) {
    document.querySelectorAll('.lang-popover:not([hidden])').forEach((popover) => {
      if (popover === except) return;
      popover.hidden = true;
      const owner = popover.closest('.lang-clickable') || popover.previousElementSibling;
      owner?.setAttribute('aria-expanded', 'false');
    });
  }

  function toggle(owner, popover) {
    if (!popover) return;
    const wasOpen = !popover.hidden;
    closeAll(wasOpen ? null : popover);
    popover.hidden = wasOpen;
    owner.setAttribute('aria-expanded', String(!wasOpen));
  }

  function init() {
    // Los datos llegan cuando el Excel está leído; si no se puede leer, esos elementos se quedan sin enlace.
    data.load().then((model) => linkElements(model.links), () => {});
    document.addEventListener('catalogue:loaded', (event) => linkElements(event.detail.links));

    document.addEventListener('click', (event) => {
      if (event.target.closest('.lang-popover')) return;

      const clickable = event.target.closest('.lang-clickable');
      if (clickable) {
        if (clickable.dataset.href) openInNewTab(clickable.dataset.href);
        else toggle(clickable, clickable.querySelector('.lang-popover'));
        return;
      }

      closeAll();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeAll();
        return;
      }
      if ((event.key === 'Enter' || event.key === ' ') && event.target.classList.contains('lang-clickable')) {
        event.preventDefault();
        if (event.target.dataset.href) openInNewTab(event.target.dataset.href);
        else toggle(event.target, event.target.querySelector('.lang-popover'));
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
