# Backlog

## BL-002: Categorizacion de "peso" del autor del post

Agregar clasificacion del autor del post para estimar si es un perfil "peso pesado" o no, usando:

- Titulo/rol (ej.: `CEO`, `CTO`, `VP`, etc.).
- Cantidad de followers.

### Resultado esperado

- Definir categorias de peso del autor (por ejemplo: `high`, `medium`, `low`) con reglas explicitas.
- Persistir la categoria calculada por post/autor dentro del flujo normalizado.
- Dejar preparado el dato para priorizar futuros comentarios o estrategias de interaccion.

## BL-003: Robustez operativa del harvester ante intervencion del usuario y fragilidad del feed

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

## BL-007: Mini tutorial dentro del plugin para configurar Gemini / Google AI Studio

Agregar una guia breve y accionable dentro del propio plugin para ayudar al operador a configurar la integracion con Gemini sin depender del README ni de conocimiento previo sobre Google AI Studio.

Caso detectado:

- Hoy el popup expone los campos `API key`, `Model` y `System instruction`, pero no explica dentro de la extension que pasos seguir, donde conseguir cada valor ni en que orden probar la configuracion.

### Resultado esperado

- Incluir una mini tutorial visible desde el popup o una ayuda inline en la seccion de Gemini setup.
- Explicar paso a paso como:
  - entrar a Google AI Studio
  - crear o ubicar la API key
  - identificar que valor pegar en `API key`
- que modelo usar como default inicial
- de donde sale la `System instruction` y cuando conviene cambiarla
- Dejar claro un flujo de prueba corto para validar que la configuracion funciona antes de correr una exportacion grande.
- Mantener el contenido breve, orientado a operador, y actualizado junto con cualquier cambio futuro en los campos del popup.

## BL-014: Convertir el enriquecimiento en un proceso incremental visible y dejar `raw` como descarga simple

Hoy el flujo de export mezcla dos cosas que conviene separar mejor:

- `Export raw` deberia seguir siendo solo una descarga de lo que ya tenemos en memoria.
- El enriquecimiento deberia ser una operacion que se inicia como proceso, actualiza el `JSON` en el tiempo y permite inspeccionar el estado parcial desde la UI sin obligar a bajar el archivo.

Caso detectado:

- Hoy no se puede ver la data enriquecida mientras se esta procesando sin descargarla primero.
- Eso hace dificil depurar estados intermedios, errores por autor, progresos parciales o datos que se van completando durante la corrida.
- El concepto de `export enriched` hoy suena mas a descarga que a proceso, y eso no encaja con el flujo operativo que necesitamos.

### Resultado esperado

- Separar el contrato entre:
  - descarga raw inmediata de la data actual
  - enriquecimiento como proceso iniciable y observable
- Permitir que el `JSON` enriquecido se vaya actualizando mientras corre el proceso.
- Exponer una vista de debug o status del enriquecimiento para ver el estado actual sin necesidad de descargar el archivo.
- Mantener la descarga final como paso opcional separado, no como unica forma de inspeccionar el enriquecimiento.
- Revisar nombres, acciones y copy del popup/panel para que reflejen mejor esa diferencia de comportamiento.

## BL-015: Redisenar `popup.html` para que sea mas comodo, alto y util como superficie de configuracion

El popup actual funciona, pero queda chico y apretado para operar con comodidad.

Caso detectado:

- La vista del popup se siente demasiado compacta para leer, copiar y revisar configuracion con tranquilidad.
- El layout no acompaña bien el trabajo de debug ni la inspeccion de estado.
- Falta una presentacion mas alta y mas respirada, especialmente para secciones como Gemini setup y herramientas de debug.

### Resultado esperado

- Redisenar `popup.html` para darle una apariencia mas alargada y comoda de usar.
- Mejorar la jerarquia visual de secciones, copiado y estados de debug.
- Evitar que la UI dependa de mucho scroll vertical corto o bloques demasiado comprimidos.
- Mantener la popup como una superficie de configuracion y debug, pero mas legible y mas practica para uso repetido.
- Ajustar estilos y spacing para que la experiencia sea consistente en ventanas chicas sin perder densidad de informacion.

## BL-012: Refactor estructural de `src/content/linkedin/content.js` con single responsibility real

Refactorizar `src/content/linkedin/content.js`, que hoy concentra demasiadas responsabilidades y se volvio un archivo gigante, dificil de mantener, depurar y testear.

Contexto:

- El archivo mezcla concerns de crawling, scanning del feed, extraccion, resolucion de permalink, UI del panel, logging, mensajeria con background, estado local y utilidades varias.
- Esa mezcla hace dificil razonar sobre bugs, aislar responsabilidades y detectar regresiones.
- Queremos aplicar single responsibility no solo a funciones, sino tambien a:
  - folders
  - archivos
  - objetos / modulos

### Resultado esperado

- Dividir `src/content/linkedin/content.js` en modulos pequenos y coherentes por responsabilidad.
- Definir una estructura de carpetas alineada con el dominio, por ejemplo separando claramente:
  - crawler / run-loop
  - scan / DOM feed discovery
  - extraction / normalization
  - permalink resolution
  - panel UI
  - messaging / bridge con background
  - logging / telemetry
  - shared helpers
- Evitar archivos "cajon desastre" o carpetas armadas por conveniencia tecnica en vez de responsabilidad real.
- Reducir el tamaño y complejidad ciclomática del entrypoint, dejando `content.js` como composicion/orquestacion liviana.
- Mantener el comportamiento actual sin regresiones funcionales.
- Agregar o ajustar tests donde haga falta para cubrir la nueva modularizacion y proteger el refactor.

