# BetLive V21 — Diagnóstico y cambios

- Los deportes simulados siguen separados por motor y por roster. No comparten jugadores entre Fútbol 2H2, Básquetbol, Béisbol, Tenis y Hockey.
- Los partidos simulados conservan su duración definida por motor y ahora exponen esa duración al frontend.
- Se añadió un reloj MM:SS que avanza cada segundo usando starts_at y la duración del evento; no depende de API-Football.
- La puntuación mostrada sigue el marcador persistido por el motor y se mantiene separada del reloj.
- Se eliminó el refresco general de 30 segundos del frontend.
- Cada 40 segundos se llama únicamente a /api/markets/refresh para actualizar momios sin recargar eventos ni cambiar de categoría.
- En fútbol real, el refresco usa el motor interno L/E/V de BetLive. API-Football continúa reservado para el feed real de fútbol.
- En deportes simulados y carreras, el refresco usa exclusivamente sus motores internos.
- Se actualizó app.js y el Service Worker a V8 para evitar caché de la versión anterior.

## Validación

- node --check server.js
- node --check app.js
- node --check virtual-sport-engine.js
