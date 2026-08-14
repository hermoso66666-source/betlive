# BetLive V15 — motores virtuales independientes

Esta versión cambia la arquitectura HOT para que cada deporte virtual tenga su propio motor y estado.

## Motores
- HOT_FOOTBALL: fútbol 2H2 virtual, 24/7. El catálogo normal de Fútbol sigue usando el feed real.
- HOT_BASKETBALL: básquetbol 2H2, 08:00–20:00.
- HOT_BASEBALL: béisbol 2H2, 08:00–20:00.
- HOT_TENNIS: tenis 2H2, 08:00–20:00.
- HOT_HOCKEY: hockey 2H2, 08:00–20:00.
- RACE_ENGINE: carreras virtuales, conservado como motor separado.
- El motor de mercados internos de fútbol real sigue separado de los virtuales.

Cada motor virtual tiene su propio scheduler, generador de eventos, estado, estadísticas y mercados. Los mercados virtuales usan `external_source` y `market_type` distintos para evitar colisiones.

## Endpoints de prueba
- `/api/virtual/Básquetbol?live=true`
- `/api/virtual/Béisbol?live=true`
- `/api/virtual/Tenis?live=true`
- `/api/virtual/Hockey?live=true`
- `/api/virtual/Fútbol?live=true`
- `/api/virtual/all?live=true`
- `/api/events/hot?live=true`
- `/api/health`

## Objetivo de esta entrega
Primero probar aislamiento: si un motor falla, los demás deben seguir respondiendo. El frontend ya no necesita que un único HOT global genere todos los deportes al mismo tiempo.

## Nota
Los deportes virtuales de esta versión son generados por software. Deben identificarse claramente como virtuales/HOT antes de cualquier uso fuera de pruebas personales.
