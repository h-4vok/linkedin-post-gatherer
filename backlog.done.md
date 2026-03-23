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
