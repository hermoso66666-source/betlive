# BetLive V21 — diagnóstico y corrección

## Problemas observados
- El frontend recargaba la categoría completa mediante un temporizador global. Eso podía volver a mostrar `Cargando...`, reemplazar el DOM y hacer parecer que el deporte se reiniciaba.
- Los momios no necesitaban reconstruir la lista de eventos.
- Los motores simulados tenían horario limitado 08:00–20:00 para varios deportes; fuera de ese horario podían devolver cero eventos.
- Los partidos simulados avanzaban en backend por minutos, mientras el cliente no mostraba un reloj segundo a segundo.
- API-Football puede quedar temporalmente limitado por cuota; eso debe afectar solamente al fútbol real, no a los motores simulados.

## V21
- Eliminado el refresco general de categorías del navegador.
- Nuevo `/api/market-refresh`: refresca solamente mercados/momios cada 40 segundos.
- El navegador conserva `M` y actualiza únicamente mercados; no vuelve a solicitar/reconstruir partidos.
- Reloj visual segundo a segundo para HOT/carreras, basado en `starts_at` y duración del motor.
- Básquetbol, béisbol, tenis y hockey simulados quedan 24/7 para que no desaparezcan por la hora local.
- Se mantiene API-Football exclusivamente en el pipeline de fútbol real.
- Cache de frontend actualizado a V21 para evitar ejecutar JavaScript antiguo.

## Limitación importante
Si API-Football devuelve cuota agotada/429 o no tiene partidos reales, V21 no inventa partidos reales de fútbol. Los partidos reales deben venir de API-Football o permanecer en la base local como caché.
