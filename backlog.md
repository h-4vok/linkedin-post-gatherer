# Backlog

## Item 1: Validacion de relevancia con Gemini AI Studio (API)

Integrar una etapa de validacion posterior al primer filtro del crawler usando la API de Gemini AI Studio, apuntando a un system instruction/Gem ya definido por el equipo.
Objetivo: decidir si un post ya recolectado realmente nos interesa para comentar bajo nuestro perfil.

### Resultado esperado
- Cada post que pase el primer filtro debe recibir una decision adicional de interes (`interesa` / `no_interesa`) basada en Gemini.
- La decision debe quedar registrada junto al post para trazabilidad.
- El pipeline debe permitir continuar aunque falle la llamada al servicio (fallback controlado).

## Item 2: Categorizacion de "peso" del autor del post

Agregar clasificacion del autor del post para estimar si es un perfil "peso pesado" o no, usando:
- Titulo/rol (ej.: `CEO`, `CTO`, `VP`, etc.).
- Cantidad de followers.

### Resultado esperado
- Definir categorias de peso del autor (por ejemplo: `high`, `medium`, `low`) con reglas explicitas.
- Persistir la categoria calculada por post/autor dentro del flujo normalizado.
- Dejar preparado el dato para priorizar futuros comentarios o estrategias de interaccion.

## Item 3: Robustez operativa del harvester ante intervencion del usuario y fragilidad del feed

Investigar y endurecer el proceso de crawling, que hoy parece sensible a interacciones manuales del usuario y posiblemente a otras condiciones fragiles del feed de LinkedIn.

Caso detectado:
- Un scroll manual del usuario con la rueda del mouse puede interrumpir o dejar aparentemente colgado el proceso de crawling.

### Resultado esperado
- Documentar explicitamente que el crawler es fragil ante intervenciones manuales mientras corre.
- Definir el comportamiento esperado cuando el usuario hace scroll manual:
  - interrumpir la corrida de forma explicita, o
  - recuperarse sin quedar en estado ambiguo.
- Investigar si hay otras fuentes de fragilidad adicionales en el proceso, por ejemplo:
  - cambios de scroll container
  - waits largos sin feedback suficiente
  - mutaciones del DOM que no disparan recuperacion
  - perdida de progreso aparente aunque el proceso siga vivo
- Dejar trazabilidad suficiente en logs/UI para distinguir entre:
  - crawler activo
  - crawler esperando
  - crawler interrumpido por el usuario
  - crawler detenido por fragilidad o estancamiento

## Item 4: Recuperar extraccion del link/permalink del post

Revisar y restaurar la extraccion del link canonico del post en el flujo normalizado del harvester.

Caso detectado:
- El campo `link` hoy queda en `null` en el flujo actual, por lo que la extraccion del permalink no esta implementada o se perdio en algun cambio previo.

### Resultado esperado
- Identificar el selector o anchor correcto del permalink del post en LinkedIn.
- Extraer y persistir el link canonico en el campo `link` del item normalizado.
- Verificar que el export raw y enriched conserven el permalink correctamente.
- Agregar cobertura de tests para evitar que vuelva a quedar en `null` sin detectar la regresion.
