# Clippy · Panel de Sala

Panel del equipo de Selección Operativa. Muestra el estado de cada turno de
selección (cuánta gente confirmó, si la sala está vacía o explotada) con los
mismos datos que Clippy manda al grupo de Telegram.

La fuente de verdad es la planilla de Drive. El panel no guarda nada.

```
Planilla "Confirmaciones"
        │
        ├── Apps Script (doGet)  ──► JSON ──► index.html   (este panel)
        └── n8n (Google Sheets)  ──► Code  ──► Telegram     (Clippy)
```

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | El panel. Un solo archivo, sin build. |
| `apps-script.gs` | El endpoint que publica la planilla como JSON. Corre en Drive, se versiona acá. |
| `img/` | Banner y fotos de cada estado. |

## Puesta en marcha

**1. Publicar el Apps Script**

- Abrir la planilla → Extensiones → Apps Script
- Pegar el contenido de `apps-script.gs`
- Correr `probar()` una vez para verificar la salida en el registro
- Implementar → Nueva implementación → Aplicación web
  - Ejecutar como: **Yo**
  - Quién tiene acceso: **Cualquier usuario**
- Copiar la URL que termina en `/exec`

**2. Conectar el panel**

En `index.html`, completar:

```js
const FUENTE = 'https://script.google.com/macros/s/AKfy.../exec';
```

**3. Cargar las imágenes**

```js
const BANNER = 'img/banner.jpg';
```

Y en `ESCALA`, el campo `foto` de cada estado. Cuadradas, mínimo 200×200.
Si falta una, el panel cae al emoji sin romperse.

**4. Publicar**

GitHub Pages sobre la rama `main`, o Vercel apuntando a la raíz del repo.

## La escala

| Ocupación | Estado |
|---|---|
| menos de 40% | paspando moscas |
| 40–75% | apenas movido |
| 75–115% | sala viva |
| más de 115% | explotado |

El cupo es 40 y está definido en `apps-script.gs` (`CUPO`). El panel usa la
etiqueta que viene en el JSON, así que **el cálculo vive en un solo lugar**:
si cambia el cupo o los cortes, se toca el Apps Script y nada más.

Ojo con el Code node de n8n, que tiene su propia copia de la escala. Si
cambiás una, cambiá la otra o Telegram y el panel van a decir cosas distintas
del mismo turno.

## Privacidad

El endpoint es público: cualquiera con la URL puede abrirlo. Por eso el Apps
Script devuelve **solo agregados** — cantidad por turno, nunca nombres ni
mails. Si algún día se agrega un campo, revisar que siga siendo así.

## Notas

- El panel se refresca solo cada 60 segundos.
- Si el `fetch` falla por CORS, reintenta automáticamente por JSONP.
- Si no hay conexión con el origen, muestra los datos de ejemplo en lugar de
  una pantalla rota. Se reconoce porque la última lectura deja de avanzar.
- Los duplicados por mail se descuentan: una persona ocupa un solo lugar por
  turno.
