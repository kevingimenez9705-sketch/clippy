/* =========================================================
   APP CITACIONES · la planilla "Citaciones Tortus" como app web

   Va en el proyecto de Apps Script "Botonera Citaciones", junto a
   Codigo.gs, Citacion.html, Funciones.gs y Botonera.html. Esos
   archivos no se tocan (salvo una línea en doGet, ver README).
   Archivos nuevos: AppCitaciones.gs (este) y App.html. No pueden
   llamarse igual: Apps Script no deja un .gs y un .html con el
   mismo nombre.

   La base sigue siendo la planilla: la app lee y escribe las mismas
   pestañas ("Citaciones-<selector>" y "Confirmados") y las mismas
   columnas. Por eso el menú 📞 Citar, la Botonera, el panel Clippy
   y los flujos de n8n que leen la planilla siguen igual.

   Usa las funciones que ya existen:
     Codigo.gs    → columnasCitaciones_, zonaCanonica_, horaCitacion_,
                    formatearFecha, citador_, obtenerHojaConfirmados_…
     Funciones.gs → libroCitaciones_, pestanaCitaciones_, citar,
                    eliminarEnviadas, recopilar, organizarGmail
   Lo único nuevo es: listar la pestaña, asignar fecha y hora en
   bloque y listar los confirmados.
   ========================================================= */

/* ── configuración ─────────────────────────────────────── */

// Planilla del ATS de donde se traen postulantes ("Tareas grupales/zonas").
// Pegar el link o el ID. Vacío = la sección "Traer del ATS" avisa que falta.
const APP_ATS = {
  PLANILLA: '',
  HOJA: 'ATS - Postulaciones'
};


