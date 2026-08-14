# V13.3 — HOT duplicate-key / concurrent scheduler fix

Corrige el error PostgreSQL:
`duplicate key value violates unique constraint "uq_sports_events_external"`

La generación HOT ahora es idempotente usando la clave única real
`(external_source, external_id)` y `ON CONFLICT ... DO NOTHING`.
Después de insertar, el motor recupera el evento por `external_id`, incluso si
otro ciclo/worker lo creó primero. Esto evita que dos ciclos simultáneos del
scheduler rompan la carga de HOT 2H2.

También conserva los cambios anteriores de V13.2 (protección contra NaN,
scores enteros y diagnóstico de /api/health).
