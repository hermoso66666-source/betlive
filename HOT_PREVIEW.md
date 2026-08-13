# HOT 2H2 integrado

Esta versión integra HOT 2H2 en el backend existente.

- Fútbol HOT: generación continua 24/7.
- Básquetbol, Béisbol y Tenis HOT: generación entre 08:00 y 20:00 (hora de Ciudad de México).
- Un nuevo evento cada 4 minutos.
- Duración automática de 8 minutos.
- Rotación de personajes cada 4 horas.
- 120 nombres inventados con alias.
- Estadísticas y porcentaje de probabilidad de ganador.
- Mercado HOT de ganador con cuotas decimales y equivalentes americanos.
- El fútbol real/API-Football queda separado de HOT.
- HOT se identifica públicamente como `🔥 HOT 2H2`; no se presenta como partido real.
- Admin: pestaña HOT 2H2 para generar, revisar y fijar marcador/ganador.

Endpoints principales:
- `/api/events/hot?live=true`
- `/api/events/hot/upcoming`
- `/api/admin/hot/status`
- `/api/admin/hot/generate`
- `/api/admin/hot/event/:id/control`

El motor HOT no depende de API-Football.
