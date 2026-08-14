# BetLive V14 — integración funcional y auditoría

## Motores
- Fútbol real/en vivo: API-Football + fallback/local, L/E/V independiente.
- HOT 2H2: scheduler, estadísticas y mercados internos, separado de fútbol real.
- Carreras Virtuales: motor propio `RACE_ENGINE`, 8 pilotos, carreras de 6 minutos, nuevas carreras cada 5 minutos, rotación de nombres por bloques de 4 horas y control Admin.
- Básquetbol, Béisbol y Tenis HOT permanecen bajo el motor HOT, sin depender de API-Football.

## Promociones y notificaciones
- Menú público de Promociones.
- Calendario promocional informativo, sin requisito de apostar para conservar una racha.
- Notificaciones internas por usuario o globales.
- Admin puede crear/activar/desactivar promociones y enviar notificaciones.

## PWA / carga
- `manifest.webmanifest`.
- `sw.js` para caché del shell.
- Splash screen que consulta `/api/health` antes de iniciar la vista principal, con timeout de 10 s.

## Validaciones realizadas
- `node --check server.js`: PASS
- `node --check app.js`: PASS
- `node --check admin.js`: PASS
- `failover-simulation.mjs`: PASS
- `live-state-regression.mjs`: PASS
- Se corrigió la ruta de importación de los tests (`./score-engine.js`) que apuntaba fuera del proyecto.
- Se evitó `gen_random_uuid()` en SQL de inicialización para no depender de una extensión PostgreSQL adicional.

## Pendiente deliberado
HOT 2H2 se mantiene como motor independiente; no se mezcló con el motor de carreras. La revisión final de UI/diseño se deja para después de las pruebas funcionales en Render.
