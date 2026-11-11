/* =========================================================
   TABLERO DE CITACIONES · la planilla "Citaciones Tortus" como app web

   DÓNDE VA: en el proyecto de Apps Script de la propia planilla
   (Extensiones → Apps Script), junto a Codigo.gs y Citacion.html.
   Archivos nuevos: AppCitaciones.gs (este) y App.html.
   Solo usa funciones de Codigo.gs: no necesita la Botonera.
   (También funciona dentro del proyecto "Botonera Citaciones".)

   La base sigue siendo la planilla: lee y escribe las mismas
   pestañas ("Citaciones-<selector>" y "Confirmados") y columnas,
   con las mismas reglas del menú 📞 Citar. El menú, el panel Clippy
   y los flujos de n8n que leen la planilla siguen igual.

   Cómo se abre:
     - Web app: una línea en el doGet que ya tiene el proyecto
       (ver README) + Implementar → Nueva implementación.
     - Sin implementar nada: abrirTablero() lo abre en una ventana
       dentro de la planilla (se puede sumar al menú 📞 Citar).

   Todas las funciones empiezan con "app" para no chocar con las
   que ya tiene el proyecto.
   ========================================================= */


/* ── configuración ─────────────────────────────────────── */

// Planilla del ATS de donde se traen postulantes ("Tareas grupales/zonas").
// Pegar el link o el ID. Vacío = "Buscar en el ATS" avisa que falta y
// queda la carga manual (pegar filas o cargar a mano).
const APP_ATS = {
  PLANILLA: '',
  HOJA: 'ATS - Postulaciones'
};

// Normalmente vacío: el tablero usa la planilla del proyecto. Solo si dice
// "No encuentro la planilla", pegar acá el link de Citaciones Tortus.
const APP_PLANILLA = '';


/* =========================================================
   ENTRADA
   ========================================================= */

