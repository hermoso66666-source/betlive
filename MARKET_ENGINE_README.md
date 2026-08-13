# BetLive Market Engine v3

Correcciones principales:
- Import ES Module corregido: `./lev-engine.js`.
- L/E/V se genera para cada partido LIVE aunque `/odds/live` de API-Football esté vacío.
- `/predictions` es opcional; si falla, el mercado sigue apareciendo con un baseline interno.
- Se corrige el uso de las probabilidades de `/predictions`; antes se calculaban pero no se utilizaban.
- El frontend recibe únicamente mercados y selecciones OPEN.
- L/E/V se prioriza en la respuesta del backend.
- Endpoint de diagnóstico: `/api/live/markets`.
- Intervalo live configurable, por defecto 30 s.

API-Football sigue proporcionando fixture, marcador, minuto y datos estadísticos. El pricing L/E/V es interno de BetLive.
