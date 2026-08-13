# BetLive v13.2 — HOT NaN fix

Fixed the HOT 2H2 runtime error: `invalid input syntax for type integer: "NaN"`.

Root cause: the HOT score generator passed a UUID/string through `Number(...)`, producing NaN, which could reach PostgreSQL integer score fields.

Changes:
- deterministic HOT hash accepts numeric and string/UUID seeds safely;
- HOT scores are defensively normalized to finite integers;
- `/api/health` exposes HOT database counts;
- real football/API-Football remains separate from HOT.
