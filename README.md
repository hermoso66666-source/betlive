# BetLive

Casa de apuestas **virtual/simulada** en vivo.

## Incluye
- Interfaz responsive para teléfono y PC.
- Eventos deportivos simulados.
- Reloj/minuto y marcador dinámicos.
- Cuotas 1X2 que cambian automáticamente.
- Cupón de apuestas.
- Saldo virtual inicial de $10,000.
- Historial de apuestas guardado en `localStorage`.
- Diseño oscuro con rojo.
- No maneja dinero real, depósitos ni retiros.

## Publicar en GitHub
Sube todos los archivos de esta carpeta al repositorio `betlive`.

## Publicar en Render
Crea un **Static Site** conectado al repositorio.
- Build Command: dejar vacío.
- Publish Directory: `/`

La aplicación funciona como sitio estático, sin Node.js ni base de datos en esta primera versión.

## Próxima fase
Para una versión más completa podemos separar frontend/backend y añadir PostgreSQL, cuentas, autenticación, panel administrativo y un motor de eventos virtuales del lado del servidor.
