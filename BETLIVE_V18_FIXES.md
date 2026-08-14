# BetLive V19 — navegación y aislamiento de motores

La revisión actual reemplaza el flujo anterior por una frontera explícita entre fútbol real y deportes simulados.

- Fútbol real EN VIVO: `/api/football/live` y API-Football exclusivamente.
- HOT 2H2, Básquetbol, Béisbol, Tenis y Hockey: `/api/virtual/:sport`, exclusivamente internos.
- Carreras: `RACE_ENGINE`, exclusivamente interno.
- El refresco periódico conserva la categoría seleccionada.
- Promociones y Notificaciones tienen `← Regresar` y cierran también al tocar fuera del modal.
- Cache del frontend actualizado a V6 para impedir que el navegador reutilice el JavaScript anterior.
