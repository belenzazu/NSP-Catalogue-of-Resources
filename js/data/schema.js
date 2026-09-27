/*
 * Esquema: convierte las filas en bruto de cualquier fuente en el modelo que consume la interfaz.
 *
 * Modelo de recurso (lo único que la interfaz conoce):
 *   {
 *     id, titles: {es: '…', en: '…'}, links: {es: 'https://…'}, description,
 *     type, components: [], tags: [], sources: [], sourceLabel, year, status,
 *     resourceOrigin: 'external' | 'manual' | null   // origen del recurso
 *   }
 * Los idiomas no están fijados en el código: cada columna titulo_xx / link_xx añade uno.
 * Solo salen recursos validados (ver config.requireValidation).
 */
(function () {
  const C = (window.Catalogue = window.Catalogue || {});

  const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  // Clave de comparación: sin tildes, minúsculas, espacios colapsados.
  const norm = (s) =>
    clean(s)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  // Igual que norm, pero además "framework/ approach" y "framework/approach" cuentan como lo mismo.
  const looseKey = (s) => norm(s).replace(/\s*\/\s*/g, '/');

  // Solo http(s): los recursos los puede enviar cualquier persona por formulario,
  // así que nunca se acepta javascript:, data:, etc. como enlace.
  function safeUrl(value) {
    const text = clean(value);
    if (!/^https?:\/\//i.test(text)) return null;
    try {
      const url = new URL(text);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
    } catch (e) {
      return null;
    }
  }

  const FIELD_HEADERS = {
    title: ['resource name', 'titulo', 'title', 'nombre'],
    description: ['description', 'descripcion'],
    type: ['type', 'tipo'],
    status: ['status', 'estado'],
    year: ['publication year', 'year', 'ano', 'anio'],
    source: ['source', 'fuente'],
    tags: ['tags', 'etiquetas'],
    resourceOrigin: ['resource origin', 'origen del recurso', 'origen', 'origin'],
    validated: ['validated', 'validado'],
  };

  const YES = new Set(['si', 'yes', 'y', 's', 'true', '1', 'x', 'validado', 'validated']);
  const EXTERNAL = new Set(['external', 'externo', 'enlace externo', 'link', 'enlace']);
  const MANUAL = new Set(['manual', 'gestionado manualmente', 'gestion manual', 'managed manually']);

  function classifyColumns(headers) {
    const languageColumns = {};
    Object.keys(C.config.languageColumns).forEach((name) => {
      languageColumns[norm(name)] = C.config.languageColumns[name];
    });

    const cols = { titles: [], links: [], components: [], fields: {} };
    headers.forEach((header) => {
      const h = norm(header);
      let m;
      if ((m = h.match(/^(?:titulo|title)[_\s-]([a-z]{2,3})$/))) cols.titles.push({ header, lang: m[1] });
      else if ((m = h.match(/^(?:link|url|enlace)[_\s-]([a-z]{2,3})$/))) cols.links.push({ header, lang: m[1] });
      else if (languageColumns[h]) cols.links.push({ header, lang: languageColumns[h] });
      else if (/^(per )?component/.test(h)) cols.components.push(header);
      else {
        const field = Object.keys(FIELD_HEADERS).find((key) => FIELD_HEADERS[key].includes(h));
        if (field && !cols.fields[field]) cols.fields[field] = header;
      }
    });
    return cols;
  }

  function splitList(text, separator) {
    return clean(text) ? String(text).split(separator).map(clean).filter(Boolean) : [];
  }

  // Unifica variantes de mayúsculas/espacios ("5. Quality and Accountability" vs "…accountability")
  // quedándose con la más frecuente en todo el catálogo.
  function makeCanonicalizer(values) {
    const groups = new Map();
    values.forEach((value) => {
      const key = looseKey(value);
      if (!groups.has(key)) groups.set(key, new Map());
      const variants = groups.get(key);
      variants.set(value, (variants.get(value) || 0) + 1);
    });
    const best = new Map();
    groups.forEach((variants, key) => {
      best.set(key, [...variants.entries()].sort((a, b) => b[1] - a[1])[0][0]);
    });
    return (value) => best.get(looseKey(value)) || value;
  }

  function toResources(raw) {
    const cfg = C.config;
    const cols = classifyColumns(raw.headers);
    const hasValidationColumn = Boolean(cols.fields.validated);

    if (!cols.fields.title && !cols.titles.length) {
      console.warn('[Catalogue] No se encontró ninguna columna de título.');
    }
    if (cfg.requireValidation && !hasValidationColumn) {
      console.warn(
        cfg.assumeValidatedIfColumnMissing
          ? '[Catalogue] La fuente no tiene columna "Validado": se muestran todos los recursos.'
          : '[Catalogue] La fuente no tiene columna "Validado": no se muestra ningún recurso.'
      );
    }

    const typeAliases = {};
    Object.keys(cfg.valueAliases.type || {}).forEach((k) => (typeAliases[norm(k)] = cfg.valueAliases.type[k]));

    const languages = [];
    const addLanguage = (code) => languages.includes(code) || languages.push(code);
    let skipped = 0;
    let hiddenByValidation = 0;

    const items = [];
    raw.rows.forEach((row) => {
      const v = row.values;
      const field = (key) => (cols.fields[key] ? v[cols.fields[key]] : '');

      const titles = {};
      cols.titles.forEach(({ header, lang }) => {
        const t = clean(v[header]);
        if (t) titles[lang] = t;
      });
      const genericTitle = clean(field('title'));
      if (genericTitle && !titles[cfg.defaultTitleLang]) titles[cfg.defaultTitleLang] = genericTitle;

      const links = {};
      cols.links.forEach(({ header, lang }) => {
        // Si el texto de la celda es un nombre de archivo, el enlace real es el hipervínculo de la celda.
        const url = safeUrl(v[header]) || safeUrl(row.hrefs && row.hrefs[header]);
        if (url) links[lang] = url;
      });

      if (!Object.keys(titles).length) {
        skipped++;
        return;
      }

      let validated = true;
      if (cfg.requireValidation) {
        validated = hasValidationColumn ? YES.has(norm(field('validated'))) : cfg.assumeValidatedIfColumnMissing;
      }
      if (!validated) {
        hiddenByValidation++;
        return;
      }

      Object.keys(titles).concat(Object.keys(links)).forEach(addLanguage);

      const originText = norm(field('resourceOrigin'));
      const yearMatch = clean(field('year')).match(/\b(1[89]\d\d|20\d\d)\b/);
      const type = clean(field('type'));

      items.push({
        id: 'row-' + row.rowNumber,
        titles,
        links,
        description: clean(field('description')),
        type: typeAliases[norm(type)] || type,
        components: cols.components.flatMap((h) => splitList(v[h], /[;\n]/)),
        tags: splitList(field('tags'), /[,;]/),
        sourceLabel: clean(field('source')),
        // "IFRC - ICRC", "IFRC-OCHA"… → ['IFRC', 'ICRC']
        sources: splitList(field('source'), /\s*-\s*/),
        year: yearMatch ? Number(yearMatch[1]) : null,
        status: clean(field('status')),
        // Sin columna de origen del recurso no se inventa: queda en null.
        resourceOrigin: EXTERNAL.has(originText) ? 'external' : MANUAL.has(originText) ? 'manual' : null,
      });
    });

    const canon = {
      type: makeCanonicalizer(items.map((r) => r.type).filter(Boolean)),
      components: makeCanonicalizer(items.flatMap((r) => r.components)),
      tags: makeCanonicalizer(items.flatMap((r) => r.tags)),
      sources: makeCanonicalizer(items.flatMap((r) => r.sources)),
    };
    const unique = (list) => [...new Set(list)];
    items.forEach((r) => {
      r.type = r.type ? canon.type(r.type) : '';
      r.components = unique(r.components.map(canon.components));
      r.tags = unique(r.tags.map(canon.tags));
      r.sources = unique(r.sources.map(canon.sources));
    });

    if (skipped || hiddenByValidation) {
      console.info(`[Catalogue] Filas sin título omitidas: ${skipped}. Sin validar: ${hiddenByValidation}.`);
    }
    return { resources: items, languages };
  }

  /* ---------- Hoja "PER Links" ----------
   * Modelo de fila (las mismas filas del Excel, ya normalizadas; el filtrado por sección/tipo lo hace quien las usa):
   *   { id, section, type, title, popupTitle, year, links: [{ code, label, url }], link }
   *   - popupTitle: texto de la columna "Popup" (vacío si no hay): es el título que va dentro del popup de idiomas.
   *   - links: un enlace por cada columna "Link XX" con contenido, en el orden de las columnas. code = código de idioma
   *     ('en', 'es'…) o null si el nombre de la columna no es un idioma conocido (entonces se usa label).
   *   - link: enlace genérico de la fila ("Resource Link"), para las filas sin columnas de idioma.
   */
  const ISO_639_1 =
    'aa ab ae af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca ce ch co cr cs cu cv cy da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu'.split(' ');

  let languageByEnglishName;
  // "Portuguese" → 'pt', "Spanish" → 'es'… sin listas a mano: se pregunta al navegador el nombre en inglés de cada código.
  function englishNameToCode(name) {
    if (!languageByEnglishName) {
      languageByEnglishName = new Map();
      try {
        const names = new Intl.DisplayNames(['en'], { type: 'language' });
        ISO_639_1.forEach((code) => languageByEnglishName.set(norm(names.of(code)), code));
      } catch (e) {
        /* sin Intl.DisplayNames: solo se reconocen códigos y alias */
      }
    }
    return languageByEnglishName.get(norm(name)) || null;
  }

  // Texto tras "Link " → código de idioma ('EN' → 'en', 'SP' → 'es' por alias, 'Portuguese' → 'pt') o null.
  function languageCodeFor(suffix) {
    const key = norm(suffix);
    const aliases = C.config.languageAliases || {};
    if (aliases[key]) return aliases[key];
    if (/^[a-z]{2,3}$/.test(key)) return key;
    return englishNameToCode(key);
  }

  function toLinks(raw) {
    if (!raw || !raw.rows || !raw.rows.length) return [];
    const headers = raw.headers;
    const byNorm = (name) => headers.filter((h) => norm(h) === name);
    // "Type of Resource" aparece dos veces con distinta mayúscula (tipo de recurso y Interno/Externo): manda la que
    // está escrita exactamente así y, si no, la primera por la izquierda.
    const typeHeader = byNorm('type of resource').find((h) => clean(h) === 'Type of Resource') || byNorm('type of resource')[0];
    const sectionHeader = byNorm('section')[0];
    const popupHeader = byNorm('popup')[0];
    const titleHeader = ['resources', 'resource name', 'title', 'titulo'].map(byNorm).find((l) => l.length)?.[0];
    const yearHeader = ['publication year', 'year'].map(byNorm).find((l) => l.length)?.[0];
    const genericHeaders = headers.filter((h) => ['resource link', 'link'].includes(norm(h)));

    // Columnas de idioma: "Link EN", "Link Bahasa"… (no "Resource Link" ni "Image link": esas no empiezan por "Link ").
    const languageColumns = [];
    const seen = new Set();
    headers.forEach((header) => {
      const m = clean(header).match(/^link[\s_-]+(.+)$/i);
      if (!m) return;
      const code = languageCodeFor(m[1]);
      const key = code || norm(m[1]);
      if (seen.has(key)) return; // dos columnas para el mismo idioma: gana la primera
      seen.add(key);
      languageColumns.push({ header, code, label: clean(m[1]) });
    });

    const items = [];
    raw.rows.forEach((row) => {
      const v = row.values;
      const title = clean(v[titleHeader]);
      if (!title) return;
      const urlOf = (header) => safeUrl(v[header]) || safeUrl(row.hrefs && row.hrefs[header]);

      const links = [];
      languageColumns.forEach(({ header, code, label }) => {
        const url = urlOf(header);
        if (url) links.push({ code, label, url });
      });
      const generic = genericHeaders.map(urlOf).find(Boolean) || null;

      const yearMatch = clean(v[yearHeader]).match(/\b(1[89]\d\d|20\d\d)\b/);
      items.push({
        id: 'link-' + row.rowNumber,
        section: clean(v[sectionHeader]),
        type: clean(v[typeHeader]),
        title,
        popupTitle: clean(v[popupHeader]),
        year: yearMatch ? Number(yearMatch[1]) : null,
        links,
        link: generic,
      });
    });
    return items;
  }

  // Filtra filas de "PER Links" por Section y/o Type of Resource (cada uno: texto o lista de textos; si falta, no filtra).
  // Sin distinguir mayúsculas, tildes ni singular/plural ("Video" = "videos"). Orden de la hoja conservado.
  const looseText = (s) => norm(s).replace(/\s+/g, ' ').replace(/s$/, '');
  function filterLinks(rows, { section, typeOfResource } = {}) {
    const matches = (value, wanted) => wanted == null || [].concat(wanted).some((w) => looseText(w) === looseText(value));
    return rows.filter((row) => matches(row.section, section) && matches(row.type, typeOfResource));
  }

  C.schema = { toResources, toLinks, filterLinks };
})();
