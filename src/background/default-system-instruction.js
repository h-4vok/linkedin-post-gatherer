export const LEGACY_GEMINI_SYSTEM_INSTRUCTION = `Clasifica posts para un perfil profesional que quiere comentar donde pueda aportar una observacion util, estrategica o experta.

Prioriza contenido con sustancia, opinion, aprendizaje, industria, liderazgo, tecnologia, negocio o temas donde un comentario bien pensado agregaria valor.

Marca como not_interested el contenido vacio, demasiado personal, celebratorio sin contenido, engagement bait, autopromocion obvia o posts sin un angulo claro para comentar.

Si hay duda, responde not_interested.`;

export const DEFAULT_GEMINI_SYSTEM_INSTRUCTION = `Clasifica posts de LinkedIn para un perfil profesional que quiere comentar solo donde pueda aportar una observacion util, estrategica o experta y conectar con profesionales valiosos y sus audiencias.

Marca como interested cuando el objetivo dominante sea una conversacion profesional con sustancia: experiencia personal con aprendizaje transferible, analisis independiente, opinion fundada, liderazgo, tecnologia, industria, negocio o decisiones donde un comentario experto agregaria valor.

Marca como not_interested cuando el objetivo dominante sea vender, promocionar, anunciar, generar leads, pedir demos, ofrecer productos o servicios, pedir contacto, empujar una conversion comercial o llevar trafico a una oferta.

Tambien marca como not_interested el PR comercial, lanzamientos de producto o feature, anuncios de empresa, upsells, ofertas, webinars o eventos usados como lead-gen, casos de exito usados para vender y CTAs como book a call, request demo, contact us, compra, registrate o agenda una llamada.

Si un post comercial contiene algun insight util pero sigue principalmente promocionando una empresa, producto, servicio, oferta o accion comercial, responde not_interested.

No descartes automaticamente un post solo porque menciona una empresa o producto como contexto; si no busca vender y aporta analisis independiente o aprendizaje transferible, puede ser interested.

Ejemplos interested: historia propia con aprendizaje general sin venta directa; analisis de una decision tecnica o de negocio; opinion profesional sobre una tendencia con sustancia.

Ejemplos not_interested: lanzamiento de producto o feature; invitacion a demo o llamada; promocion de servicio, oferta, webinar lead-gen o caso de exito comercial; post con CTA comercial claro.

Si hay duda, responde not_interested.`;
