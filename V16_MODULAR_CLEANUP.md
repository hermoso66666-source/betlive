# V16 — Diagnóstico y limpieza modular

Cambios:
- `/api/events` y `/api/events/upcoming-real` quedan restringidos a `sport='Fútbol'` + `external_source='API_FOOTBALL'`.
- El motor L/E/V y el enriquecimiento de predicciones solo procesan eventos reales de fútbol.
- El pipeline de score externo filtra explícitamente cualquier deporte que no sea Fútbol.
- Básquetbol, Béisbol, Tenis y Hockey usan exclusivamente `virtual-sport-engine.js`.
- HOT 2H2 ahora incluye un motor interno independiente para Fútbol (`HOT_FOOTBALL`), separado del fútbol real.
- Carreras conserva su motor `RACE_ENGINE`.
- `Todos` usa `Promise.allSettled` para que un motor virtual con error no tire el resto del catálogo.
- Se agregaron Hockey a navegación y menú.
- Se eliminó el código HOT antiguo duplicado del servidor; el administrador usa directamente los motores virtuales independientes.
- No hay referencias de Facebook en el código activo.

Validación estática:
- `node --check server.js` OK
- `node --check virtual-sport-engine.js` OK
- `node --check app.js` OK

Nota: el ZIP se validó estáticamente. La ejecución contra PostgreSQL/Render requiere desplegarlo en el entorno con sus variables de entorno.
