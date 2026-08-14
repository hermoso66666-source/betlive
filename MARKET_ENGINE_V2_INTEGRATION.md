# BetLive V26 — Market Engine V2

Esta actualización toma como referencia la arquitectura del `betlive-virtual-engine-v1` entregado para esta actualización: probabilidad -> margen -> cuota -> mercado, con separación entre simulación, pricing y liquidación.

## Cambios reales
- `virtual-market-engine.js` es un módulo ES independiente y no importa API-Football.
- Los mercados virtuales ya no usan cuotas fijas aleatorias: se recalculan desde marcador, tiempo transcurrido, estadísticas simuladas y una señal determinista de fuerza.
- Cada deporte virtual genera 5 familias de mercados.
- La cuota se normaliza y aplica margen configurable; el frontend existente la convierte a American, por lo que el favorito normalmente aparece negativo y el underdog positivo.
- El motor limita cuotas extremas y evita valores inválidos.
- El motor de fútbol real/API-Football permanece en `server.js`; el módulo virtual no lo consulta.
- El refresco de 40 segundos sigue actualizando mercados sin reconstruir la categoría.

## Validación
`market-regression-all.mjs` comprueba los cinco deportes virtuales, número de mercados, rangos de cuotas y dirección favorito/underdog.
