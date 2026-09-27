/*
 * Sección "NSP Channels": rellena los boxes de listado ("NSP Audiovisuals", "PER Learning videos" y "NSP Articles") con la hoja
 * "PER Links" del Excel.
 * Los 5 boxes de enlaces son HTML estático (index.html). Solo lee de Catalogue.data (ver js/data/loader.js);
 * no sabe si los datos vienen de un Excel o de otro sitio.
 *
 * Los 5 boxes de enlaces de arriba (#channel-boxes) salen de las filas Type of Resource = Channel: nombre = columna
 * "Resources", subtítulo = columna "Popup", enlace directo (sin idiomas ni popup).
 *
 * Filas mostradas en cada box: Section y Type of Resource (uno o varios) iguales a los de su entrada en config.channels.
 * Cada fila sigue la regla general de los popups de idiomas (js/lang-popup.js): popup con los idiomas que tengan
 * enlace, enlace directo si solo hay inglés (o un enlace sin idioma), y solo el título si no hay ninguno.
 * Son las columnas "Link XX" del Excel, sean cuantas sean.
 */
(function () {
  'use strict';

  const { config, data, schema, langPopup } = window.Catalogue;
  // Un box por entrada: la lista (<ul>) donde se pinta y el filtro de config.channels que decide qué filas entran.
  const BOXES = [
    { list: document.getElementById('audiovisuals-list'), filter: config.channels.audiovisuals, empty: 'No audiovisual resources yet.' },
    { list: document.getElementById('learning-videos-list'), filter: config.channels.learningVideos, empty: 'No learning videos yet.' },
    { list: document.getElementById('articles-list'), filter: config.channels.articles, empty: 'No articles yet.' },
  ].filter((box) => box.list);
  if (!BOXES.length) return;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  // La decisión (popup / enlace directo / solo título) es la regla general de js/lang-popup.js.
  function renderItem(item) {
    const li = el('li', 'doc-item');
    const shown = langPopup.resolve(item.links, item.link, item.popupTitle);

    if (shown.mode === 'popup') {
      // Fila clicable = disparador del popup (mismo comportamiento que .lang-clickable en js/continuum.js).
      const popover = langPopup.buildPopover(item.title, shown.links, item.popupTitle);
      popover.classList.add('lang-popover--floating'); // ver "colocar el popup" más abajo
      li.classList.add('lang-clickable');
      li.setAttribute('role', 'button');
      li.tabIndex = 0;
      li.setAttribute('aria-haspopup', 'true');
      li.setAttribute('aria-expanded', 'false');
      li.setAttribute('aria-label', `${item.title} — show languages`);
      li.append(el('span', 'doc-item__text', item.title), popover);
    } else if (shown.mode === 'direct') {
      const a = langPopup.newTabLink('doc-item__link', shown.url, item.title);
      a.append(item.title);
      li.append(a);
    } else {
      li.append(el('span', 'doc-item__text', item.title));
    }
    return li;
  }

  function render(rows) {
    renderChannelBoxes(rows);
    BOXES.forEach(({ list, filter, empty }) => {
      const items = schema.filterLinks(rows, filter);
      list.replaceChildren(...(items.length ? items.map(renderItem) : [el('li', 'doc-card__empty', empty)]));
    });
  }

  /* ---------- Boxes de enlaces directos (IFRC Webpage, LinkedIn group…) ---------- */

  const boxesHost = document.getElementById('channel-boxes');

  function channelBox(item) {
    // Enlace directo: el primero que tenga la fila (siempre es uno; estos boxes no llevan idiomas).
    const url = (item.links[0] && item.links[0].url) || item.link;
    const box = url ? langPopup.newTabLink('channel-box', url, item.title) : el('div', 'channel-box');
    box.append(el('span', 'channel-box__title', item.title));
    if (item.popupTitle) box.append(el('span', 'channel-box__subtitle', item.popupTitle));
    return box;
  }

  function renderChannelBoxes(rows) {
    if (!boxesHost) return;
    const items = schema.filterLinks(rows, config.channels.channelLinks);
    // Sin filas de tipo Channel todavía, se dejan los boxes fijos del HTML.
    if (items.length) boxesHost.replaceChildren(...items.map(channelBox));
  }

  // Las listas hacen scroll, así que el popup (position: fixed) se coloca a mano bajo la fila que lo abre,
  // alineado a su derecha como el resto de popups; si abajo no cabe y arriba sí, se abre hacia arriba.
  const GAP = 6;
  function placePopover(row) {
    const popover = row.querySelector('.lang-popover');
    if (!popover || popover.hidden) return;
    const r = row.getBoundingClientRect();
    const w = popover.offsetWidth;
    const h = popover.offsetHeight;
    const below = r.bottom + GAP;
    const top = below + h > window.innerHeight && r.top - GAP - h > 0 ? r.top - GAP - h : below;
    popover.style.top = top + 'px';
    popover.style.left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)) + 'px';
  }

  // El clic / Enter / Espacio los abre js/continuum.js (manejadores de documento, que corren después de estos):
  // se espera al siguiente ciclo para medir el popup ya visible.
  const later = (row) => setTimeout(() => placePopover(row), 0);
  BOXES.forEach(({ list }) => {
    list.addEventListener('click', (event) => {
      const row = event.target.closest('.doc-item.lang-clickable');
      if (row && !event.target.closest('.lang-popover')) later(row);
    });
    list.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const row = event.target.closest('.doc-item.lang-clickable');
      if (row && event.target === row) later(row);
    });
  });

  // Con el popup fuera del flujo, al hacer scroll o cambiar el tamaño se quedaría flotando: se cierra.
  function closeFloating() {
    document.querySelectorAll('.lang-popover--floating:not([hidden])').forEach((popover) => {
      popover.hidden = true;
      popover.closest('.lang-clickable')?.setAttribute('aria-expanded', 'false');
    });
  }
  window.addEventListener('scroll', closeFloating, { passive: true, capture: true });
  window.addEventListener('resize', closeFloating);

  render([]);
  // Si el Excel no se puede leer (p. ej. no hay servidor), el box se queda en su estado vacío;
  // el catálogo de abajo ya avisa del problema.
  data.load().then((model) => render(model.links), () => {});
  // Excel elegido a mano después (Catalogue.data.loadFromFile).
  document.addEventListener('catalogue:loaded', (event) => render(event.detail.links));
})();
