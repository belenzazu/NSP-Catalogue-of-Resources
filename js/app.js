/*
 * Interfaz del catálogo: filtros, buscador, lista y paginación.
 * Solo lee recursos de Catalogue.data (ver js/data/schema.js para el modelo);
 * no sabe si vienen de un Excel, de Google Sheets o de otro sitio.
 */
(function () {
  'use strict';

  const { config, data, langPopup } = window.Catalogue;
  // El idioma se muestra con su propio nombre ("Français", "العربية"); compartido con los popups (js/lang-popup.js).
  // Va arriba porque FILTERS lo usa al definirse.
  const languageName = langPopup.languageName;

  const STRINGS = {
    loading: 'Loading resources…',
    loadError: 'The resources could not be loaded.',
    loadErrorFile:
      'The browser blocked reading the Excel file directly. Choose it manually, or open this page through a local server (node serve.js).',
    pickFile: 'Choose the Excel file',
    noResults: 'No resources match your search.',
    noLink: 'Link not available yet',
    clearFilters: 'Clear filters',
  };

  // Un desplegable por entrada. `values` devuelve los valores de un recurso para ese filtro.
  const FILTERS = [
    { key: 'component', label: 'PER component', all: 'All components', values: (r) => r.components },
    { key: 'type', label: 'Type', all: 'All types', values: (r) => (r.type ? [r.type] : []) },
    { key: 'tag', label: 'Tags', all: 'All tags', values: (r) => r.tags },
    { key: 'source', label: 'Source', all: 'All sources', values: (r) => r.sources },
    { key: 'year', label: 'Year', all: 'All years', values: (r) => (r.year ? [String(r.year)] : []), order: 'desc' },
    {
      key: 'language',
      label: 'Available in',
      all: 'All languages',
      values: (r) => Object.keys(r.links),
      order: 'as-found',
      display: languageName,
    },
  ];

  const els = {
    grid: document.getElementById('filter-grid'),
    search: document.getElementById('search-input'),
    clear: document.getElementById('clear-filters'),
    results: document.getElementById('results'),
    summary: document.getElementById('results-summary'),
    body: document.getElementById('results-body'),
    pagination: document.getElementById('pagination'),
  };

  const state = {
    resources: [],
    filtered: [],
    page: 1,
    query: '',
    filters: {}, // clave del filtro → valores marcados (varios posibles)
  };

  const searchIndex = new Map();

  /* ---------- utilidades ---------- */

  function h(tag, attrs, ...children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([name, value]) => {
      if (value === false || value == null) return;
      node.setAttribute(name, value === true ? '' : value);
    });
    children.flat().forEach((child) => {
      if (child === false || child == null || child === '') return;
      node.append(child instanceof Node ? child : document.createTextNode(child));
    });
    return node;
  }

  function icon(markup) {
    const holder = document.createElement('span');
    holder.innerHTML = markup; // markup fijo del propio código, nunca datos
    return holder.firstElementChild;
  }

  const EXTERNAL_ICON =
    '<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true" focusable="false"><path d="M4.5 2H2v8h8V7.5M7 2h3v3M10 2L5.5 6.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const normalize = (s) =>
    String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();


  // Aquí irá la lógica de idioma de respaldo cuando se implemente el multiidioma.
  function displayTitle(resource) {
    return resource.titles[config.defaultTitleLang] || Object.values(resource.titles)[0];
  }

  /* ---------- filtros ---------- */

  // Cada filtro es un desplegable de casillas: se pueden marcar varios valores de la misma lista.
  // Dentro de un filtro los valores suman (O); entre filtros distintos se combinan (Y).
  function buildFilterControls() {
    FILTERS.forEach((filter) => {
      const id = 'filter-' + filter.key;
      state.filters[filter.key] = [];

      filter.text = h('span', { class: 'multi__text' }, filter.all);
      filter.trigger = h(
        'button',
        { class: 'multi__trigger', id, type: 'button', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-controls': id + '-panel', disabled: true },
        filter.text
      );
      filter.panel = h('div', { class: 'multi__panel', id: id + '-panel', role: 'group', 'aria-label': filter.label, hidden: true });
      filter.boxes = [];
      filter.root = h('div', { class: 'multi' }, filter.trigger, filter.panel);

      filter.trigger.addEventListener('click', () => setPanelOpen(filter, filter.panel.hidden));
      filter.root.addEventListener('focusout', (event) => {
        if (event.relatedTarget && !filter.root.contains(event.relatedTarget)) setPanelOpen(filter, false);
      });
      filter.root.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || filter.panel.hidden) return;
        setPanelOpen(filter, false);
        filter.trigger.focus();
      });

      els.grid.append(h('div', { class: 'field' }, h('label', { class: 'field__label', for: id }, filter.label), filter.root));
    });

    document.addEventListener('click', (event) => {
      FILTERS.forEach((filter) => {
        if (!filter.root.contains(event.target)) setPanelOpen(filter, false);
      });
    });
  }

  function setPanelOpen(filter, open) {
    filter.panel.hidden = !open;
    filter.trigger.setAttribute('aria-expanded', String(open));
    // Un solo desplegable abierto a la vez.
    if (open) FILTERS.forEach((other) => other !== filter && setPanelOpen(other, false));
  }

  function refreshTriggerText(filter) {
    const chosen = state.filters[filter.key];
    const show = (v) => (filter.display ? filter.display(v) : v);
    filter.text.textContent = chosen.length === 0 ? filter.all : chosen.length === 1 ? show(chosen[0]) : `${chosen.length} selected`;
  }

  function fillFilterOptions() {
    FILTERS.forEach((filter) => {
      const found = [];
      state.resources.forEach((r) => filter.values(r).forEach((v) => found.includes(v) || found.push(v)));
      if (filter.order === 'desc') found.sort((a, b) => b - a);
      else if (filter.order !== 'as-found') found.sort((a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }));

      found.forEach((value) => {
        const box = h('input', { type: 'checkbox', value });
        box.addEventListener('change', () => {
          const chosen = state.filters[filter.key];
          state.filters[filter.key] = box.checked ? [...chosen, value] : chosen.filter((v) => v !== value);
          refreshTriggerText(filter);
          state.page = 1;
          update();
        });
        filter.boxes.push(box);
        filter.panel.append(h('label', { class: 'multi__option' }, box, h('span', null, filter.display ? filter.display(value) : value)));
      });
      filter.trigger.disabled = found.length === 0;
    });
  }

  function matches(resource) {
    for (const filter of FILTERS) {
      const wanted = state.filters[filter.key];
      if (wanted.length && !filter.values(resource).some((v) => wanted.includes(v))) return false;
    }
    if (state.query) {
      const text = searchIndex.get(resource.id);
      if (!state.query.split(' ').every((term) => text.includes(term))) return false;
    }
    return true;
  }

  function hasActiveFilters() {
    return Boolean(state.query) || FILTERS.some((f) => state.filters[f.key].length);
  }

  function clearFilters() {
    FILTERS.forEach((f) => {
      state.filters[f.key] = [];
      f.boxes.forEach((box) => (box.checked = false));
      refreshTriggerText(f);
    });
    els.search.value = '';
    state.query = '';
    state.page = 1;
    update();
  }

  /* ---------- pintado ---------- */

  function renderCard(resource) {
    const langs = Object.entries(resource.links);
    const title = displayTitle(resource);

    const meta = [resource.sourceLabel, resource.year].filter(Boolean).join(' · ');

    return h(
      'li',
      { class: 'resource-card' },
      h(
        'div',
        { class: 'resource-card__head' },
        h('h3', { class: 'resource-card__title' }, title),
        resource.type && h('span', { class: 'pill' }, resource.type)
      ),
      resource.description && h('p', { class: 'resource-card__description' }, resource.description),
      meta && h('p', { class: 'resource-card__meta' }, meta),
      h(
        'div',
        { class: 'resource-card__links' },
        langs.length
          ? langs.map(([code, url]) => {
              const name = languageName(code);
              return h(
                'a',
                {
                  class: 'link-button',
                  href: url,
                  target: '_blank',
                  rel: 'noopener noreferrer',
                  lang: code,
                  dir: 'auto',
                  'aria-label': `${name}: ${title} (opens in a new tab)`,
                },
                name,
                icon(EXTERNAL_ICON)
              );
            })
          : h('span', { class: 'resource-card__no-link' }, STRINGS.noLink)
      )
    );
  }

  function renderSummary(from, to) {
    const total = state.filtered.length;
    const noun = total === 1 ? 'resource' : 'resources';
    els.summary.textContent = total === 0 ? '' : total <= config.pageSize ? `${total} ${noun}` : `Showing ${from}–${to} of ${total} ${noun}`;
  }

  function renderList() {
    const size = config.pageSize;
    const total = state.filtered.length;
    const from = (state.page - 1) * size;
    const pageItems = state.filtered.slice(from, from + size);

    if (!total) {
      els.body.replaceChildren(
        h(
          'div',
          { class: 'message' },
          h('p', null, STRINGS.noResults),
          hasActiveFilters() && h('button', { class: 'link-button', type: 'button', 'data-action': 'clear' }, STRINGS.clearFilters)
        )
      );
    } else {
      els.body.replaceChildren(h('ul', { class: 'resource-list' }, pageItems.map(renderCard)));
    }
    renderSummary(from + 1, from + pageItems.length);
  }

  const CHEVRON_LEFT =
    '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false"><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const CHEVRON_RIGHT =
    '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // Algoritmo estándar de paginación (el mismo patrón que MUI/Ant Design):
  // siempre primera y última página, un par de vecinas de la actual, y "…" donde haya hueco.
  function paginationRange(current, total, siblingCount = 1, boundaryCount = 1) {
    if (total <= boundaryCount * 2 + siblingCount * 2 + 3) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    const siblingsStart = Math.max(
      Math.min(current - siblingCount, total - boundaryCount - siblingCount * 2 - 1),
      boundaryCount + 2
    );
    const siblingsEnd = Math.min(
      Math.max(current + siblingCount, boundaryCount + siblingCount * 2 + 2),
      total - boundaryCount - 1
    );

    const range = [];
    for (let p = 1; p <= boundaryCount; p++) range.push(p);
    // Dos marcadores distintos: dos huecos pueden coexistir, no son la misma elipsis.
    range.push(siblingsStart > boundaryCount + 2 ? 'ellipsis-start' : boundaryCount + 1);
    for (let p = siblingsStart; p <= siblingsEnd; p++) range.push(p);
    range.push(siblingsEnd < total - boundaryCount - 1 ? 'ellipsis-end' : total - boundaryCount);
    for (let p = total - boundaryCount + 1; p <= total; p++) range.push(p);

    return range;
  }

  function renderPagination(focusCurrent) {
    const pages = Math.ceil(state.filtered.length / config.pageSize);
    els.pagination.hidden = pages <= 1;
    if (pages <= 1) {
      els.pagination.replaceChildren();
      return;
    }

    const items = paginationRange(state.page, pages).map((entry, i) =>
      typeof entry === 'string'
        ? h('li', { class: 'page-ellipsis', key: entry + i, 'aria-hidden': 'true' }, '…')
        : h(
            'li',
            null,
            h(
              'button',
              {
                class: 'page-number',
                type: 'button',
                'data-page': entry,
                'aria-label': `Page ${entry}`,
                'aria-current': entry === state.page ? 'page' : false,
              },
              String(entry)
            )
          )
    );

    const navButton = (dir, label, iconMarkup, disabled) => {
      const btn = h('button', {
        class: 'page-nav',
        type: 'button',
        'data-nav': dir,
        'aria-label': label,
        disabled,
      });
      btn.append(icon(iconMarkup));
      return btn;
    };

    els.pagination.replaceChildren(
      navButton('prev', 'Previous page', CHEVRON_LEFT, state.page === 1),
      h('ol', { class: 'pagination__list' }, items),
      navButton('next', 'Next page', CHEVRON_RIGHT, state.page === pages)
    );
    if (focusCurrent) els.pagination.querySelector('[aria-current="page"]').focus();
  }

  function goToPage(page, { focusCurrent = false } = {}) {
    const pages = Math.ceil(state.filtered.length / config.pageSize);
    state.page = Math.min(Math.max(1, page), pages);
    renderList();
    renderPagination(focusCurrent);

    if (els.results.getBoundingClientRect().top < 0) {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      els.results.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
    }
  }

  function update() {
    state.filtered = state.resources.filter(matches);
    els.clear.hidden = !hasActiveFilters();
    renderList();
    renderPagination(false);
  }

  /* ---------- eventos ---------- */

  els.clear.addEventListener('click', clearFilters);

  els.body.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="clear"]')) clearFilters();
  });

  let searchTimer;
  els.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = normalize(els.search.value).replace(/\s+/g, ' ').trim();
      state.page = 1;
      update();
    }, 150);
  });

  els.pagination.addEventListener('click', (event) => {
    const pageButton = event.target.closest('[data-page]');
    if (pageButton) {
      goToPage(Number(pageButton.dataset.page), { focusCurrent: true });
      return;
    }
    const navButton = event.target.closest('[data-nav]');
    if (navButton && !navButton.disabled) {
      goToPage(state.page + (navButton.dataset.nav === 'prev' ? -1 : 1), { focusCurrent: true });
    }
  });

  els.pagination.addEventListener('keydown', (event) => {
    const pages = Math.ceil(state.filtered.length / config.pageSize);
    const target = { ArrowLeft: state.page - 1, ArrowRight: state.page + 1, Home: 1, End: pages }[event.key];
    if (target == null) return;
    event.preventDefault();
    goToPage(target, { focusCurrent: true });
  });

  /* ---------- arranque ---------- */

  function showMessage(...children) {
    els.body.replaceChildren(h('div', { class: 'message' }, children));
    els.summary.textContent = '';
    els.pagination.hidden = true;
  }

  function start({ resources }) {
    // Orden por defecto: más nuevo primero. Sin año conocido, al final.
    state.resources = resources.slice().sort((a, b) => (b.year ?? -Infinity) - (a.year ?? -Infinity));
    state.resources.forEach((r) => {
      const parts = [
        ...Object.values(r.titles),
        r.description,
        r.type,
        r.sourceLabel,
        r.year,
        ...r.components,
        ...r.tags,
      ];
      searchIndex.set(r.id, normalize(parts.filter(Boolean).join(' ')));
    });
    fillFilterOptions();
    els.search.disabled = false;
    update();
  }

  function showLoadError(error) {
    console.error('[Catalogue]', error);
    const blocked = error.code === 'SOURCE_UNREACHABLE' && data.canLoadFromFile();
    if (!blocked) {
      showMessage(h('p', null, STRINGS.loadError));
      return;
    }
    const input = h('input', { type: 'file', accept: '.xlsx', hidden: true });
    input.addEventListener('change', async () => {
      if (!input.files[0]) return;
      showMessage(h('p', null, STRINGS.loading));
      try {
        start(await data.loadFromFile(input.files[0]));
      } catch (e) {
        showLoadError(e);
      }
    });
    const button = h('button', { class: 'link-button', type: 'button' }, STRINGS.pickFile);
    button.addEventListener('click', () => input.click());
    showMessage(h('p', null, STRINGS.loadErrorFile), button, input);
  }

  buildFilterControls();
  showMessage(h('p', null, STRINGS.loading));
  data.load().then(start, showLoadError);
})();
