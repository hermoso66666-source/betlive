# V11 — Momios más dinámicos y formato americano

- Marcador y minuto LIVE ahora tienen mayor peso en L/E/V.
- Un empate actual se vuelve progresivamente más probable conforme avanza el reloj.
- Una ventaja de 1 o 2 goles aumenta progresivamente la probabilidad del equipo que va arriba.
- Margen interno por defecto: 4.5%.
- API-Football sigue siendo opcional/enriquecimiento.
- La cuota decimal se conserva internamente para tickets y multiplicación.
- La interfaz muestra momio americano: favoritos negativos (1.94 -> -106) y no favoritos positivos (2.50 -> +150), conservando la cuota decimal entre paréntesis.

Los momios negativos son otra representación del mismo precio decimal; no cambian el cálculo matemático del ticket.


V12 añade compresión progresiva de precios durante el partido y libera rangos extremos únicamente en los minutos finales con diferencias grandes de goles.
