# V12 Deploy Check

## Archivos clave
- `server.js`: fallback automático para próximos/en vivo + endpoint de diagnóstico.
- `score-engine.js`: normalizador API-Football, respaldo genérico y ESPN.
- `lev-engine.js`: momios L/E/V progresivos.
- `failover-simulation.mjs`: simulación de fallos y escenarios de momios.
- `V12_RESILIENT_UPCOMING_PROGRESSIVE.md`: documentación.

## Render
No hace falta una API key nueva para el respaldo ESPN.

Opcionales:
- `ESPN_BACKUP_ENABLED=true`
- `ESPN_BACKUP_DAYS=3`
- `ESPN_BACKUP_TIMEOUT_MS=4500`
- `ESPN_SOCCER_LEAGUES=mex.1,eng.1,esp.1,ita.1,ger.1,fra.1,uefa.champions`

Se conservan:
- `API_FOOTBALL_KEY`
- `SCORE_BACKUP_URL`
- `SCORE_BACKUP_TOKEN`

## Después de desplegar
1. Espera a que Render termine el deploy.
2. Abre `/api/health`.
3. Debe aparecer:
   - `database: true`
   - `marketEngine.enabled: true`
   - `marketEngine.mode: "independent"`
   - `scoreEngine.espnBackup: true`
4. Abre `/api/events/upcoming-real`.
5. Si API-Football está limitada, la respuesta debe mostrar `source` con `ESPN+BETLIVE` (o `BETLIVE` si la base local ya tiene eventos).
6. Comprueba un partido en vivo y verifica que L/E/V siga apareciendo.
7. Comprueba un 1-0/2-0 durante el partido: los precios no deben saltar inmediatamente a +500/+600.
8. En una diferencia grande y tramo final, los precios pueden entrar progresivamente en rangos extremos.

## Importante
No borres la base de datos ni cambies `DATABASE_URL` al actualizar. El código está diseñado para conservar los eventos locales y mercados existentes.
