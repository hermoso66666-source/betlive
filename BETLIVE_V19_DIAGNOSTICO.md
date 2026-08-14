# BetLive V19 — Diagnóstico y corrección de aislamiento

## Problema encontrado
La versión anterior ya tenía motores virtuales separados en backend, pero el frontend seguía teniendo un punto de entrada genérico (`loadEvents`) para varias categorías y el refresco periódico podía reutilizar ese flujo. Además, `Fútbol` virtual existía dentro del administrador de motores HOT con el mismo nombre de deporte que el fútbol real.

Eso hacía demasiado fácil que una categoría simulada terminara pasando por el flujo de eventos reales o que una respuesta vieja quedara visible después de cambiar de categoría.

## Arquitectura V19
- **Fútbol real EN VIVO:** único módulo que consulta API-Football.
- **HOT 2H2:** módulo virtual interno; no consulta API-Football.
- **Básquetbol:** motor virtual independiente.
- **Béisbol:** motor virtual independiente.
- **Tenis:** motor virtual independiente.
- **Hockey:** motor virtual independiente.
- **Carreras:** motor RACE_ENGINE independiente.
- **Todos:** combina explícitamente `API_FOOTBALL` para fútbol real + los endpoints virtuales; no hace que los virtuales pasen por el feed real.

## Cambios aplicados
1. Se creó `/api/football/live`, con una consulta SQL limitada a `sport='Fútbol'`, `external_source='API_FOOTBALL'` y `status='LIVE'`.
2. Las categorías simuladas ahora tienen una función frontend dedicada `loadVirtualSport()` y llaman exclusivamente a `/api/virtual/:sport`.
3. El refresco periódico de una categoría virtual vuelve a su propio motor, no a `loadEvents()`.
4. HOT 2H2 conserva su flujo dedicado `/api/events/hot`.
5. Se impidió que la reconciliación de API-Football pueda seleccionar un evento virtual por coincidencia de nombres de equipos.
6. Promociones y Notificaciones cierran correctamente y el botón `← Regresar` funciona; además se cierra el menú lateral al abrirlas.
7. Se actualizó el cache-busting del frontend y Service Worker a V6 para evitar que el teléfono siga ejecutando el JavaScript viejo.
8. Se verificó que `virtual-sport-engine.js` no contiene referencias a API-Football.
9. Se verificó sintaxis con `node --check` en `server.js`, `app.js` y `virtual-sport-engine.js`.

## Importante
Esta revisión está hecha sobre el ZIP V18 disponible en la biblioteca. La validación ejecutada aquí es de código, rutas y aislamiento; no se puede afirmar que el Render remoto quedó actualizado hasta desplegar este ZIP y comprobar `/api/health` y cada categoría en el navegador.