function appPagina_() {
  return HtmlService
    .createHtmlOutputFromFile('App')
    .setTitle('Citaciones · Selección Operativa')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


/* =========================================================
   INICIO: quién soy y qué pestañas hay
   ========================================================= */

function appInicio() {
  const libro = libroCitaciones_();
  const yo = citador_();
  const pestanas = libro.getSheets()
    .map(hoja => hoja.getName())
    .filter(nombre => esHojaCitaciones_(nombre));

  return {
    yo: yo,
    pestanas: pestanas,
    sugerida: pestanaSugerida_(pestanas, yo),
    zonas: CONFIG.ZONAS,
    sedes: Object.keys(CONFIG.SEDES),
    hoy: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    planilla: libro.getUrl()
  };
}

// "Citaciones-Gustavo" para gustavo.algo@…; si no hay una con mi nombre, la primera
function pestanaSugerida_(pestanas, yo) {
  const prefijo = normalizar(CONFIG.HOJA_CITACIONES);
  const nombres = [yo.nombre, String(yo.email || '').split('@')[0]]
    .map(t => normalizar(String(t || '').split('@')[0]).split(/[^a-z0-9]+/)[0])
    .filter(Boolean);

  const mia = pestanas.find(p => {
    const resto = normalizar(p).slice(prefijo.length).replace(/^[^a-z0-9]+/, '');
    const primera = resto.split(/[^a-z0-9]+/)[0];
    return primera && nombres.indexOf(primera) !== -1;
  });

  return mia || pestanas[0] || '';
}


/* =========================================================
   BANDEJA: las filas de una pestaña de citaciones
   ========================================================= */

function appListar(pestana) {
  const hoja = pestanaCitaciones_(pestana);
  const lectura = leerBandeja_(hoja);

  return {
    pestana: hoja.getName(),
    filas: lectura.filas,
    cupo: MailApp.getRemainingDailyQuota(),
    leido: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HH:mm')
  };
}

function leerBandeja_(hoja) {
  const ultimaFila = hoja.getLastRow();
  const ultimaCol = hoja.getLastColumn();

  if (ultimaFila < 1 || ultimaCol < 1) {
    throw new Error(`La pestaña "${hoja.getName()}" está vacía (falta la fila de encabezados).`);
  }

  const encabezados = hoja.getRange(1, 1, 1, ultimaCol).getDisplayValues()[0];
  const col = columnasCitaciones_(encabezados); // mismas columnas obligatorias que el menú
  const mapa = mapaColumnas_(encabezados);
  const extra = {
    id: buscar_(mapa, ['id']),
    edad: buscar_(mapa, ['edad']),
    localidad: buscar_(mapa, ['localidad']),
    disp: columnaQueEmpieza_(mapa, 'disp'),
    puntaje: columnaQueEmpieza_(mapa, 'puntaje')
  };

  // La pestaña tiene muchas columnas vacías al final: se lee solo hasta la última que se usa
  const usadas = Object.keys(col).map(k => col[k])
    .concat(Object.keys(extra).map(k => extra[k]))
    .filter(i => i !== undefined);
  const ancho = Math.max.apply(null, usadas) + 1;

  const filas = [];
  if (ultimaFila < 2) return { filas: filas, col: col };

  const rango = hoja.getRange(2, 1, ultimaFila - 1, ancho);
  const valores = rango.getValues();
  const visibles = rango.getDisplayValues();

  for (let i = 0; i < visibles.length; i++) {
    const vis = visibles[i];
    const val = valores[i];
    if (!vis.some(v => String(v).trim())) continue;

    // Igual que leerPendientes_(): así la clave coincide con la de citar()
    const email = celda_(vis, col.email);
    const nombre = celda_(vis, col.nombre);
    const fecha = formatearFecha(val[col.fecha]);
    const hora = horaCitacion_(val[col.hora], vis[col.hora]);
    const zona = zonaCanonica_(vis[col.zona]);
    const estadoEnvio = celda_(vis, col.estado);
    const enviado = estadoEnvio.toUpperCase() === 'ENVIADO';
    const citable = !enviado && !!email && !!fecha && !!hora && !!zona;

    let st;
    if (enviado) st = 'enviado';
    else if (estadoEnvio.toUpperCase().indexOf('ERROR') === 0) st = 'error';
    else if (!email) st = 'sinmail';
    else if (!fecha || !hora) st = 'sinfecha';
    else if (!zona) st = 'sinzona';
    else st = 'listo';

    const envio = col.fechaEnvio !== undefined ? val[col.fechaEnvio] : '';

    filas.push({
      f: i + 2,                                   // número de fila en la planilla
      id: celda_(vis, extra.id),
      n: nombre,
      e: email,
      ed: celda_(vis, extra.edad),
      z: celda_(vis, col.zona),
      zc: zona,                                   // zona reconocida (CABA/Norte/Sur/Oeste) o ''
      s: zona ? CONFIG.ZONAS[zona] : '',          // sede
      l: celda_(vis, extra.localidad),
      p: celda_(vis, col.puesto),
      d: celda_(vis, extra.disp),
      pt: celda_(vis, extra.puntaje),
      fe: fecha,
      h: hora,
      es: estadoEnvio,
      st: st,
      fx: envio instanceof Date ? envio.getTime() : 0,
      k: citable ? claveCita_(email, fecha, hora, nombre) : ''
    });
  }

  return { filas: filas, col: col };
}

// Misma clave que arma leerPendientes_() en Codigo.gs (la que valida citar())
function claveCita_(email, fecha, hora, nombre) {
  return [String(email).toLowerCase(), fecha, hora, nombre || 'Postulante'].join('|');
}

function columnaQueEmpieza_(mapa, inicio) {
  const clave = Object.keys(mapa).find(k => k.indexOf(inicio) === 0);
  return clave === undefined ? undefined : mapa[clave];
}


/* =========================================================
   ASIGNAR FECHA Y HORA EN BLOQUE
   pedidas: [{ f: fila, k: "email|nombre" }]
   fecha "aaaa-mm-dd" y hora "hh:mm"; las dos vacías = quitar.
   Escribe solo "Fecha entrevista" y "Hora entrevista".
   ========================================================= */

function appAsignar(pestana, pedidas, fecha, hora) {
  const quitar = !fecha && !hora;
  let horaFinal = '';

  if (!quitar) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha || ''))) {
      throw new Error('Elegí una fecha.');
    }
    const m = String(hora || '').match(/^(\d{1,2}):(\d{2})$/);
    horaFinal = m ? armarHora_(m[1], m[2]) : CONFIG.SIN_DATO;
    if (horaFinal === CONFIG.SIN_DATO) {
      throw new Error('Elegí una hora válida.');
    }
  }

  const hoja = pestanaCitaciones_(pestana);
  const lista = Array.isArray(pedidas) ? pedidas : [];
  const resultado = { asignadas: 0, yaEnviadas: 0, noEncontradas: 0 };
  if (!lista.length) return resultado;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error('Hay otro envío o recopilación en curso. Probá de nuevo en un minuto.');
  }

  try {
    // Se relee con el bloqueo tomado: si alguien borró filas mientras tanto,
    // cada persona se busca por mail + nombre y no se escribe en otra fila
    const ultimaFila = hoja.getLastRow();
    const encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getDisplayValues()[0];
    const col = columnasCitaciones_(encabezados);
    const ancho = Math.max(col.email, col.estado, col.nombre === undefined ? 0 : col.nombre) + 1;
    const vis = ultimaFila >= 2 ? hoja.getRange(2, 1, ultimaFila - 1, ancho).getDisplayValues() : [];

    const persona = i => (celda_(vis[i], col.email) + '|' + celda_(vis[i], col.nombre)).toLowerCase();
    const porPersona = {};
    vis.forEach((_, i) => {
      const k = persona(i);
      (porPersona[k] = porPersona[k] || []).push(i);
    });

    const usadas = {};
    const destino = [];

    lista.forEach(pedida => {
      const k = String((pedida && pedida.k) || '').toLowerCase();
      let i = Number(pedida && pedida.f) - 2;

      if (!(i >= 0 && i < vis.length && !usadas[i] && persona(i) === k)) {
        i = (porPersona[k] || []).find(j => !usadas[j]);
      }
      if (i === undefined) {
        resultado.noEncontradas++;
        return;
      }

      usadas[i] = true;

      // Una citación ya enviada no se cambia: el mail ya salió con esa fecha
      if (celda_(vis[i], col.estado).toUpperCase() === 'ENVIADO') {
        resultado.yaEnviadas++;
        return;
      }
      destino.push(i + 2);
    });

    if (destino.length) {
      const fechas = hoja.getRangeList(destino.map(f => a1_(f, col.fecha + 1)));
      const horas = hoja.getRangeList(destino.map(f => a1_(f, col.hora + 1)));

      if (quitar) {
        fechas.clearContent();
        horas.clearContent();
      } else {
        const tz = hoja.getParent().getSpreadsheetTimeZone();
        fechas.setNumberFormat('dd/mm/yyyy');
        fechas.setValue(Utilities.parseDate(fecha, tz, 'yyyy-MM-dd'));
        horas.setNumberFormat('@');
        horas.setValue(horaFinal);
      }

      SpreadsheetApp.flush();
    }

    resultado.asignadas = destino.length;
    return resultado;

  } finally {
    lock.releaseLock();
  }
}