function appPagina_() {
  return HtmlService
    .createHtmlOutputFromFile('App')
    .setTitle('Citaciones · Selección Operativa')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// El tablero en una ventana dentro de la planilla, sin implementar nada
function abrirTablero() {
  const html = HtmlService.createHtmlOutputFromFile('App').setWidth(1200).setHeight(680);
  SpreadsheetApp.getUi().showModelessDialog(html, 'Tablero de citaciones');
}

// La planilla de citaciones: la del proyecto, o la que abre la Botonera por ID
function appLibro_() {
  const activa = SpreadsheetApp.getActiveSpreadsheet();
  if (activa) return activa;

  const ref = String(APP_PLANILLA || '').trim() ||
    (typeof PLANILLA_CITACIONES !== 'undefined' ? String(PLANILLA_CITACIONES || '') : '');
  if (ref) {
    const id = (ref.match(/\/d\/([a-zA-Z0-9_-]+)/) || [null, ref])[1];
    CONFIG.PLANILLA_CONFIRMADOS = CONFIG.PLANILLA_CONFIRMADOS || id;   // para obtenerHojaConfirmados_()
    return SpreadsheetApp.openById(id);
  }

  throw new Error('No encuentro la planilla. AppCitaciones.gs va en el proyecto de Apps Script de la planilla (Extensiones → Apps Script).');
}

function appPestana_(nombre) {
  const hoja = appLibro_().getSheetByName(String(nombre || ''));
  if (!hoja || !esHojaCitaciones_(hoja.getName())) {
    throw new Error(`No encontré la pestaña "${nombre}".`);
  }
  return hoja;
}

// Si al proyecto le falta algo de Codigo.gs, se avisa en el tablero en vez de fallar a mitad de camino
function appVerificar_() {
  const necesarias = [
    'leerPendientes_', 'columnasCitaciones_', 'esHojaCitaciones_', 'validarConfig_', 'generarHtml',
    'asuntoCitacion_', 'direccionTexto_', 'citador_', 'mapaColumnas_', 'buscar_', 'celda_', 'normalizar',
    'formatearFecha', 'horaCitacion_', 'armarHora_', 'zonaCanonica_', 'fechaDeCelda_', 'horaDeCelda_',
    'obtenerHojaConfirmados_', 'seguro_', 'sedeDelMensaje_'
  ];
  const faltan = necesarias.filter(n => typeof globalThis[n] !== 'function');
  if (typeof CONFIG === 'undefined') faltan.unshift('CONFIG');

  if (faltan.length) {
    throw new Error('Al proyecto le falta Codigo.gs (o una versión que tenga: ' + faltan.join(', ') + ').');
  }
}


/* =========================================================
   INICIO: quién soy y qué pestañas hay
   ========================================================= */

function appInicio() {
  appVerificar_();
  const libro = appLibro_();
  const yo = citador_();
  const pestanas = libro.getSheets()
    .map(hoja => hoja.getName())
    .filter(nombre => esHojaCitaciones_(nombre));

  return {
    yo: yo,
    pestanas: pestanas,
    sugerida: appSugerida_(pestanas, yo),
    zonas: CONFIG.ZONAS,
    sedes: Object.keys(CONFIG.SEDES),
    hoy: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    planilla: libro.getUrl(),
    ats: !!String(APP_ATS.PLANILLA || '').trim()
  };
}

// "Citaciones-Gustavo" para gustavo.algo@…; si no hay una con mi nombre, la primera
function appSugerida_(pestanas, yo) {
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
  const hoja = appPestana_(pestana);

  return {
    pestana: hoja.getName(),
    filas: appLeerBandeja_(hoja),
    cupo: MailApp.getRemainingDailyQuota(),
    leido: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HH:mm')
  };
}

function appLeerBandeja_(hoja) {
  const ultimaFila = hoja.getLastRow();
  const ultimaCol = hoja.getLastColumn();

  if (ultimaFila < 1 || ultimaCol < 1) {
    throw new Error(`La pestaña "${hoja.getName()}" está vacía (falta la fila de encabezados).`);
  }

  const encabezados = hoja.getRange(1, 1, 1, ultimaCol).getDisplayValues()[0];
  const col = columnasCitaciones_(encabezados); // mismas columnas obligatorias que el menú
  const extra = appColumnasPostulante_(encabezados);

  // La pestaña tiene muchas columnas vacías al final: se lee solo hasta la última que se usa
  const usadas = Object.keys(col).map(k => col[k])
    .concat(Object.keys(extra).map(k => extra[k]))
    .filter(i => i !== undefined);
  const ancho = Math.max.apply(null, usadas) + 1;

  const filas = [];
  if (ultimaFila < 2) return filas;

  const rango = hoja.getRange(2, 1, ultimaFila - 1, ancho);
  const valores = rango.getValues();
  const visibles = rango.getDisplayValues();

  for (let i = 0; i < visibles.length; i++) {
    const vis = visibles[i];
    const val = valores[i];
    if (!vis.some(v => String(v).trim())) continue;

    // Igual que leerPendientes_(): así la clave coincide con la que valida el envío
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
      k: citable ? appClave_(email, fecha, hora, nombre) : ''
    });
  }

  return filas;
}

// Misma clave que arma leerPendientes_() en Codigo.gs
function appClave_(email, fecha, hora, nombre) {
  return [String(email).toLowerCase(), fecha, hora, nombre || 'Postulante'].join('|');
}

// Columnas de datos del postulante (las mismas del ATS), por nombre de encabezado
function appColumnasPostulante_(encabezados) {
  const mapa = mapaColumnas_(encabezados);
  return {
    id: buscar_(mapa, ['id']),
    nombre: buscar_(mapa, ALIAS.nombre),
    edad: buscar_(mapa, ['edad']),
    email: buscar_(mapa, ALIAS.email),
    zona: buscar_(mapa, ['zona']),
    localidad: buscar_(mapa, ['localidad']),
    puesto: buscar_(mapa, ['puesto']),
    disp: appColumnaQueEmpieza_(mapa, 'disp'),
    puntaje: appColumnaQueEmpieza_(mapa, 'puntaje')
  };
}

