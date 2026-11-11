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
