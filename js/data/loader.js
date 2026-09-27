/*
 * Única puerta de entrada de datos para la interfaz: Catalogue.data.
 * Para cambiar de fuente basta con cambiar config.source; la interfaz no se entera.
 */
(function () {
  const C = (window.Catalogue = window.Catalogue || {});

  const activeSource = () => {
    const source = C.sources[C.config.source];
    if (!source) throw new Error(`Fuente de datos desconocida: "${C.config.source}"`);
    return source;
  };

  const toModel = (raw) => ({
    ...C.schema.toResources(raw),
    links: C.schema.toLinks(raw.perLinks),
  });

  // La lectura es una sola: el catálogo y otras secciones (NSP Channels) comparten la misma promesa.
  let cached;

  // Cada carga correcta se anuncia en el documento para quien no la haya pedido él (p. ej. cuando el Excel
  // se elige a mano con loadFromFile y las secciones que ya estaban esperando deben pintarse).
  const announce = (model) => document.dispatchEvent(new CustomEvent('catalogue:loaded', { detail: model }));

  C.data = {
    // → { resources, languages, links }   (links = filas de la hoja "PER Links", sin filtrar)
    load() {
      if (!cached) {
        cached = activeSource()
          .load()
          .then(toModel)
          .then(
            (model) => {
              announce(model);
              return model;
            },
            (error) => {
              cached = null; // que un nuevo intento pueda volver a leer
              throw error;
            }
          );
      }
      return cached;
    },
    canLoadFromFile() {
      return typeof activeSource().loadFromFile === 'function';
    },
    async loadFromFile(file) {
      const model = toModel(await activeSource().loadFromFile(file));
      cached = Promise.resolve(model);
      announce(model);
      return model;
    },
  };
})();
