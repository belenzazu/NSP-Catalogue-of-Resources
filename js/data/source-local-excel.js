/*
 * Fuente de datos: Excel local (fase 1).
 *
 * Contrato de toda fuente: load() devuelve { headers, rows, perLinks }
 *   - headers: string[] con los nombres de columna
 *   - rows: [{ rowNumber, values: {columna: texto}, hrefs: {columna: url absoluta} }]
 *   - perLinks: { headers, rows } de la hoja "PER Links" (vacío si la hoja no existe)
 * Aquí no se interpreta el significado de las columnas (eso es js/data/schema.js) ni se toca el DOM.
 *
 * Opcional: loadFromFile(file) para cuando el navegador no deja leer el Excel por fetch (abrir con doble clic).
 */
(function () {
  const C = (window.Catalogue = window.Catalogue || {});
  C.sources = C.sources || {};

  // Lee una hoja y devuelve { headers, rows }. headerRow: nº de fila (desde 1) donde están los encabezados.
  function parseSheet(ws, headerRow) {
    const cfg = C.config.localExcel;
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    const headerIndex = headerRow - 1;

    const headers = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: headerIndex, c })];
      headers[c] = cell ? String(cell.v).trim() : '';
    }

    const rows = [];
    for (let r = headerIndex + 1; r <= range.e.r; r++) {
      const values = {};
      const hrefs = {};
      let hasContent = false;
      for (let c = range.s.c; c <= range.e.c; c++) {
        const header = headers[c];
        if (!header) continue;
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (!cell) continue;
        const text = String(cell.w ?? cell.v ?? '');
        if (text.trim()) hasContent = true;
        values[header] = text;
        if (cell.l && cell.l.Target) {
          try {
            hrefs[header] = new URL(cell.l.Target, cfg.hyperlinkBase).href;
          } catch (e) {
            /* hipervínculo ilegible: se ignora y se usa el texto de la celda */
          }
        }
      }
      if (hasContent) rows.push({ rowNumber: r + 1, values, hrefs });
    }

    return { headers: headers.filter(Boolean), rows };
  }

  // Devuelve la hoja del catálogo y, aparte, las hojas opcionales (ahora solo "PER Links").
  // Una hoja opcional que no existe o está vacía NO es un error: sale como { headers: [], rows: [] }.
  function parseWorkbook(buffer) {
    const cfg = C.config.localExcel;
    const links = cfg.perLinks;
    const wb = XLSX.read(buffer, { type: 'array', sheets: [cfg.sheetName, links.sheetName], sheetRows: cfg.maxRows });
    const ws = wb.Sheets[cfg.sheetName];
    if (!ws) throw new Error(`No se encontró la hoja "${cfg.sheetName}" en el Excel.`);

    const main = parseSheet(ws, cfg.headerRow);
    const linksSheet = wb.Sheets[links.sheetName];
    main.perLinks = linksSheet ? parseSheet(linksSheet, links.headerRow) : { headers: [], rows: [] };
    return main;
  }

  C.sources.localExcel = {
    async load() {
      let buffer;
      try {
        const response = await fetch(encodeURI(C.config.localExcel.path));
        if (!response.ok) throw new Error('HTTP ' + response.status);
        buffer = await response.arrayBuffer();
      } catch (cause) {
        const error = new Error('No se pudo leer el Excel desde el navegador.');
        error.code = 'SOURCE_UNREACHABLE';
        error.cause = cause;
        throw error;
      }
      return parseWorkbook(buffer);
    },

    async loadFromFile(file) {
      return parseWorkbook(await file.arrayBuffer());
    },
  };
})();