// (fila 5, columna 10) → "J5"
function a1_(fila, columna) {
  let letras = '';
  let n = columna;
  while (n > 0) {
    const resto = (n - 1) % 26;
    letras = String.fromCharCode(65 + resto) + letras;
    n = Math.floor((n - 1) / 26);
  }
  return letras + fila;
}


/* =========================================================
   CONFIRMADOS: el listado de la hoja "Confirmados"
   ========================================================= */

function appConfirmados() {
  libroCitaciones_();
  const destino = obtenerHojaConfirmados_();
  const hoja = destino.hoja;
  const ultimaFila = hoja.getLastRow();
  const filas = [];

  if (ultimaFila >= 2) {
    hoja.getRange(2, 1, ultimaFila - 1, hoja.getLastColumn())
      .getDisplayValues()
      .forEach(fila => {
        const email = celda_(fila, destino.email);
        if (!email) return;

        filas.push({
          s: celda_(fila, destino.sede) || CONFIG.SIN_DATO,
          n: celda_(fila, destino.nombre),
          e: email,
          fe: fechaDeCelda_(celda_(fila, destino.fecha)),
          h: horaDeCelda_(celda_(fila, destino.hora)),
          c: celda_(fila, destino.cito),
          r: celda_(fila, destino.recibido)
        });
      });
  }

  return {
    filas: filas,
    casilla: citador_().email,
    sedes: Object.keys(CONFIG.SEDES),
    leido: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HH:mm')
  };
}


