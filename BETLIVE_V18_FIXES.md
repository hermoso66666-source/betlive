# BetLive V18 — navegación y aislamiento de motores

Correcciones reales incluidas:
- Cache busting de frontend: app.js/styles.css 5.0.
- Service worker v5 elimina caches shell anteriores al activarse.
- Categorías virtuales usan exclusivamente /api/virtual/:sport?live=false y muestran OPEN/LIVE propios.
- Todos usa /api/virtual/all para virtuales y /api/events?live=true únicamente para fútbol real.
- El refresco periódico conserva la categoría seleccionada y nunca vuelve a Todos.
- HOT 2H2 carga el stream independiente sin exigir que exista un evento LIVE justo en el instante de entrada.
- Promociones y Notificaciones tienen botón visible ← Regresar.
- No hay referencias a Facebook.
- API-Football solo aparece en el módulo real de fútbol/sincronización correspondiente.
