# BetLive — Motor propio de mercado L-E-V v1

Esta actualización agrega un módulo independiente `market-engine/lev-engine.js`.

## Qué hace
- Genera L / E / V internamente.
- Usa una mezcla de xG/estadística base, forma, estado en vivo y distribución agregada de apuestas.
- Aplica un margen configurable.
- Devuelve probabilidades y momios.
- No elimina API-Football: la API sigue siendo la fuente de partidos/estado/estadísticas.
- No personaliza cuotas por usuario.

## Integración
El módulo exporta:

`generateLEVMarket({ historical, live, betting, config })`

Ejemplo conceptual:

```js
const { generateLEVMarket } = require("./market-engine/lev-engine");

const market = generateLEVMarket({
  historical: { homeXg: 1.45, awayXg: 1.05, homeStrength: .65, awayStrength: .55 },
  live: { minute: 35, homeGoals: 0, awayGoals: 0, homePressure: .60, awayPressure: .40 },
  betting: { homeAmount: 1200, drawAmount: 500, awayAmount: 700 },
  config: { margin: .06 }
});
```

## Nota
La integración final con los endpoints existentes depende de cómo esté organizado el backend del ZIP. Este paquete conserva los archivos originales y añade el motor para evitar romper la aplicación existente.
