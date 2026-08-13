# BetLive — Motor de Mercado Independiente v4

El mercado L/E/V ya no depende de API-Football para existir.

## Arquitectura
- `sports_events` es la fuente base de eventos de BetLive.
- El motor crea L/E/V para cualquier evento con `status=LIVE`.
- API-Football es una fuente opcional de enriquecimiento: marcador, minuto, historial/predicción y otros datos.
- Si API-Football falla, no responde, se queda sin cuota o no hay API key, el motor continúa con los datos locales y valores base conservadores.
- La distribución agregada de apuestas se usa como señal de mercado global, nunca como cuota personalizada por usuario.

## Para tener eventos sin API
Desde el administrador se puede crear un evento y cambiar su estado a `LIVE`. El motor lo detectará automáticamente y generará L/E/V.

## Diagnóstico
- `/api/health` muestra `marketEngine.mode = independent`.
- `/api/live/status` muestra el estado del motor.
- `/api/live/markets` muestra los mercados L/E/V internos activos.