function appColumnaQueEmpieza_(mapa, inicio) {
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
  const horaFinal = quitar ? '' : appFechaHora_(fecha, hora, 'Elegí fecha y hora.').hora;

  const hoja = appPestana_(pestana);
  const lista = Array.isArray(pedidas) ? pedidas : [];
  const resultado = { asignadas: 0, yaEnviadas: 0, noEncontradas: 0 };
  if (!lista.length) return resultado;

  const lock = appBloquear_();
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
      const fechas = hoja.getRangeList(destino.map(f => appA1_(f, col.fecha + 1)));
      const horas = hoja.getRangeList(destino.map(f => appA1_(f, col.hora + 1)));

      if (quitar) {
        fechas.clearContent();
        horas.clearContent();
      } else {
        fechas.setNumberFormat('dd/mm/yyyy');
        fechas.setValue(Utilities.parseDate(fecha, hoja.getParent().getSpreadsheetTimeZone(), 'yyyy-MM-dd'));
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

// Valida "aaaa-mm-dd" + "hh:mm" y devuelve la hora como la escribe el menú ("09:30")
function appFechaHora_(fecha, hora, mensaje) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha || ''))) throw new Error(mensaje);
  const m = String(hora || '').match(/^(\d{1,2}):(\d{2})$/);
  const horaFinal = m ? armarHora_(m[1], m[2]) : CONFIG.SIN_DATO;
  if (horaFinal === CONFIG.SIN_DATO) throw new Error(mensaje);
  return { fecha: fecha, hora: horaFinal };
}

function appBloquear_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error('Hay otro envío o recopilación en curso. Probá de nuevo en un minuto.');
  }
  return lock;
}

