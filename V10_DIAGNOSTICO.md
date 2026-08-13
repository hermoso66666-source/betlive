# BetLive V10 — motor de mercados realmente independiente

La captura de V9 mostró:
- `activeEvents: 111`
- `liveEvents: 105`
- `openInternalMarkets: 0`
- `openInternalSelections: 0`
- `lastRunAt: null`

Eso indica que los partidos LIVE ya existen, pero el ciclo de sincronización/proveedor no había terminado y el motor L/E/V estaba esperando a ese ciclo.

V10 corrige la arquitectura:
1. El motor L/E/V se ejecuta inmediatamente desde `sports_events`, antes de esperar API-Football.
2. No hace llamadas de red a `/predictions` para crear mercados. Solo usa predicciones ya cacheadas.
3. Score feed, odds y predictions son enriquecimiento opcional.
4. Se añade `independentMarketEngine` al health.
5. Se añade `POST /api/market-engine/run` para ejecutar una reparación directa si hace falta.
6. Se mantiene la generación automática en cada ciclo.

Endpoints de diagnóstico:
- `/api/health`
- `/api/live/markets`
- `POST /api/market-engine/run`
