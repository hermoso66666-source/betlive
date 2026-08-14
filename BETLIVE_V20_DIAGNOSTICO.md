# BetLive V20 — diagnóstico y correcciones

## Problema 1: jugadores repetidos entre deportes
El motor virtual estaba usando el mismo `DEFAULT_PLAYERS` y `ALIASES` para todas las categorías. Aunque los equipos eran distintos, los nombres de jugadores podían repetirse entre fútbol, básquetbol, béisbol, tenis y hockey.

### Corrección
Cada motor virtual ahora tiene su propio roster de jugadores y alias. La selección sigue siendo determinista por evento, por lo que un mismo evento conserva sus jugadores y dos deportes diferentes no comparten el mismo roster base.

## Problema 2: reinicios/cargas duplicadas de categorías
La UI podía tener solicitudes asíncronas anteriores todavía pendientes cuando el usuario cambiaba de categoría. Además, el refresco automático podía arrancar otra solicitud mientras la anterior seguía cargando.

### Corrección
- Se añadió `viewRequestId` para invalidar respuestas antiguas.
- Se añadió `eventsLoading` para evitar refrescos concurrentes.
- El refresco automático pasó de 15 s a 30 s.
- Una respuesta atrasada ya no puede reemplazar la categoría actual.
- Se aplica el mismo control a fútbol, virtuales, HOT, carreras y próximos.

## Problema 3: pocos mercados y cuotas Americanas poco variadas
Los motores virtuales tenían un único mercado principal con cuatro selecciones. Esto hacía que las categorías se sintieran demasiado básicas.

### Corrección
Cada deporte virtual genera ahora varios mercados específicos del deporte, por ejemplo:
- Fútbol: 1X2, totales, hándicap, ambos marcan y línea alternativa.
- Básquetbol: ganador, hándicap, total de puntos, total de equipo y hándicap alternativo.
- Béisbol: ganador, run line, total de carreras, carreras de equipo y primera entrada.
- Tenis: ganador, sets, juegos, set 1 y hándicap de juegos.
- Hockey: ganador, puck line, total de goles, total de equipo y primer periodo.

Las cuotas siguen almacenándose como decimales internamente y se muestran en formato American en el frontend. Por ello aparecen cuotas negativas cuando el decimal es menor que 2.00 y positivas cuando es mayor o igual a 2.00.

## Caché
Se elevó el identificador del Service Worker y de `app.js` a V7 para evitar que el teléfono continúe ejecutando el JS anterior.

## Separación de fuentes
La arquitectura conserva la separación establecida en V19:
- Fútbol real en vivo: API-Football.
- HOT 2H2 y deportes virtuales: motores internos.
- Carreras: motor de carreras independiente.
