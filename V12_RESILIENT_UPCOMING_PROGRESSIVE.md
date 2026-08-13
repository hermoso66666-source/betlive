# BETLIVE V12 — Respaldo automático + momios progresivos

## Qué se corrigió

### 1. Próximos partidos sin depender de API-Football
El endpoint `/api/events/upcoming-real` ahora sigue este orden:

1. API-Football, si está configurada y responde.
2. `SCORE_BACKUP_URL`, si existe.
3. ESPN Soccer público como respaldo automático sin API key.
4. Base de datos local de BetLive.

Si API-Football devuelve error, está pausada por cuota/rate-limit o devuelve cero eventos, el sistema intenta el respaldo. Los datos existentes no se borran por un fallo del proveedor.

El respaldo ESPN se consulta para:
- Liga MX (`mex.1`)
- Premier League (`eng.1`)
- LaLiga (`esp.1`)
- Serie A (`ita.1`)
- Bundesliga (`ger.1`)
- Ligue 1 (`fra.1`)
- UEFA Champions League (`uefa.champions`)

Las ligas se pueden cambiar con `ESPN_SOCCER_LEAGUES`.

### 2. Marcadores y mercados siguen separados
El Score Engine solo administra eventos, estados, marcador y minuto.

El Market Engine `INTERNAL_LEV` genera L/E/V sin esperar cuotas ni predicciones externas. API-Football solo puede enriquecer el cálculo cuando hay información disponible.

### 3. Momios progresivos
Se modificó el cálculo para evitar saltos exagerados después de un gol.

Ejemplo aproximado con datos base del motor:

- 58' 2-0: L 1.46 / E 4.00 / V 4.50
- 89' 1-0: L 1.56 / E 5.41 / V 5.52
- 89' 2-0: L 1.48 / E 5.99 / V 6.12
- 89' 3-0: L 1.18 / E 13.27 / V 13.47
- 89' 4-0: L 1.06 / E 37.21 / V 37.72
- 89' 5-0: L 1.04 / E 55.18 / V 56.04

La intención es que un 1-0 o 2-0 normal no se convierta automáticamente en +500/+600 durante buena parte del partido. Los precios extremos se reservan para el tramo final y diferencias grandes.

Los precios americanos continúan siendo una representación de la cuota decimal:
- decimal 1.50 → aproximadamente -200
- decimal 2.50 → +150
- decimal 6.00 → +500
- decimal 61.00 → +6000

## Variables opcionales de Render

No son obligatorias porque ESPN está habilitado por defecto.

`ESPN_BACKUP_ENABLED=true`

`ESPN_BACKUP_DAYS=3`

`ESPN_BACKUP_TIMEOUT_MS=4500`

`ESPN_SOCCER_LEAGUES=mex.1,eng.1,esp.1,ita.1,ger.1,fra.1,uefa.champions`

El respaldo externo genérico sigue disponible:

`SCORE_BACKUP_URL=https://...`

`SCORE_BACKUP_TOKEN=...`

## Pruebas incluidas

Ejecutar:

`npm run test:resilience`

La prueba valida:
- normalización API-Football;
- normalización ESPN;
- deduplicación por partido;
- fallback;
- mercado L/E/V sin API;
- momios progresivos;
- comportamiento de 2-0 normal;
- comportamiento extremo 5-0 al final;
- conversión de estados.

Resultado de esta versión: `BETLIVE RESILIENCE + PROGRESSIVE ODDS SIMULATION: PASS`.

## Importante para operación real

El motor nunca debe inventar un marcador. Si todas las fuentes fallan, BetLive puede conservar el último estado conocido y marcarlo como caché/obsoleto. Para operación con dinero real conviene suspender o marcar como no verificable un evento cuyo marcador ya no tenga una fuente confiable.