/* =========================================================
   TRAER DEL ATS
   Lee "ATS - Postulaciones" (solo lectura) y copia las personas
   elegidas al final de una pestaña de citaciones, columna por
   columna según el nombre del encabezado (Id, Nombre, Edad, Email,
   Zona, Localidad, Puesto, Disp., Puntaje). Opcional: con fecha y
   hora de entrevista ya puestas. Nunca duplica un mail en la
   pestaña destino.
   ========================================================= */

function appAts() {
  const ats = leerAts_();
  const donde = mailsEnCitaciones_();
  const c = ats.col;
  const filas = [];

  ats.visibles.forEach((vis, i) => {
    if (!vis.some(v => String(v).trim())) return;
    const email = celda_(vis, c.email);
    const estaEn = donde[email.toLowerCase()] || null;
    const zona = celda_(vis, c.zona);

    filas.push({
      a: i + 2,                                   // fila en el ATS
      id: celda_(vis, c.id),
      n: celda_(vis, c.nombre),
      e: email,
      ed: celda_(vis, c.edad),
      z: zona,
      zc: zonaCanonica_(zona),
      l: celda_(vis, c.localidad),
      p: celda_(vis, c.puesto),
      d: celda_(vis, c.disp),
      pt: celda_(vis, c.puntaje),
      ok: mailValido_(email),
      en: estaEn ? estaEn.pestanas : [],          // pestañas de citaciones donde ya está
      env: estaEn ? estaEn.enviado : false        // ya se le mandó la citación
    });
  });

  return {
    filas: filas,
    hoja: ats.hoja.getName(),
    planilla: ats.hoja.getParent().getName(),
    leido: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HH:mm')
  };
}

