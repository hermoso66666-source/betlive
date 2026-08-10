# BetLive Backend V1

Esta versión cambia la arquitectura: **Node/Express + PostgreSQL + sesiones HttpOnly + bcrypt + rate limiting + Helmet**.

## Render

Crea un servicio **Web Service** apuntando al repositorio.

- Build Command: `npm install`
- Start Command: `npm start`
- Environment: `Node`
- Health URL: `/api/health`

Agrega una base de datos PostgreSQL en Render y copia su `DATABASE_URL`.

Variables obligatorias:
- `DATABASE_URL`
- `JWT_SECRET` — usa un secreto largo y aleatorio
- `NODE_ENV=production`

Opcionales para la siguiente fase OAuth:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `FACEBOOK_APP_ID`
- `FACEBOOK_APP_SECRET`

## Qué queda protegido en servidor

- El saldo ya no se decide en el navegador.
- Crear un ticket requiere sesión.
- El servidor comprueba saldo con `SELECT ... FOR UPDATE`.
- El descuento de saldo y la creación del ticket ocurren en una transacción.
- Las contraseñas se almacenan con bcrypt, no en texto plano.
- Cookie de sesión HttpOnly/Secure/SameSite.
- Rate limiting para login/registro/tickets.
- Helmet para cabeceras de seguridad.

## Importante

Google/Facebook y SMS no se deben simular como "login real". Requieren credenciales de OAuth/proveedor y configuración de producción. Esta base deja preparada la arquitectura; la siguiente integración puede añadir OAuth/OIDC y verificación SMS.

Los eventos actuales siguen siendo datos virtuales de demostración. No hay pagos, depósitos ni retiros.
