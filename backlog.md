# Backlog

## Item 1: Validación de relevancia con Gemini AI Studio (API)

Integrar una etapa de validación posterior al primer filtro del crawler usando la API de Gemini AI Studio, apuntando a un system instruction/Gem ya definido por el equipo.  
Objetivo: decidir si un post ya recolectado realmente nos interesa para comentar bajo nuestro perfil.

### Resultado esperado
- Cada post que pase el primer filtro debe recibir una decisión adicional de interés (`interesa` / `no_interesa`) basada en Gemini.
- La decisión debe quedar registrada junto al post para trazabilidad.
- El pipeline debe permitir continuar aunque falle la llamada al servicio (fallback controlado).

## Item 2: Categorización de “peso” del autor del post

Agregar clasificación del autor del post para estimar si es un perfil “peso pesado” o no, usando:
- Título/rol (ej.: `CEO`, `CTO`, `VP`, etc.).
- Cantidad de followers.

### Resultado esperado
- Definir categorías de peso del autor (por ejemplo: `high`, `medium`, `low`) con reglas explícitas.
- Persistir la categoría calculada por post/autor dentro del flujo normalizado.
- Dejar preparado el dato para priorizar futuros comentarios o estrategias de interacción.
