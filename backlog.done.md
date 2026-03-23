# Done Backlog

## BL-001: Validacion de relevancia con Gemini AI Studio (API)

Estado: terminado.

Integrar una etapa de validacion posterior al primer filtro del crawler usando la API de Gemini AI Studio, apuntando a un system instruction/Gem ya definido por el equipo.
Objetivo: decidir si un post ya recolectado realmente nos interesa para comentar bajo nuestro perfil.

### Resultado esperado

- Cada post que pase el primer filtro debe recibir una decision adicional de interes basada en Gemini.
- La decision debe quedar registrada junto al post para trazabilidad.
- El pipeline debe permitir continuar aunque falle la llamada al servicio (fallback controlado).

## BL-004: Recuperar extraccion del link/permalink del post

Estado: terminado.

Revisar y restaurar la extraccion del link canonico del post en el flujo normalizado del harvester.

### Resultado entregado

- Se recupero la extraccion del permalink en el flujo normalizado.
- El export final dejo de producir `link: null` de forma sistematica en la corrida validada.
- Se endurecio la resolucion del menu flotante de LinkedIn y el manejo del clipboard.
- Se elimino el patron alternado de exito/fallo causado por el cierre del menu via toggle del mismo overflow button.
- Se agrego y actualizo cobertura de tests para proteger el comportamiento del extractor.


## BL-005: Normalizar formatter/linter en package.json y rules of engagement

Estado: terminado.

Resolver la desalineacion entre documentacion y tooling para que el repo tenga scripts operativos de lint/format y una merge gate coherente.

### Resultado entregado

- Se agregaron `lint`, `format` y `format:write` a `package.json`.
- Se dejo documentado el gate de `pre-push` con `npm run prepush`.
- Se alinearon `README.md`, `REPO_WORK_RULES.md`, `DELIVERY_CHECKLIST.md` y la configuracion de tooling asociada.

## BL-006: Export de posts ignorados para debugging del extractor

Estado: terminado.

Agregar una capacidad de export o dump de los posts que el harvester detecta pero termina ignorando, para poder revisar despues los casos descartados y depurar mejor cambios de DOM o heuristicas demasiado agresivas.

### Resultado entregado

- Se persistio temporalmente una muestra util de posts ignorados junto con su razon de descarte.
- Se agrego un preview en el popup para inspeccionarlos sin descargar el archivo normal.
- Se incluyo suficiente contexto para diagnostico, orientado a debugging y separado del export raw/enriched.

## BL-008: Conservar mas historial en el activity log

Estado: terminado.

Revisar el comportamiento actual del activity log porque hoy se limpia o rota demasiado rapido, y despues de aproximadamente `4` items deja de mostrar historial util para seguimiento de la corrida.

### Resultado entregado

- Se aumento la retencion del activity log a `500` eventos maximos.
- Se agrego una accion de copia simple junto al titulo de `Activity`.
- Se mantuvo scroll interno para conservar una secuencia util de eventos sin perder contexto por rotacion temprana.

## BL-009: Mostrar actividad de AI validation en el activity log

Estado: terminado.

Agregar visibilidad en el activity log cuando la validacion con AI esta habilitada y el sistema esta usando Gemini para filtrar o clasificar posts.

### Resultado entregado

- Se registraron eventos relevantes del flujo de AI validation en el activity log del panel.
- Se cubrieron inicio de procesamiento, decisions, backoff por rate limit, fallback a `unknown` y fin de corrida.
- Se mantuvieron los logs tecnicos del service worker como respaldo, pero el panel paso a ser la fuente humana principal de trazabilidad.
## BL-010: Captura manual del DOM del feed desde el popup para regenerar fixtures de debugging

Estado: terminado.

Agregar en el popup del plugin una accion manual orientada a debugging que permita extraer el DOM relevante del feed de LinkedIn y mostrarlo inmediatamente al operador, para poder copiarlo y generar nuevos fixtures o revisar drift de selectores.

### Resultado esperado

- Agregar un boton accesible desde el popup del plugin, no necesariamente desde el panel inyectado.
- Al accionarlo:
  - si encuentra el feed, abrir una vista tipo popup/modal con el dump serializado del feed listo para copiar
  - si no encuentra el feed, mostrar un mensaje claro indicando que el feed no fue encontrado
- El dump debe incluir suficiente informacion para debugging y para regenerar fixtures del test de extractor, por ejemplo:
  - metadata basica de la pagina
  - muestra de `listitem`
  - `textPreview`
  - HTML truncado de cada item
  - metadata del contenedor/feed
- Mantener esto como herramienta de debugging, no como parte del flujo normal de export.

## BL-011: Vista previa del JSON final dentro del browser sin descargarlo

Estado: terminado.

Agregar una forma de inspeccionar dentro del browser el `JSON` final que hoy se descarga como archivo, para los casos en que el operador solo quiere revisarlo o copiar fragmentos sin bajar el archivo.

### Resultado esperado

- Exponer desde el popup una accion para abrir una vista previa del `JSON` resultante generado por la extension.
- La vista puede ser un popup/modal simple y copiable.
- Debe servir al menos para:
  - ver el `JSON raw`
  - copiarlo parcial o completamente
- Idealmente dejar preparado el camino para mostrar tambien el `JSON enriched` cuando exista y este listo, sin obligar a descargarlo primero.
- Mantener la descarga tradicional como opcion separada; la vista previa no la reemplaza.

## BL-013: Recuperar deteccion correcta de `reposted_by` en reposts del feed

Estado: terminado.

Revisar y corregir la deteccion de reposts en el extractor del feed, porque habia evidencia de posts compartidos/reposteados que terminaban normalizados como si fueran posts originales.

### Resultado entregado

- Se corrigio la deteccion de reposts para no depender solo de la frase literal `X reposted this`.
- Se mejoro la resolucion de `author`, `reposted_by` e `is_repost` usando senales del header social y fallback explicito cuando el DOM no alcanza.
- Se evitaron falsos positivos para interacciones sociales como `likes this`, `supports this`, `loves this` y `found this insightful`.
- Se agregaron y ampliaron smoke tests para cubrir repost clasico, variantes mas cercanas al DOM actual y casos no-repost.
- Se incorporo un fixture real adicional del feed extraido de LinkedIn para proteger el extractor frente a drift de markup.


