/*
 * Configuración del catálogo.
 * Es el único sitio que hay que tocar para cambiar de fuente de datos:
 * la interfaz (js/app.js + css/) nunca lee de aquí nada relacionado con Excel o Google.
 */
window.Catalogue = window.Catalogue || {};

window.Catalogue.config = {
  // Fuente activa. Fase 1: 'localExcel'. Fase 2: 'googleSheets' o 'sharepointJson' (aún por crear).
  source: 'localExcel',

  pageSize: 5,

  // Idioma al que se asigna la columna "Resource Name" del Excel actual (que es una sola, sin idioma).
  // Las columnas titulo_xx / title_xx, cuando existan, tienen prioridad.
  defaultTitleLang: 'en',

  // Solo se muestran recursos con "Validado = Sí".
  requireValidation: true,
  // El Excel de ejemplo todavía no tiene columna de validación. Mientras no exista, se muestran todos.
  // Poner a false en cuanto la fuente real tenga la columna: así, si falta, no se publica nada por error.
  assumeValidatedIfColumnMissing: true,

  localExcel: {
    path: 'NSP Catalogue of Resources.xlsx',
    sheetName: 'PER Catalogue of Resources',
    headerRow: 2, // la fila 1 del Excel es un título; los encabezados están en la 2
    // Filas máximas que se leen de cada hoja. Excel a veces da a una hoja un rango "usado" de más de un millón de filas
    // (por formato aplicado a columnas enteras) y leerlas todas tardaba decenas de segundos. Subirlo solo si alguna
    // hoja llega a tener más filas con datos.
    maxRows: 5000,
    // Los hipervínculos del Excel están guardados como rutas relativas a esta URL (SharePoint).
    hyperlinkBase: 'https://ifrcorg.sharepoint.com/sites/IFRCSharing/Preparedness Resources Mapping/',

    // Hoja "PER Links" del mismo Excel: enlaces de la sección NSP Channels (ver channels más abajo).
    // Si la hoja no existe o está vacía, el box sale con un mensaje de "sin recursos todavía".
    perLinks: {
      sheetName: 'PER Links',
      headerRow: 1,
    },
  },

  // Qué filas de "PER Links" salen en cada box de la sección NSP Channels: columna "Section" = section y
  // columna "Type of Resource" = typeOfResource, o uno de ellos si es una lista
  // (sin distinguir mayúsculas ni singular/plural: "Video" = "videos").
  channels: {
    // Los 5 boxes de arriba (IFRC Webpage, LinkedIn group…): nombre = columna "Resources", subtítulo = columna "Popup",
    // enlace = su columna de enlace (siempre directo: estos boxes no tienen idiomas ni popup).
    channelLinks: { section: 'NSP Channels', typeOfResource: 'Channel' },
    audiovisuals: { section: 'NSP Channels', typeOfResource: 'videos' }, // box "NSP Audiovisuals"
    learningVideos: { section: 'PER Learning videos', typeOfResource: 'videos' }, // box "PER Learning videos"
    // typeOfResource puede ser una lista: entra la fila si coincide con cualquiera de los tipos.
    articles: { section: 'NSP Channels', typeOfResource: ['Article', 'Case study', 'Success stories'] }, // box "NSP Articles"
  },

  // Elementos del diagrama "PER in the DRM Continuum" con enlace: filas de "PER Links" con Section = section y
  // Type of Resource = typeOfResource. Cada elemento del diagrama (marcado con data-continuum-link en index.html) se
  // empareja con su fila por el TEXTO (sin distinguir mayúsculas): la fila "Self-Assessment" da los enlaces de la
  // subpíldora "Self-Assessment". Si el texto de la web no es el del Excel, se indica la clave en el atributo:
  // data-continuum-link="NSD-NSP". El diagrama no cambia de sitio ni de tamaño; solo se le ponen los enlaces.
  // Dos tipos: "Tools" (NSD↔NSP, PER Full Capacity y sus subpíldoras, Branches, Checks) y "Linkages" (franja de
  // Programmes: su título y los botones de sectores).
  continuum: { section: 'PER in the DRM Continuum', typeOfResource: ['Tools', 'Linkages'] },

  // Filas de "PER Links" de la sección NSP Reference materials. Los packs (fila "PER Reference packs") son las filas con
  // Type of Resource = Folder; su nombre sale de la columna "Resources" y sus enlaces de las columnas "Link XX",
  // así que renombrar o añadir un pack en el Excel se refleja solo. Salen en el orden de las filas de la hoja.
  reference: {
    // Los 4 boxes blancos (base metodológica): Type of Resource = Core document. Texto = columna "Resources".
    documents: { section: 'NSP Reference Materials', typeOfResource: 'Core document' },
    packs: { section: 'NSP Reference Materials', typeOfResource: 'Folder' },
    // Botón del curso virtual: fila con Section = NSP Reference Materials y Type of Resource = Course. El texto del
    // botón es la columna "Resources" y el enlace, sus columnas de enlace (misma regla de popups que los packs).
    course: { section: 'NSP Reference Materials', typeOfResource: 'Course' },
  },

  // Columnas de enlace por idioma de "PER Links": cualquier encabezado "Link XX" (Link EN, Link FR, Link Bahasa,
  // Link Portuguese…) se detecta solo, así que añadir un idioma nuevo es añadir una columna en el Excel.
  // Aquí solo hace falta anotar las abreviaturas que NO son el código de idioma estándar (clave en minúsculas).
  // Los nombres en inglés (Portuguese, Spanish, Arabic…) y los códigos (EN, FR, AR…) ya se reconocen solos.
  languageAliases: {
    sp: 'es', // "Link SP" = español
    bahasa: 'id', // "Link Bahasa" = indonesio
  },

  // Encabezados del Excel actual que son columnas de link por idioma (sin prefijo link_).
  // Las columnas nuevas con formato link_xx / titulo_xx se detectan solas, sin listarlas aquí.
  languageColumns: {
    English: 'en',
    Français: 'fr',
    Español: 'es',
    'العربية': 'ar',
    'Русский': 'ru',
    '中文': 'zh',
  },

  // Variantes del mismo valor que en el Excel están escritas de forma distinta.
  // Clave: valor en minúsculas y sin tildes. Valor: cómo debe mostrarse.
  valueAliases: {
    type: {
      multiple: 'Multiple Resources',
      policy: 'Policy/Resolution',
      example: 'Example/case study',
    },
  },
};
