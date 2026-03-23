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