// elegidas: [{ a: fila del ATS, e: email }]; fecha "aaaa-mm-dd" y hora "hh:mm" opcionales (las dos o ninguna)
function appTraerAts(pestana, elegidas, fecha, hora) {
  const conFecha = !!(fecha || hora);
  let horaFinal = '';

  if (conFecha) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha || ''))) {
      throw new Error('Para agregarlos con entrevista elegí fecha y hora (o dejá las dos vacías).');
    }
    const m = String(hora || '').match(/^(\d{1,2}):(\d{2})$/);
    horaFinal = m ? armarHora_(m[1], m[2]) : CONFIG.SIN_DATO;
    if (horaFinal === CONFIG.SIN_DATO) {
      throw new Error('Para agregarlos con entrevista elegí fecha y hora (o dejá las dos vacías).');
    }
  }

  const lista = Array.isArray(elegidas) ? elegidas : [];
  const resultado = { agregadas: 0, yaEstaban: 0, sinMail: 0, noEncontradas: 0, pestana: '', personas: [] };
  if (!lista.length) return resultado;

  const hoja = pestanaCitaciones_(pestana);
  resultado.pestana = hoja.getName();

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error('Hay otro envío o recopilación en curso. Probá de nuevo en un minuto.');
  }

  try {
    const ats = leerAts_();
    const ca = ats.col;

    // Columnas de la pestaña destino (las obligatorias, como el menú, más las del ATS que tenga)
    const encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getDisplayValues()[0];
    const cd = columnasCitaciones_(encabezados);
    const mapa = mapaColumnas_(encabezados);
    const destino = {
      id: buscar_(mapa, ['id']),
      nombre: cd.nombre,
      edad: buscar_(mapa, ['edad']),
      email: cd.email,
      zona: cd.zona,
      localidad: buscar_(mapa, ['localidad']),
      puesto: cd.puesto,
      disp: columnaQueEmpieza_(mapa, 'disp'),
      puntaje: columnaQueEmpieza_(mapa, 'puntaje')
    };

    // Mails que ya están en la pestaña destino: no se repiten
    const ultimaFila = hoja.getLastRow();
    const yaEstan = {};
    if (ultimaFila >= 2) {
      hoja.getRange(2, cd.email + 1, ultimaFila - 1, 1).getDisplayValues()
        .forEach(f => { const e = celda_(f, 0).toLowerCase(); if (e) yaEstan[e] = true; });
    }

    // Fila del ATS de cada mail, por si el ATS cambió desde que se abrió la lista
    const filaAts = {};
    ats.visibles.forEach((vis, i) => {
      const e = celda_(vis, ca.email).toLowerCase();
      if (e && filaAts[e] === undefined) filaAts[e] = i;
    });

    const usados = Object.keys(destino).map(k => destino[k])
      .concat([cd.fecha, cd.hora])
      .filter(i => i !== undefined);
    const ancho = Math.max.apply(null, usados) + 1;
    const nuevas = [];

    lista.forEach(elegida => {
      const pedido = String((elegida && elegida.e) || '').trim().toLowerCase();
      let i = Number(elegida && elegida.a) - 2;

      if (!(i >= 0 && i < ats.visibles.length && celda_(ats.visibles[i], ca.email).toLowerCase() === pedido)) {
        i = filaAts[pedido];
      }
      if (i === undefined || !pedido) {
        resultado.noEncontradas++;
        return;
      }

      const vis = ats.visibles[i];
      const val = ats.valores[i];
      const email = celda_(vis, ca.email);

      if (!mailValido_(email)) {
        resultado.sinMail++;
        return;
      }
      if (yaEstan[email.toLowerCase()]) {
        resultado.yaEstaban++;
        return;
      }
      yaEstan[email.toLowerCase()] = true;

      const fila = new Array(ancho).fill('');
      Object.keys(destino).forEach(campo => {
        if (destino[campo] === undefined || ca[campo] === undefined) return;
        const v = val[ca[campo]];
        fila[destino[campo]] = typeof v === 'string' ? seguro_(v.trim()) : v;
      });
      if (conFecha) {
        fila[cd.fecha] = Utilities.parseDate(fecha, hoja.getParent().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
        fila[cd.hora] = horaFinal;
      }

      nuevas.push(fila);
      resultado.personas.push(email + '|' + celda_(vis, ca.nombre));
    });

    if (nuevas.length) {
      const primera = hoja.getLastRow() + 1;
      const faltan = primera + nuevas.length - 1 - hoja.getMaxRows();
      if (faltan > 0) {
        hoja.insertRowsAfter(hoja.getMaxRows(), faltan);
      }

      // La hora va como texto ("09:30") y la fecha como fecha, igual que appAsignar
      hoja.getRange(primera, cd.hora + 1, nuevas.length, 1).setNumberFormat('@');
      hoja.getRange(primera, 1, nuevas.length, ancho).setValues(nuevas);
      if (conFecha) {
        hoja.getRange(primera, cd.fecha + 1, nuevas.length, 1).setNumberFormat('dd/mm/yyyy');
      }
      SpreadsheetApp.flush();
    }

    resultado.agregadas = nuevas.length;
    return resultado;

  } finally {
    lock.releaseLock();
  }
}

