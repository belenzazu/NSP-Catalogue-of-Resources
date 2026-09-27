/*
 * Sección "NSP Reference materials": bloque desplegable, independiente del catálogo y del continuum.
 * El botón de la cabecera (título + marquita) abre y cierra el contenido extra; el resto de la sección
 * (título e introducción) siempre se ve. Los boxes de dentro abren el popup de idiomas de js/continuum.js.
 *
 * Boxes blancos de arriba: filas con Section = NSP Reference Materials y Type of Resource = Core document
 * (config.reference.documents); texto = columna "Resources".
 *
 * Fila "PER Reference packs": sale de la hoja "PER Links" del Excel (filas con Type of Resource = Folder, ver
 * config.reference.packs); el botón del curso, de la fila Section = NSP Reference Materials + Type = Course
 * (config.reference.course). El nombre es la columna "Resources" y los enlaces las columnas "Link XX", así que si se
 * renombra o se añade un pack en el Excel cambia aquí sola. Cada uno sigue la regla general de los popups de idiomas
 * (js/lang-popup.js): solo los idiomas con enlace, enlace directo si solo hay inglés, pestaña nueva.
 */
(function () {
  'use strict';

  // Lo que tarda la animación de altura (ver .reference__panel en catalogue.css) más un pequeño margen.
  const OPEN_ANIMATION_MS = 300;

  const { config, data, schema, langPopup } = window.Catalogue;

  /* ---------- Boxes blancos (Core document) ---------- */

  const boxesHost = document.getElementById('reference-boxes');

  // Cada box sigue la regla general de popups (js/lang-popup.js): popup con los idiomas que tengan enlace, enlace
  // directo si solo hay inglés o un enlace sin idioma, y box sin enlace (solo texto) si la fila todavía no tiene ninguno.
  function boxElement(item) {
    const shown = langPopup.resolve(item.links, item.link, item.popupTitle);
    if (shown.mode === 'direct') {
      const a = langPopup.newTabLink('reference-box', shown.url, item.title);
      a.append(item.title);
      return a;
    }
    const box = document.createElement('div');
    box.className = 'reference-box';
    box.textContent = item.title;
    if (shown.mode === 'popup') {
      box.classList.add('lang-clickable');
      box.setAttribute('role', 'button');
      box.tabIndex = 0;
      box.setAttribute('aria-haspopup', 'true');
      box.setAttribute('aria-expanded', 'false');
      box.setAttribute('aria-label', `${item.title} — show languages`);
      box.append(langPopup.buildPopover(item.title, shown.links, item.popupTitle));
    }
    return box;
  }

  function renderBoxes(rows) {
    if (!boxesHost) return;
    boxesHost.replaceChildren(...schema.filterLinks(rows, config.reference.documents).map(boxElement));
  }

  /* ---------- Fila "PER Reference packs" ---------- */

  const packsRow = document.querySelector('.reference__links');
  const coursesHost = document.getElementById('reference-courses'); // los packs van antes del botón del curso
  const packsAnchor = coursesHost;

  const PLAY_ICON =
    '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 8.2v7.6l6-3.8-6-3.8z" fill="currentColor"/></svg>';

  // Botón del curso ("algo que haces"). Mismo diseño que el botón "languages"; sigue la regla general de popups:
  // enlace directo (solo inglés o sin idioma) o botón que abre el popup con los idiomas que tengan enlace.
  function courseElement(item) {
    const shown = langPopup.resolve(item.links, item.link, item.popupTitle);
    let node;
    if (shown.mode === 'direct') {
      node = langPopup.newTabLink('reference-course', shown.url, item.title);
    } else {
      node = document.createElement('span');
      node.className = 'reference-course';
      if (shown.mode === 'popup') {
        node.classList.add('lang-clickable');
        node.setAttribute('role', 'button');
        node.tabIndex = 0;
        node.setAttribute('aria-haspopup', 'true');
        node.setAttribute('aria-expanded', 'false');
        node.setAttribute('aria-label', `${item.title} — show languages`);
      }
    }
    node.insertAdjacentHTML('afterbegin', PLAY_ICON);
    node.append(item.title);
    if (shown.mode === 'popup') node.append(langPopup.buildPopover(item.title, shown.links, item.popupTitle));
    return node;
  }

  function renderCourses(rows) {
    if (!coursesHost) return;
    coursesHost.replaceChildren(...schema.filterLinks(rows, config.reference.course).map(courseElement));
  }

  function packElement(item) {
    const shown = langPopup.resolve(item.links, item.link, item.popupTitle);

    if (shown.mode === 'direct') {
      const a = langPopup.newTabLink('reference-link', shown.url, item.title);
      a.append(item.title);
      return a;
    }
    const span = document.createElement('span');
    span.className = 'reference-link';
    span.textContent = item.title;
    if (shown.mode === 'popup') {
      // Igual que el resto de elementos clicables: el propio elemento abre el popup (js/continuum.js).
      const popover = langPopup.buildPopover(item.title, shown.links, item.popupTitle);
      popover.classList.add('lang-popover--start'); // estrecho y pegado al margen izquierdo: se ancla por la izquierda
      span.classList.add('lang-clickable');
      span.setAttribute('role', 'button');
      span.tabIndex = 0;
      span.setAttribute('aria-haspopup', 'true');
      span.setAttribute('aria-expanded', 'false');
      span.setAttribute('aria-label', `${item.title} — show languages`);
      span.append(popover);
    }
    return span;
  }

  function renderPacks(rows) {
    renderBoxes(rows);
    if (!packsRow) return;
    renderCourses(rows);
    packsRow.querySelectorAll('[data-generated]').forEach((node) => node.remove());
    schema.filterLinks(rows, config.reference.packs).forEach((item) => {
      const node = packElement(item);
      node.dataset.generated = '';
      packsRow.insertBefore(node, packsAnchor);
    });
  }

  // Si el Excel no se puede leer (p. ej. no hay servidor) la fila queda vacía;
  // el catálogo de abajo ya avisa del problema.
  data.load().then((model) => renderPacks(model.links), () => {});
  // Excel elegido a mano después (Catalogue.data.loadFromFile).
  document.addEventListener('catalogue:loaded', (event) => renderPacks(event.detail.links));

  /* ---------- Desplegable ---------- */

  document.querySelectorAll('[data-collapsible]').forEach((section) => {
    const button = section.querySelector('[data-collapsible-toggle]');
    const panel = section.querySelector('[data-collapsible-panel]');
    if (!button || !panel) return;

    let settleTimer;

    function setOpen(open) {
      button.setAttribute('aria-expanded', String(open));
      section.classList.toggle('is-open', open);
      // inert: el contenido plegado no debe recibir foco ni lo leen los lectores de pantalla.
      panel.inert = !open;

      // Mientras se anima, el contenido va recortado; ya abierto del todo se libera (.is-settled) para que los
      // popups de los boxes no queden cortados por el borde del panel. Al cerrar se vuelve a recortar al instante.
      clearTimeout(settleTimer);
      if (open) {
        settleTimer = setTimeout(() => section.classList.add('is-settled'), OPEN_ANIMATION_MS);
      } else {
        section.classList.remove('is-settled');
        // Un popup abierto no debe quedarse colgado al plegar la sección.
        panel.querySelectorAll('.lang-popover:not([hidden])').forEach((popover) => {
          popover.hidden = true;
          popover.closest('.lang-clickable')?.setAttribute('aria-expanded', 'false');
        });
      }
    }

    setOpen(false);
    button.addEventListener('click', () => setOpen(button.getAttribute('aria-expanded') !== 'true'));
  });
})();
