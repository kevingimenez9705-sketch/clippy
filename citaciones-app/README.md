# App de Citaciones

La planilla **Citaciones Tortus** como app web. Hace lo mismo que la planilla y su
menú 📞 Citar, pero con filtros, fecha/hora en bloque y la carga de postulantes
directo desde el ATS.

**La base sigue siendo la planilla.** La app lee y escribe las mismas pestañas
(`Citaciones-<selector>` y `Confirmados`) y las mismas columnas. No hay n8n ni
Supabase en el medio.

```
ATS - Postulaciones ──(solo lectura)──┐
                                       ▼
Planilla "Citaciones Tortus"  ◄──── App (Apps Script, con la cuenta de cada uno)
        │
        ├── menú 📞 Citar de la planilla     (igual que hoy)
        ├── Botonera ?vista=citar/confirmados (igual que hoy)
        ├── n8n "Ruta - Citaciones e iCheck"  (igual que hoy, solo lee)
        └── panel Clippy / Oficina            (igual que hoy, solo leen)
```

## Qué hace

| Sección | Qué hace | Con qué función |
|---|---|---|
| **Traer del ATS** | Busca en "ATS - Postulaciones" (filtros, más nuevos primero) y agrega los elegidos al final de tu pestaña, con fecha y hora opcionales | `appAts` (solo lee el ATS) y `appTraerAts` (nueva) |
| **Bandeja** | Lista la pestaña con filtros (zona, puesto, puntaje, disponibilidad, estado) y búsqueda | `appListar` (nueva, solo lee) |
| Asignar fecha y hora | A todas las filas elegidas de una vez. Escribe solo *Fecha entrevista* y *Hora entrevista* | `appAsignar` (nueva) |
| Citar | Manda los mails desde tu casilla y marca ENVIADO | `citar` (la de la Botonera, sin cambios) |
| Eliminar filas ENVIADO | Igual que 🗑️ del menú | `eliminarEnviadas` (sin cambios) |
| **Confirmados** | Turnos por día, hora y sede, con nombres, repetidos y sin fecha | `appConfirmados` (nueva, solo lee) |
| Recopilar de mi casilla | Igual que 📋 del menú | `recopilar` (sin cambios) |
| Organizar Gmail | Igual que 📩 del menú | `organizarGmail` (sin cambios) |

Estados de cada fila (los mismos criterios que usa el menú para decidir a quién citar):

- **Sin fecha**: le falta fecha u hora de entrevista.
- **Lista para citar**: tiene mail, fecha, hora y zona reconocida (CABA, Norte, Sur, Oeste).
- **Zona no reconocida**: el menú no la cita (ej. "La Plata", "Rosario").
- **Enviada** / **Error al enviar** / **Sin mail**.

Cuidados que trae:

- Traer del ATS copia las columnas por nombre (Id, Nombre, Edad, Email, Zona,
  Localidad, Puesto, Disp., Puntaje) y nunca repite un mail en la pestaña. Oculta
  a quien ya está en alguna pestaña de citaciones y avisa antes de agregarlo a
  otra. Los "sin email · Id …" del ATS no se pueden elegir. El ATS no se modifica.

- No cambia la fecha de una citación ya enviada.
- Si alguien borró filas mientras tenías la app abierta, busca a cada persona por
  mail + nombre antes de escribir; nunca escribe en la fila de otro.
- Antes de citar muestra el resumen por sede y tu cupo de mails del día; si lo
  supera, no deja enviar. Manda en tandas de 50 para no pasar los 6 minutos de
  Apps Script.
- Al borrar filas ENVIADO avisa si alguna salió hace menos de 35 minutos (n8n lee
  la planilla cada 30 para el seguimiento).

## Instalación (10 minutos)

Va en el proyecto de Apps Script **Botonera Citaciones** (el que ya tiene
`Codigo.gs`, `Citacion.html`, `Funciones.gs` y `Botonera.html`). El script de la
planilla no se toca.

1. Abrir el proyecto **Botonera Citaciones** en script.google.com.
2. **+ → Secuencia de comandos** → nombre `AppCitaciones` → pegar `AppCitaciones.gs`.
3. **+ → HTML** → nombre `App` → pegar `App.html`.
4. Arriba de `AppCitaciones.gs`, pegar el link de la planilla del ATS
   ("Tareas grupales/zonas") en `APP_ATS.PLANILLA`:

   ```js
   const APP_ATS = {
     PLANILLA: 'https://docs.google.com/spreadsheets/d/<id>/edit',
     HOJA: 'ATS - Postulaciones'
   };
   ```
5. En `Funciones.gs`, dentro de `doGet`, agregar **una línea** después de la primera:

   ```js
   function doGet(e) {
     const pedida = e && e.parameter ? e.parameter.vista : '';
     if (pedida === 'app') return appPagina_();   // ← esta
     ...
   ```

   Así `?vista=citar` y `?vista=confirmados` siguen mostrando la Botonera de siempre.
6. **Implementar → Gestionar implementaciones → ✏️ → Versión: Nueva versión →
   Implementar.** La URL `/exec` no cambia.
7. Abrir `https://script.google.com/macros/s/<id>/exec?vista=app`.

No hay permisos nuevos para aceptar: usa los mismos servicios (Sheets, Gmail,
envío de mails) que la Botonera.

## Acceso

- Corre con la cuenta de quien la abre (como la Botonera): cada uno cita desde su
  Gmail y recopila de su casilla.
- Solo funciona para quien tiene permiso de edición en la planilla (y de lectura
  en la del ATS para "Traer del ATS"). El link solo no alcanza para ver datos.
- Se puede embeber en una página interna (Vercel) con un `<iframe>`: la
  implementación ya lo permite.

## Probar sin riesgo

Antes de usarla con postulantes reales:

1. Crear una pestaña `Citaciones-Prueba` con los mismos encabezados (copiar la fila 1).
2. Dejar 2 o 3 filas con **tu propio mail** y zona `Norte`.
3. En la app: elegir `Citaciones-Prueba` → asignar fecha y hora → citar.
   Para probar Traer del ATS, elegir `Citaciones-Prueba` como destino y agregar
   a alguien sin citarlo (después se borra la pestaña).
4. Verificar que te llegó el mail, que la fila quedó ENVIADO y que el menú de la
   planilla ve lo mismo. Después borrar la pestaña.

## Límites (los mismos de hoy)

- Mails por día: el cupo de tu cuenta (se muestra arriba a la derecha).
- Cada acción tarda 1–3 segundos: es Apps Script leyendo la planilla.
- La recopilación automática cada 10 minutos se sigue activando desde el menú
  de la planilla.

## Si cambia la planilla

La app encuentra las columnas por nombre, igual que el menú. **No renombrar** las
pestañas `Citaciones-…` ni `Confirmados`, ni los encabezados `Email`, `Zona`,
`Puesto`, `Fecha entrevista`, `Hora entrevista`, `Estado envío`, `Fecha envío`:
de esos nombres dependen la app, el menú y el flujo de n8n.
