# BetLive v5 — Score Engine + Market Engine independientes

## Arquitectura

### A. Score Engine
Fuente de verdad para próximos/en vivo:
1. API-Football (opcional, si está configurada).
2. Feed de respaldo JSON configurable por `SCORE_BACKUP_URL`.
3. Estado persistido en PostgreSQL de BetLive, incluyendo el último estado válido.
4. Control manual desde Admin para emergencia (`En vivo`, `+ Local`, `+ Visitante`, `Finalizar`).

Una caída de API-Football **no cierra ni borra partidos**. Si el feed primario falla o devuelve cero eventos live, se intenta el respaldo. Si ambos fallan, se conserva el estado de BetLive.

### B. Market Engine
`INTERNAL_LEV` es independiente de cuotas/bookmakers externas. Genera L/E/V para eventos `OPEN` y `LIVE` y usa datos disponibles de forma oportunista:
- marcador/minuto del Score Engine;
- predicción/historial de API-Football si existe;
- exposición agregada de tickets pendientes;
- valores base internos cuando no hay datos externos.

No personaliza cuotas por usuario.

## Feed de respaldo

Configura en Render:
- `SCORE_BACKUP_URL`: endpoint HTTPS que devuelva JSON con `events` o un array.
- `SCORE_BACKUP_TOKEN`: opcional, se manda como `Authorization: Bearer ...`.

Cada evento puede usar:
`id`, `sport`, `league`, `home`, `away`, `startsAt`, `status`, `homeScore`, `awayScore`, `elapsed`, `liveStatus`, `confidence`.

## Endpoints de diagnóstico

- `/api/health`
- `/api/live/status`
- `/api/live/markets`
- `/api/events`
- `/api/events/upcoming-real`

## Simulación ejecutada

`tests/failover-simulation.mjs` valida:
- API-Football operativo -> normalización del marcador.
- API-Football sin datos -> respaldo.
- Sin fuentes externas -> L/E/V sigue generándose.
- Apuestas agregadas -> modifican pricing sin eliminar L/E/V.

Resultado: `FAILOVER SIMULATION: PASS`.

## Nota de precisión

Si todas las fuentes deportivas están caídas, BetLive puede mantener el último marcador válido y generar un mercado base, pero **no puede inventar un marcador real**. Para dinero real, un estado sin verificación debe poder marcarse como obsoleto/suspenderse hasta que vuelva una fuente confiable.


## V12 — Respaldo automático sin API key
Si API-Football falla, devuelve cero eventos o está pausada por rate-limit, el endpoint de próximos partidos intenta `SCORE_BACKUP_URL` y después ESPN Soccer público. ESPN no aporta cuotas: únicamente eventos/estado/marcador; las cuotas siguen siendo responsabilidad de `INTERNAL_LEV`.

El fallback ESPN está habilitado por defecto y se configura con `ESPN_BACKUP_ENABLED`, `ESPN_BACKUP_DAYS`, `ESPN_BACKUP_TIMEOUT_MS` y `ESPN_SOCCER_LEAGUES`.
