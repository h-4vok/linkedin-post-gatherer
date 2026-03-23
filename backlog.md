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

## BL-005: Normalizar formatter/linter en package.json y rules of engagement

Resolver la desalineacion actual entre documentacion y tooling: el repo exige `npm run lint`, `npm run format` y `npm run format:write` en README, checklist y repo rules, pero esos scripts no existen hoy en `package.json`.

### Resultado esperado
- Agregar `lint`, `format` y `format:write` a `package.json` con tooling real y operativo.
- Dejar alineados `README.md`, `REPO_WORK_RULES.md`, `DELIVERY_CHECKLIST.md` y cualquier otro rule of engagement con los comandos efectivamente soportados.
- Definir si esos checks deben correr en `pre-push`, `pre-commit` o solo en CI, y dejarlo implementado/documentado.
- Asegurar que la merge gate documentada coincide con la automatizacion real del repo.

## BL-006: Export de posts ignorados para debugging del extractor

Agregar una capacidad de export o dump de los posts que el harvester detecta pero termina ignorando, para poder revisar despues los casos descartados y depurar mejor cambios de DOM o heuristicas demasiado agresivas.

### Resultado esperado
- Persistir temporalmente o acumular durante la corrida una muestra util de posts ignorados junto con su razon de descarte (`missing-author`, `suggested`, `promoted`, u otras futuras).
- Poder exportar esos posts ignorados en un `JSON` separado o como bloque diferenciado de debugging.
- Incluir suficiente contexto para diagnostico, por ejemplo:
  - razon de descarte
  - `textPreview`
  - fragmento HTML truncado o metadata relevante
- Mantener esta capacidad orientada a debugging, sin mezclar los posts ignorados con el export normal `raw` o `enriched`.

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

## BL-008: Conservar mas historial en el activity log

Revisar el comportamiento actual del activity log porque hoy se limpia o rota demasiado rapido, y despues de aproximadamente `4` items deja de mostrar historial util para seguimiento de la corrida.

Caso detectado:
- El operador pierde visibilidad de eventos recientes porque el log visible se recorta enseguida.
- Esto dificulta entender que hizo el crawler, cuando entro en espera, si hubo reintentos o en que punto cambio el estado.

### Resultado esperado
- Aumentar o rediseñar la retencion del activity log para conservar suficiente historial visible durante una corrida normal.
- Definir una politica explicita de retencion:
  - cantidad maxima de items visibles
  - si el recorte aplica solo a UI o tambien al estado en memoria
- si conviene agregar scroll interno, paginacion o acciones de clear manual
- Asegurar que el operador pueda inspeccionar una secuencia razonable de eventos sin perder contexto por rotacion temprana.
- Mantener el log legible y sin crecimiento descontrolado durante corridas largas.

## BL-009: Mostrar actividad de AI validation en el activity log

Agregar visibilidad en el activity log cuando la validacion con AI esta habilitada y el sistema esta usando Gemini para filtrar o clasificar posts.

Caso detectado:
- Hoy el operador no necesariamente ve en el activity log que el filtro con AI esta corriendo, avanzando, esperando por rate limit o fallando con fallback.
- Eso vuelve opaco el comportamiento del pipeline cuando la cola de AI influye en el resultado exportado.

### Resultado esperado
- Registrar en el activity log eventos relevantes del flujo de AI validation, por ejemplo:
  - inicio de procesamiento
  - post en validacion
  - decision recibida
  - retry o backoff por cuota/rate limit
  - fallback a `unknown`
  - fin o pausa de la cola
- Hacer que los mensajes sean entendibles para operador, no solo tecnicos para debugging interno.
- Mantener alineados el activity log, el estado visible de AI y el resultado persistido en `interest_validation`.
- Evitar ruido excesivo si la corrida procesa muchos posts, definiendo un nivel de detalle razonable.

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

## BL-013: Recuperar deteccion correcta de `reposted_by` en reposts del feed

Revisar y corregir la deteccion de reposts en el extractor del feed, porque hoy hay evidencia de posts compartidos/reposteados que terminan normalizados como si fueran posts originales.

Caso detectado:
- Algunos posts que parecen ser reposts terminan con `is_repost: false` y `reposted_by: null`.
- En esos casos puede terminar persistiendose un permalink valido pero de una superficie distinta del post compartido, enmascarando el problema real de clasificacion.

### Resultado esperado
- Detectar correctamente cuando un item del feed es un repost/share y no un post original.
- Poblar `reposted_by` con el nombre correcto de quien compartio el post cuando LinkedIn lo exponga.
- Mantener `is_repost` alineado con `reposted_by` y con la semantica real del item en el feed.
- Agregar fixtures/tests que cubran al menos:
  - repost clasico con texto tipo `X reposted this`
  - variantes actuales del markup de LinkedIn para shares/reposts
  - casos sociales tipo `supports this` o `loves this` que no deben confundirse con repost