function hojaAts_() {
  const ref = String(APP_ATS.PLANILLA || '').trim();
  if (!ref) {
    throw new Error('Falta configurar la planilla del ATS: pegá su link en APP_ATS.PLANILLA (AppCitaciones.gs).');
  }

  const id = (ref.match(/\/d\/([a-zA-Z0-9_-]+)/) || [null, ref])[1];
  let libro;
  try {
    libro = SpreadsheetApp.openById(id);
  } catch (error) {
    throw new Error('No se pudo abrir la planilla del ATS. Revisá APP_ATS.PLANILLA y que tengas acceso.\n\n' + error.message);
  }

  const hoja = libro.getSheetByName(APP_ATS.HOJA);
  if (!hoja) {
    throw new Error(`No encontré la pestaña "${APP_ATS.HOJA}" en la planilla del ATS.`);
  }
  return hoja;
}

function leerAts_() {
  const hoja = hojaAts_();
  const ultimaFila = hoja.getLastRow();
  const ultimaCol = hoja.getLastColumn();
  if (ultimaCol < 1) {
    throw new Error(`La pestaña "${hoja.getName()}" del ATS está vacía.`);
  }

  const encabezados = hoja.getRange(1, 1, 1, ultimaCol).getDisplayValues()[0];
  const mapa = mapaColumnas_(encabezados);
  const col = {
    id: buscar_(mapa, ['id']),
    nombre: buscar_(mapa, ALIAS.nombre),
    edad: buscar_(mapa, ['edad']),
    email: buscar_(mapa, ALIAS.email),
    zona: buscar_(mapa, ['zona']),
    localidad: buscar_(mapa, ['localidad']),
    puesto: buscar_(mapa, ['puesto']),
    disp: columnaQueEmpieza_(mapa, 'disp'),
    puntaje: columnaQueEmpieza_(mapa, 'puntaje')
  };
  if (col.email === undefined) {
    throw new Error(`Falta la columna "Email" en "${hoja.getName()}" del ATS.`);
  }

  const usadas = Object.keys(col).map(k => col[k]).filter(i => i !== undefined);
  const ancho = Math.max.apply(null, usadas) + 1;

  if (ultimaFila < 2) {
    return { hoja: hoja, col: col, valores: [], visibles: [] };
  }
  const rango = hoja.getRange(2, 1, ultimaFila - 1, ancho);
  return { hoja: hoja, col: col, valores: rango.getValues(), visibles: rango.getDisplayValues() };
}

// mail → { pestanas: [...], enviado } en todas las pestañas de citaciones
function mailsEnCitaciones_() {
  const donde = {};

  libroCitaciones_().getSheets().forEach(hoja => {
    if (!esHojaCitaciones_(hoja.getName())) return;
    const ultimaFila = hoja.getLastRow();
    if (ultimaFila < 2) return;

    const encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getDisplayValues()[0];
    const mapa = mapaColumnas_(encabezados);
    const cEmail = buscar_(mapa, ALIAS.email);
    const cEstado = buscar_(mapa, ['estado envio']);
    if (cEmail === undefined) return;

    const ancho = Math.max(cEmail, cEstado === undefined ? 0 : cEstado) + 1;
    hoja.getRange(2, 1, ultimaFila - 1, ancho).getDisplayValues().forEach(f => {
      const e = celda_(f, cEmail).toLowerCase();
      if (!e) return;
      const d = donde[e] || (donde[e] = { pestanas: [], enviado: false });
      if (d.pestanas.indexOf(hoja.getName()) === -1) d.pestanas.push(hoja.getName());
      if (cEstado !== undefined && celda_(f, cEstado).toUpperCase() === 'ENVIADO') d.enviado = true;
    });
  });

  return donde;
}

// El ATS pone "sin email · Id 123" cuando no hay mail: eso no se puede citar
function mailValido_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}
