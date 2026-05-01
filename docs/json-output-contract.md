# Contrato de salida JSON (`linkedin_crawl_result_*.json`)

## Alcance

Este documento define el contrato del JSON exportado por la extensión para compartir con otros sistemas.

- Patrón de nombre de archivo: `linkedin_crawl_result_YYYYMMDD-HHMMSS.json` (`src/shared/export.js:41`)
- Formato del archivo: **array JSON** de items (`src/shared/export.js:33`)
- Modos de export:
  - **Raw**: campos base (`src/shared/export.js:20`)
  - **Enriched**: campos base + señal de autor (`src/shared/export.js:24`)

## Estructura general

```json
[
  {
    "link": "https://www.linkedin.com/feed/update/...",
    "author": "Nombre Apellido",
    "author_profile_url": "https://www.linkedin.com/in/...",
    "reposted_by": null,
    "post_text": "Texto del post...",
    "posted_time": "4h",
    "is_repost": false,
    "type": "organic",
    "extracted_at": "2026-04-30T18:22:11.000Z",
    "comment_count": 12,
    "comment_count_text": "12 comments",
    "reaction_count": 1200,
    "reaction_count_text": "1.2K reactions",
    "interest_validation": {
      "status": "pending",
      "source": "gemini",
      "attempts": 0,
      "validated_at": null,
      "error": null,
      "retry_after_ms": null,
      "retry_after_until": null
    }
  }
]
```

## Campos base (Raw y Enriched)

| Campo                 | Tipo                | Nullable | Descripción                                     |
| --------------------- | ------------------- | -------- | ----------------------------------------------- |
| `link`                | `string`            | Sí       | URL del post.                                   |
| `author`              | `string`            | Sí       | Autor del post (normalizado por extractor).     |
| `author_profile_url`  | `string`            | Sí       | URL de perfil del autor (`/in/` o `/company/`). |
| `reposted_by`         | `string`            | Sí       | Actor que reposteó/shared, si aplica.           |
| `post_text`           | `string`            | Sí       | Texto del post extraído del bloque expandible.  |
| `posted_time`         | `string`            | Sí       | Tiempo relativo de LinkedIn (ej. `4h`, `2w`).   |
| `is_repost`           | `boolean`           | No       | Marca si es repost/share detectado.             |
| `type`                | `string`            | No       | Tipo de post. En MVP: `"organic"`.              |
| `extracted_at`        | `string` (ISO-8601) | Sí       | Timestamp de extracción.                        |
| `comment_count`       | `number`            | Sí       | Conteo parseado de comentarios.                 |
| `comment_count_text`  | `string`            | Sí       | Texto original de comentarios detectado en UI.  |
| `reaction_count`      | `number`            | Sí       | Conteo parseado de reacciones.                  |
| `reaction_count_text` | `string`            | Sí       | Texto original de reacciones detectado en UI.   |
| `interest_validation` | `object`            | Sí       | Resultado de validación AI por item.            |

## Campos adicionales de Enriched

Estos campos aparecen en export enriquecido:

| Campo              | Tipo                                       | Nullable | Descripción                                       |
| ------------------ | ------------------------------------------ | -------- | ------------------------------------------------- |
| `author_role`      | `string`                                   | Sí       | Rol/título del autor extraído en enriquecimiento. |
| `author_followers` | `number`                                   | Sí       | Seguidores del autor, normalizados a entero.      |
| `author_weight`    | `"high" \| "medium" \| "low" \| "trivial"` | No       | Señal de prioridad del autor.                     |

## Objeto `interest_validation`

Cuando está presente, su contrato es:

| Campo               | Tipo                | Nullable | Valores esperados                                                  |
| ------------------- | ------------------- | -------- | ------------------------------------------------------------------ |
| `status`            | `string`            | No       | `pending`, `interested`, `not_interested`, `unknown`, `unresolved` |
| `source`            | `string`            | No       | `gemini`                                                           |
| `attempts`          | `number`            | No       | `>= 0`                                                             |
| `validated_at`      | `string` (ISO-8601) | Sí       | Fecha/hora de última validación                                    |
| `error`             | `string`            | Sí       | Error de validación, si aplica                                     |
| `retry_after_ms`    | `number`            | Sí       | Backoff sugerido en milisegundos                                   |
| `retry_after_until` | `string` (ISO-8601) | Sí       | Timestamp hasta el próximo intento                                 |

## Reglas operativas de contrato

- Export serializa únicamente arrays de items, sin wrapper de objeto (`src/shared/export.js:33`).
- `is_repost` siempre se fuerza a booleano en export (`src/shared/export.js:9`).
- `type` cae a `"organic"` si falta (`src/shared/export.js:10`).
- Enriched agrega `author_weight`; si no hay datos, puede quedar `"trivial"` (`src/shared/export.js:29`, `src/shared/author-weight.js:124`).
- En `buildNormalizedItem`, el valor inicial de `author_weight` es `"low"`; enrichment puede recalcularlo (`src/shared/extractor.js:690`, `src/shared/author-weight.js:100`).
- `interest_validation` puede venir `null` en export, aunque el estado interno inicial lo crea como `pending` (`src/shared/export.js:16`, `src/shared/state.js:555`).

## Criterios de clasificación `author_weight`

Orden de decisión (`src/shared/author-weight.js:100`):

1. Si `author_followers >= 10000` => `high`
2. Si `author_followers >= 2000` => `medium`
3. Si `author_followers > 0` => `low`
4. Si no hay followers parseables:
   - roles ejecutivos/fundadores/partner/head/vp => `high`
   - director/principal/staff/lead/manager/architect => `medium`
5. Caso contrario => `trivial`

## Ejemplos mínimos válidos

### Raw

```json
[
  {
    "link": "https://www.linkedin.com/feed/update/urn:li:activity:123",
    "author": "Ada Lovelace",
    "author_profile_url": "https://www.linkedin.com/in/ada-lovelace",
    "reposted_by": null,
    "post_text": "Post de ejemplo",
    "posted_time": "4h",
    "is_repost": false,
    "type": "organic",
    "extracted_at": "2026-05-01T10:00:00.000Z",
    "comment_count": null,
    "comment_count_text": null,
    "reaction_count": null,
    "reaction_count_text": null,
    "interest_validation": null
  }
]
```

### Enriched

```json
[
  {
    "link": "https://www.linkedin.com/feed/update/urn:li:activity:123",
    "author": "Ada Lovelace",
    "author_profile_url": "https://www.linkedin.com/in/ada-lovelace",
    "reposted_by": null,
    "post_text": "Post de ejemplo",
    "posted_time": "4h",
    "is_repost": false,
    "type": "organic",
    "extracted_at": "2026-05-01T10:00:00.000Z",
    "comment_count": 12,
    "comment_count_text": "12 comments",
    "reaction_count": 1200,
    "reaction_count_text": "1.2K reactions",
    "interest_validation": {
      "status": "interested",
      "source": "gemini",
      "attempts": 1,
      "validated_at": "2026-05-01T10:01:00.000Z",
      "error": null,
      "retry_after_ms": null,
      "retry_after_until": null
    },
    "author_role": "Founder",
    "author_followers": 12500,
    "author_weight": "high"
  }
]
```
