# BetLive V22 — momios live + selección del ticket

## Correcciones aplicadas

### 1. Momios según marcador
Los mercados de ganador de los deportes simulados ya no usan un favorito fijo aleatorio durante el juego.

- Si el local va ganando: recibe precio de favorito (American normalmente negativo).
- Si el visitante va ganando: recibe precio de favorito (American normalmente negativo).
- El equipo que va perdiendo recibe precio de underdog (American normalmente positivo).
- La ventaja se ajusta según marcador y tiempo transcurrido.
- En 0-0 o antes de comenzar se mantiene una distribución equilibrada/aleatoria controlada.

El motor interno L/E/V del fútbol real también refuerza marcador + tiempo para impedir que el equipo que va perdiendo quede accidentalmente como favorito.

### 2. Ticket: quitar selección al instante
Cada momio seleccionado ahora tiene una clave estable `evento:selección`.

Pulsar nuevamente el mismo momio lo elimina inmediatamente del ticket, sin entrar al apartado Ticket.

Los botones también usan `aria-pressed` y `type="button"` para mantener el estado de selección consistente.

### 3. Refresco
Se conserva el refresco de mercados cada **40 segundos**. No se recarga la categoría completa.

### 4. Cache
Se incrementó la versión del Service Worker a V22 para evitar que el navegador conserve el JavaScript anterior.

## No modificado

- El reloj segundo a segundo de los partidos simulados.
- La independencia de los motores simulados respecto de API-Football.
- El motor de carreras.
- El panel de administración; se deja para la siguiente etapa como pediste.

## Verificación técnica

Sintaxis validada con Node.js para:
- `server.js`
- `app.js`
- `virtual-sport-engine.js`
- `lev-engine.js`
- `sw.js`

También se probó el motor L/E/V con marcadores 1-0, 0-1, 2-0 y 0-2: el equipo líder recibe cuota decimal menor a 2 (American negativa) y el equipo perdedor cuota decimal mayor a 2 (American positiva).
