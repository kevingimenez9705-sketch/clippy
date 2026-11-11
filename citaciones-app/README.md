# Tablero de Citaciones

La planilla **Citaciones Tortus** como app web: bandeja con filtros, fecha y hora
en bloque, citar, confirmados y carga de postulantes (desde el ATS, pegando filas
o a mano).

**La base sigue siendo la planilla.** El tablero lee y escribe las mismas
pestañas (`Citaciones-<selector>` y `Confirmados`) y columnas, con las mismas
reglas del menú 📞 Citar. No hay n8n ni Supabase en el medio.

```
ATS - Postulaciones ──(solo lectura, opcional)──┐
                                                 ▼
Planilla "Citaciones Tortus"  ◄──── Tablero (Apps Script de la planilla,
        │                                      con la cuenta de cada uno)
        ├── menú 📞 Citar                    (igual que hoy)
        ├── n8n "Ruta - Citaciones e iCheck"  (igual que hoy, solo lee)
        └── panel Clippy / Oficina            (igual que hoy, solo leen)
```

## Qué hace

| Sección | Qué hace |
|---|---|
| **Bandeja** | Lista la pestaña con filtros (zona, puesto, puntaje, disponibilidad, estado) y búsqueda. Asigna fecha y hora a muchas filas juntas. Cita las elegidas. Elimina filas ENVIADO. |
| **＋ Agregar postulantes** | Suma gente al final de la pestaña, con fecha y hora opcionales: **Buscar en el ATS** (lo lee directo), **Pegar del ATS** (copiar filas de la planilla y pegarlas) o **Cargar a mano** (formulario). Nunca repite un mail en la pestaña. |
| **Confirmados** | Turnos por día, hora y sede, con nombres, repetidos y sin fecha. Recopilar de mi casilla y organizar Gmail (lo mismo que el menú). |

Estados de cada fila (los mismos criterios que usa el menú para decidir a quién citar):
**Sin fecha**, **Lista para citar** (mail + fecha + hora + zona CABA/Norte/Sur/Oeste),
**Zona no reconocida** (el menú no la cita), **Enviada**, **Error al enviar**, **Sin mail**.

Cuidados que trae:

- No cambia la fecha de una citación ya enviada.
- Si alguien borró filas mientras tenías el tablero abierto, busca a cada persona
  por mail + nombre antes de escribir; nunca escribe en la fila de otro.
- Antes de citar muestra el resumen por sede y tu cupo de mails del día. Manda en
  tandas de 50 para no pasar los 6 minutos de Apps Script.
- Al borrar filas ENVIADO avisa si alguna salió hace menos de 35 minutos (n8n lee
  la planilla cada 30 para el seguimiento).
- Si el ATS no se puede abrir con tu cuenta, lo dice y ofrece pegar o cargar a mano.

## Instalación (en el proyecto de la planilla)

Va en el Apps Script **de la propia planilla** Citaciones Tortus. Es de la
cuenta de la empresa, así que funciona con los mails corporativos.

1. Abrir la planilla → **Extensiones → Apps Script**.
2. **+ → Secuencia de comandos** → nombre `AppCitaciones` → pegar `AppCitaciones.gs`.
3. **+ → HTML** → nombre `App` → pegar `App.html`.
4. Arriba de `AppCitaciones.gs`, pegar el link de la planilla del ATS en
   `APP_ATS.PLANILLA` (si se deja vacío, queda solo pegar / cargar a mano).
5. Guardar (Ctrl+S).

### Abrirlo como ventana dentro de la planilla (sin implementar nada)

En `Codigo.gs`, dentro de `onOpen()`, sumar una línea al menú:

```js
    .addItem('🖥️ Abrir tablero', 'abrirTablero')
```

Recargar la planilla → menú **📞 Citar → 🖥️ Abrir tablero**.

### Abrirlo como página web

1. Buscar en qué archivo del proyecto está `function doGet` (el del panel Clippy,
   p. ej. `PanelB.gs`) y agregar **como primera línea adentro**:

   ```js
   if (e && e.parameter && e.parameter.vista === 'app') return appPagina_();
   ```

   (Si dice `function doGet()` sin `e`, cambiarlo a `function doGet(e)`.)
   Si el proyecto no tiene ningún `doGet`, crear un archivo `Entrada.gs` con
   `function doGet(e) { return appPagina_(); }`.
2. **Implementar → Nueva implementación → ⚙️ Aplicación web**:
   - Ejecutar como: **Usuario que accede a la aplicación web**
   - Quién tiene acceso: **Cualquier usuario de la organización**
3. Abrir la URL nueva con `?vista=app` al final.

La implementación que ya usa el panel Clippy no se toca: queda en su versión.

## Acceso

- Corre con la cuenta de quien lo abre: cada uno cita desde su mail y recopila
  de su casilla, como con el menú.
- Necesita permiso de edición en la planilla (y de lectura en la del ATS para
  "Buscar en el ATS").

## Probar sin riesgo

1. Crear una pestaña `Citaciones-Prueba` con la fila 1 de encabezados copiada.
2. En el tablero: **Agregar postulantes → Cargar a mano**, destino
   `Citaciones-Prueba`, con **tu propio mail** y zona `Norte`, con fecha y hora.
3. Citar desde la bandeja. Verificar el mail, que la fila quede ENVIADO y que el
   menú vea lo mismo. Después borrar la pestaña.

## Si cambia la planilla

El tablero encuentra las columnas por nombre, igual que el menú. **No renombrar**
las pestañas `Citaciones-…` ni `Confirmados`, ni los encabezados `Email`, `Zona`,
`Puesto`, `Fecha entrevista`, `Hora entrevista`, `Estado envío`, `Fecha envío`:
de esos nombres dependen el tablero, el menú y el flujo de n8n.

## También funciona en la Botonera

`AppCitaciones.gs` + `App.html` funcionan igual en el proyecto "Botonera
Citaciones" (con la línea `if (pedida === 'app') return appPagina_();` en su
`doGet`). Ahí corre con cuentas personales; para las corporativas, usar el
proyecto de la planilla.