// (fila 5, columna 10) → "J5"
function appA1_(fila, columna) {
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
   CITAR (lo mismo que 📞 Citar → "Sí", solo para las claves elegidas)
   ========================================================= */

function appCitar(pestana, claves) {
  validarConfig_();

  const hoja = appPestana_(pestana);
  const citador = citador_();
  const pedidas = Array.isArray(claves) ? claves : [];

  let enviados = 0;
  let errores = 0;
  let salteados = 0;

  const lock = appBloquear_();
  try {
    // Se relee con el bloqueo tomado: si otra persona ya envió o borró filas
    // mientras estaba abierta la vista previa, no se duplica ni se marca otra fila
    const aprobadas = {};
    pedidas.forEach(clave => {
      aprobadas[clave] = (aprobadas[clave] || 0) + 1;
    });

    const actual = leerPendientes_(hoja, '');
    const col = actual.col;

    const aEnviar = actual.items.filter(item => {
      if (!aprobadas[item.clave]) return false;
      aprobadas[item.clave]--;
      return true;
    });

    salteados = pedidas.length - aEnviar.length;

    aEnviar.forEach(item => {
      // El menú de la planilla usa otro bloqueo: justo antes de mandar se mira
      // que la fila siga siendo la misma persona y siga sin ENVIADO
      const fila = hoja.getRange(item.numeroFila, 1, 1, hoja.getLastColumn()).getDisplayValues()[0];
      const mismaPersona = String(fila[col.email] || '').trim().toLowerCase() === item.email.toLowerCase();
      const yaEnviada = String(fila[col.estado] || '').trim().toUpperCase() === 'ENVIADO';

      if (!mismaPersona || yaEnviada) {
        salteados++;
        return;
      }

      try {
        MailApp.sendEmail({
          to: item.email,
          subject: asuntoCitacion_(item.sede),
          name: CONFIG.SENDER_NAME,
          htmlBody: generarHtml(item),
          body:
            `Citación a Entrevista Presencial - SABORES EXTREMAS\n\n` +
            `Hola ${item.nombre}, te citamos a la entrevista presencial.\n\n` +
            `Puesto: ${item.puesto}\n` +
            `Fecha: ${item.fechaEntrevista}\n` +
            `Hora: ${item.horaEntrevista} HS\n` +
            `Sede: ${item.sede} - ${direccionTexto_(item.sede)}.`
        });

        hoja.getRange(item.numeroFila, col.estado + 1).setValue('ENVIADO');
        if (col.fechaEnvio !== undefined) {
          hoja.getRange(item.numeroFila, col.fechaEnvio + 1).setValue(new Date());
        }
        if (col.sede !== undefined) {
          hoja.getRange(item.numeroFila, col.sede + 1).setValue(item.sede);
        }
        if (col.cito !== undefined) {
          hoja.getRange(item.numeroFila, col.cito + 1).setValue(citador.nombre);
        }
        enviados++;

      } catch (error) {
        hoja.getRange(item.numeroFila, col.estado + 1).setValue('ERROR: ' + error.message);
        console.error(error);
        errores++;
      }
    });

    SpreadsheetApp.flush();

  } finally {
    lock.releaseLock();
  }

  return { enviados: enviados, errores: errores, salteados: salteados };
}


/* =========================================================
   ELIMINAR FILAS ENVIADO (lo mismo que 🗑️ del menú)
   ========================================================= */

function appEliminarEnviadas(pestana) {
  const hoja = appPestana_(pestana);
  let eliminadas = 0;

  const lock = appBloquear_();
  try {
    const vis = hoja.getDataRange().getDisplayValues();
    const colEstado = buscar_(mapaColumnas_(vis[0] || []), ['estado envio']);
    if (colEstado === undefined) {
      throw new Error('Falta la columna "Estado Envio" en la pestaña.');
    }

    const enviado = i => String(vis[i][colEstado] || '').trim().toUpperCase() === 'ENVIADO';

    // De abajo hacia arriba, borrando bloques de filas seguidas
    let i = vis.length - 1;
    while (i >= 1) {
      if (!enviado(i)) {
        i--;
        continue;
      }
      const fin = i;
      while (i >= 1 && enviado(i)) i--;
      const cantidad = fin - i;

      // Sheets no deja borrar todas las filas no inmovilizadas
      if (hoja.getMaxRows() - cantidad <= hoja.getFrozenRows()) {
        hoja.insertRowAfter(hoja.getMaxRows());
      }
      hoja.deleteRows(i + 2, cantidad);
      eliminadas += cantidad;
    }

    SpreadsheetApp.flush();

  } finally {
    lock.releaseLock();
  }

  return { pestana: hoja.getName(), eliminadas: eliminadas };
}


/* =========================================================
   CONFIRMADOS
   ========================================================= */

function appConfirmados() {
  appLibro_();
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

// "📋 Recopilar confirmados": en el proyecto de la planilla usa la misma función
// del menú (recopilar_ de Codigo.gs). Si la planilla se abre por link, una copia
// que lee las citaciones de esa planilla (como hace la Botonera).
function appRecopilar() {
  if (SpreadsheetApp.getActiveSpreadsheet() && typeof recopilar_ === 'function') {
    const r = recopilar_(true);
    if (!r) throw new Error('Hay otro envío o recopilación en curso. Probá de nuevo en un minuto.');
    return r;
  }

  appLibro_();
  const lock = appBloquear_();
  try {
    const ahora = Math.floor(Date.now() / 1000);
    const inicio = inicioListado_();
    const desde = Math.max(ahora - CONFIG.DIAS_ATRAS * 86400, inicio);

    const yo = citador_();
    const casillaComun = String(CONFIG.CASILLA_CONFIRMACIONES || '').trim().toLowerCase();
    const leoCasillaComun = !!casillaComun && casillaComun === yo.email;

    const mensajes = leerConfirmaciones_(desde, inicio, yo.email);
    const destino = obtenerHojaConfirmados_();
    const claves = clavesConfirmados_(destino);
    const citas = appCitasPorEmail_();

    const filas = [];
    const porSede = {};
    let sinDato = 0;

    mensajes.forEach(mensaje => {
      const cita = citas[mensaje.email];
      if (cita) {
        if (mensaje.fecha === CONFIG.SIN_DATO) mensaje.fecha = cita.fecha;
        if (mensaje.hora === CONFIG.SIN_DATO) mensaje.hora = cita.hora;
        if (!mensaje.sede) mensaje.sede = cita.sede;
        if (!mensaje.nombre || mensaje.nombre === CONFIG.SIN_DATO) mensaje.nombre = cita.nombre || mensaje.nombre;
      }
      mensaje.sede = mensaje.sede || CONFIG.SIN_DATO;
      mensaje.nombre = mensaje.nombre || CONFIG.SIN_DATO;
      mensaje.cito = leoCasillaComun ? ((cita && cita.cito) || CONFIG.SIN_DATO) : yo.nombre;

      const clave = [mensaje.email, mensaje.fecha, mensaje.hora].join('|');
      if (claves[clave]) return;
      claves[clave] = true;

      if (mensaje.fecha === CONFIG.SIN_DATO || mensaje.hora === CONFIG.SIN_DATO) sinDato++;
      porSede[mensaje.sede] = (porSede[mensaje.sede] || 0) + 1;
      filas.push(mensaje);
    });

    escribirConfirmados_(destino, filas);
    SpreadsheetApp.flush();

    return {
      casilla: yo.email, leidos: mensajes.length, nuevos: filas.length, sinDato: sinDato,
      porSede: porSede, hoja: destino.hoja.getName(), planilla: destino.libro.getName()
    };
  } finally {
    lock.releaseLock();
  }
}

// Copia de citasPorEmail_() de Codigo.gs que lee la planilla de appLibro_()
function appCitasPorEmail_() {
  const citas = {};
  appLibro_().getSheets().forEach(hoja => {
    if (!esHojaCitaciones_(hoja.getName())) return;
    const vis = hoja.getDataRange().getDisplayValues();
    if (vis.length < 2) return;

    const mapa = mapaColumnas_(vis[0]);
    const c = {
      email: buscar_(mapa, ALIAS.email), nombre: buscar_(mapa, ALIAS.nombre),
      fecha: buscar_(mapa, ['fecha entrevista']), hora: buscar_(mapa, ['hora entrevista']),
      zona: buscar_(mapa, ['zona']), sede: buscar_(mapa, ['sede']), cito: buscar_(mapa, ALIAS.cito)
    };
    if (c.email === undefined) return;

    for (let i = 1; i < vis.length; i++) {
      const fila = vis[i];
      const email = celda_(fila, c.email).toLowerCase();
      if (!email) continue;
      citas[email] = {
        nombre: celda_(fila, c.nombre),
        fecha: fechaDeCelda_(celda_(fila, c.fecha)),
        hora: horaDeCelda_(celda_(fila, c.hora)),
        sede: sedeCanonica_(celda_(fila, c.sede)) || CONFIG.ZONAS[zonaCanonica_(celda_(fila, c.zona))] || '',
        cito: celda_(fila, c.cito)
      };
    }
  });
  return citas;
}

// "📩 Organizar confirmaciones en Gmail": etiqueta por sede y archiva
function appOrganizarGmail() {
  const BUSQUEDA = 'subject:(Confirmacion OR Confirmación OR ENTREVISTA) label:inbox';
  const etiquetas = {};
  const etiqueta = nombre => {
    if (!etiquetas[nombre]) {
      etiquetas[nombre] = GmailApp.getUserLabelByName(nombre) || GmailApp.createLabel(nombre);
    }
    return etiquetas[nombre];
  };

  etiqueta(CONFIG.ETIQUETA_GMAIL);
  let total = 0;
  const porSede = {};

  for (let vuelta = 0; vuelta < 20; vuelta++) {
    const hilos = GmailApp.search(BUSQUEDA, 0, 100);
    if (hilos.length === 0) break;

    const grupos = {};
    hilos.forEach(hilo => {
      const sede = sedeDelMensaje_(hilo.getFirstMessageSubject()) || 'Sin sede';
      (grupos[sede] = grupos[sede] || []).push(hilo);
    });

    Object.keys(grupos).forEach(sede => {
      etiqueta(`${CONFIG.ETIQUETA_GMAIL}/${sede}`).addToThreads(grupos[sede]);
      porSede[sede] = (porSede[sede] || 0) + grupos[sede].length;
    });

    GmailApp.moveThreadsToArchive(hilos);
    total += hilos.length;
    if (hilos.length < 100) break;
  }

  return { casilla: citador_().email, total: total, porSede: porSede };
}


/* =========================================================
   AGREGAR POSTULANTES A UNA PESTAÑA
   Tres caminos, todos terminan en appAgregarFilas_():
     - appTraerAts:      los elige del ATS (lo lee, no lo modifica)
     - appAgregarManual: filas pegadas del ATS o una persona cargada a mano
   Copia por nombre de columna (Id, Nombre, Edad, Email, Zona,
   Localidad, Puesto, Disp., Puntaje), al final de la pestaña,
   opcionalmente con fecha y hora. Nunca repite un mail en la pestaña.
   ========================================================= */

// elegidas: [{ a: fila del ATS, e: email }]
function appTraerAts(pestana, elegidas, fecha, hora) {
  const lista = Array.isArray(elegidas) ? elegidas : [];
  const ats = appLeerAts_();
  const ca = ats.col;

  // Fila del ATS de cada mail, por si el ATS cambió desde que se abrió la lista
  const filaAts = {};
  ats.visibles.forEach((vis, i) => {
    const e = celda_(vis, ca.email).toLowerCase();
    if (e && filaAts[e] === undefined) filaAts[e] = i;
  });

  let noEncontradas = 0;
  const personas = [];
  lista.forEach(elegida => {
    const pedido = String((elegida && elegida.e) || '').trim().toLowerCase();
    let i = Number(elegida && elegida.a) - 2;
    if (!(i >= 0 && i < ats.visibles.length && celda_(ats.visibles[i], ca.email).toLowerCase() === pedido)) {
      i = filaAts[pedido];
    }
    if (i === undefined || !pedido) {
      noEncontradas++;
      return;
    }
    const val = ats.valores[i];
    const persona = {};
    Object.keys(ca).forEach(campo => {
      if (ca[campo] !== undefined) persona[campo] = val[ca[campo]];
    });
    personas.push(persona);
  });

  const r = appAgregarFilas_(pestana, personas, fecha, hora);
  r.noEncontradas = noEncontradas;
  return r;
}

// personas: [{ id, nombre, edad, email, zona, localidad, puesto, disp, puntaje }] (texto)
function appAgregarManual(pestana, personas, fecha, hora) {
  const lista = (Array.isArray(personas) ? personas : []).map(p => {
    const limpia = {};
    ['id', 'nombre', 'edad', 'email', 'zona', 'localidad', 'puesto', 'disp', 'puntaje'].forEach(campo => {
      let v = String((p && p[campo]) == null ? '' : p[campo]).trim();
      // Id y Edad como número, igual que las filas que vienen del ATS
      if ((campo === 'id' || campo === 'edad') && /^\d+$/.test(v)) v = Number(v);
      limpia[campo] = v;
    });
    return limpia;
  });
  const r = appAgregarFilas_(pestana, lista, fecha, hora);
  r.noEncontradas = 0;
  return r;
}

function appAgregarFilas_(pestana, personas, fecha, hora) {
  const conFecha = !!(fecha || hora);
  const fh = conFecha
    ? appFechaHora_(fecha, hora, 'Para agregarlos con entrevista completá fecha y hora (o dejá las dos vacías).')
    : null;

  const hoja = appPestana_(pestana);
  const resultado = { agregadas: 0, yaEstaban: 0, sinMail: 0, pestana: hoja.getName(), personas: [] };
  if (!personas.length) return resultado;

  const lock = appBloquear_();
  try {
    const encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getDisplayValues()[0];
    const cd = columnasCitaciones_(encabezados); // las obligatorias del menú
    const destino = appColumnasPostulante_(encabezados);

    // Mails que ya están en la pestaña: no se repiten
    const ultimaFila = hoja.getLastRow();
    const yaEstan = {};
    if (ultimaFila >= 2) {
      hoja.getRange(2, cd.email + 1, ultimaFila - 1, 1).getDisplayValues()
        .forEach(f => { const e = celda_(f, 0).toLowerCase(); if (e) yaEstan[e] = true; });
    }

    const usados = Object.keys(destino).map(k => destino[k])
      .concat([cd.fecha, cd.hora])
      .filter(i => i !== undefined);
    const ancho = Math.max.apply(null, usados) + 1;
    const tz = hoja.getParent().getSpreadsheetTimeZone();
    const nuevas = [];

    personas.forEach(p => {
      const email = String(p.email == null ? '' : p.email).trim();
      if (!appMailValido_(email)) {
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
        if (destino[campo] === undefined || p[campo] === undefined) return;
        const v = campo === 'email' ? email : p[campo];
        fila[destino[campo]] = typeof v === 'string' ? seguro_(v.trim()) : v;
      });
      if (fh) {
        fila[cd.fecha] = Utilities.parseDate(fh.fecha, tz, 'yyyy-MM-dd');
        fila[cd.hora] = fh.hora;
      }

      nuevas.push(fila);
      resultado.personas.push(email + '|' + String(p.nombre == null ? '' : p.nombre).trim());
    });

    if (nuevas.length) {
      const primera = hoja.getLastRow() + 1;
      const faltan = primera + nuevas.length - 1 - hoja.getMaxRows();
      if (faltan > 0) {
        hoja.insertRowsAfter(hoja.getMaxRows(), faltan);
      }

      // La hora va como texto ("09:30") y la fecha como fecha, igual que al asignar
      hoja.getRange(primera, cd.hora + 1, nuevas.length, 1).setNumberFormat('@');
      hoja.getRange(primera, 1, nuevas.length, ancho).setValues(nuevas);
      if (fh) {
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


/* =========================================================
   BUSCAR EN EL ATS (solo lectura)
   ========================================================= */

function appAts() {
  const ats = appLeerAts_();
  const donde = appMailsEnCitaciones_();
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
      ok: appMailValido_(email),
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

function appHojaAts_() {
  const ref = String(APP_ATS.PLANILLA || '').trim();
  if (!ref) {
    throw new Error('Falta configurar la planilla del ATS (APP_ATS.PLANILLA en AppCitaciones.gs). Mientras tanto usá "Pegar del ATS" o "Cargar a mano".');
  }

  const id = (ref.match(/\/d\/([a-zA-Z0-9_-]+)/) || [null, ref])[1];
  let libro;
  try {
    libro = SpreadsheetApp.openById(id);
  } catch (error) {
    throw new Error('Tu cuenta no puede abrir la planilla del ATS (pedí acceso de lectura o revisá APP_ATS.PLANILLA). Mientras tanto usá "Pegar del ATS" o "Cargar a mano".');
  }

  const hoja = libro.getSheetByName(APP_ATS.HOJA);
  if (!hoja) {
    throw new Error(`No encontré la pestaña "${APP_ATS.HOJA}" en la planilla del ATS.`);
  }
  return hoja;
}

function appLeerAts_() {
  const hoja = appHojaAts_();
  const ultimaFila = hoja.getLastRow();
  const ultimaCol = hoja.getLastColumn();
  if (ultimaCol < 1) {
    throw new Error(`La pestaña "${hoja.getName()}" del ATS está vacía.`);
  }

  const col = appColumnasPostulante_(hoja.getRange(1, 1, 1, ultimaCol).getDisplayValues()[0]);
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
function appMailsEnCitaciones_() {
  const donde = {};

  appLibro_().getSheets().forEach(hoja => {
    if (!esHojaCitaciones_(hoja.getName())) return;
    const ultimaFila = hoja.getLastRow();
    if (ultimaFila < 2) return;

    const mapa = mapaColumnas_(hoja.getRange(1, 1, 1, hoja.getLastColumn()).getDisplayValues()[0]);
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
function appMailValido_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}
