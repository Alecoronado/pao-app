# PAO - Seguimiento de Proyectos

App web (backend Node/Express + PostgreSQL, frontend HTML/CSS/JS) para reemplazar la planilla de
seguimiento de proyectos. Funciona como tablero visual (igual a la imagen de referencia) y como
CRM liviano: la VP y los Jefes pueden editar los datos directamente desde el navegador, en el
celular o en la compu, y los cambios quedan guardados para todos.

## Que resuelve esto de la planilla original

1. La fila "CTs" (Cooperaciones Tecnicas) no se carga - quedan 24 proyectos.
2. Se agrego el campo **Fecha de aprobacion**, editable con un selector de fecha por proyecto
   (boton "Fijar fecha" en la tabla / tarjeta).
3. La app es responsive: en el celular la tabla se convierte en tarjetas, con los filtros
   colapsados en un menu desplegable.
4. La columna **Etapa Actual** ahora muestra la etapa que falta completar (la primera pendiente
   en la secuencia), no la ultima que tiene tilde.
5. Hay un boton flotante **"Solicitar cambio"** para que Gaston, Javier y Eliana (o cualquier
   usuario sin permiso de edicion) manden un pedido por correo directamente a
   alecoronadosiles@hotmail.com sin tocar los datos ellos mismos.

## Permisos (login real por rol)

El login es por **rol** (cuenta compartida), no por persona: hay 5 cuentas fijas, cada una con su
propio usuario y contraseña. Al entrar tambien se pide "tu nombre" (texto libre) para que el
historial de cambios diga quien fue puntualmente (ej: "Juan (VP)").

- **Desarrollador**: acceso total — crea/edita/borra proyectos y administra las 5 cuentas
  (cambiar contraseña o email) desde el boton "Usuarios" (solo lo ve este rol).
- **VP**, **Jefe Cartera**, **Jefe Soberano**, **Asesor Senior**: todos pueden crear y editar
  cualquier proyecto (tildar etapas, cargar montos, fechas, notas), pero ninguno puede borrar
  proyectos ni administrar cuentas — eso queda solo para Desarrollador.

Las contraseñas iniciales las genera `npm run seed` (aleatorias, se imprimen una sola vez por
consola) o se pueden fijar de antemano con variables de entorno `INIT_PASSWORD_DESARROLLADOR`,
`INIT_PASSWORD_VP`, `INIT_PASSWORD_JEFE_CARTERA`, `INIT_PASSWORD_JEFE_SOBERANO`,
`INIT_PASSWORD_ASESOR_SENIOR`. Nunca se hardcodean en el repo (es publico). Hace falta ademas
una variable `SESSION_SECRET` (ver `.env.example`) para firmar las sesiones.

## Estructura del proyecto

```
pao-app/
  server.js          - servidor Express + API REST
  db/
    schema.sql        - esquema de PostgreSQL
    stages.js          - logica de "etapa actual"
    seed-data.js        - los 24 proyectos + usuarios iniciales
    index.js             - conexion a PostgreSQL (o a pglite en modo test)
  seed.js             - script que crea las tablas y carga los datos iniciales
  public/             - frontend (index.html, styles.css, app.js)
  test/               - pruebas automaticas (corren sin Postgres real)
```

## Deploy en Railway (paso a paso)

1. Crear un repositorio en GitHub con el contenido de esta carpeta (`pao-app/`) y subirlo
   (`git init`, `git add .`, `git commit -m "PAO app"`, `git push`).
2. Entrar a https://railway.app y crear un **New Project**.
3. Elegir **Deploy from GitHub repo** y seleccionar el repositorio recien creado.
4. Dentro del mismo proyecto de Railway, click en **+ New** -> **Database** -> **Add PostgreSQL**.
   Railway crea la base y define automaticamente la variable `DATABASE_URL` en el servicio.
5. Entrar al servicio del backend (el que Railway creo desde GitHub) y en la pestana
   **Variables**, confirmar que `DATABASE_URL` este disponible (Railway lo conecta solo si el
   Postgres esta en el mismo proyecto; si no, copiar el valor manualmente desde la base). Agregar
   tambien `SESSION_SECRET` con un valor random (ver `.env.example`) — sin esto el login no
   funciona.
6. Railway va a detectar `package.json` y correr `npm install` + `node server.js`
   automaticamente (ya incluye `railway.json` con esa configuracion).
7. La primera vez, correr el seed para crear las tablas, las 5 cuentas por rol y cargar los 24
   proyectos. Se puede hacer desde la pestana **Shell/Console** del servicio en Railway con:
   ```
   npm run seed
   ```
   Esto imprime las contraseñas generadas para cada cuenta **una sola vez** — guardalas. Correrlo
   de nuevo no pisa proyectos ya cargados (usar `FORCE_RESEED=1 npm run seed` para forzar una
   recarga completa de proyectos); las cuentas que ya existan tampoco se tocan.
8. Railway asigna una URL publica (Settings -> Networking -> Generate Domain). Esa es la direccion
   que va a usar el equipo desde cualquier dispositivo, entrando con la cuenta de su rol.

## Correr en modo local (sin Postgres)

Para probar en la compu sin instalar Postgres, hay un modo de prueba en memoria:

```
USE_PGLITE=1 node seed.js
USE_PGLITE=1 node server.js
```

(ojo: en este modo los datos se pierden al reiniciar el proceso, es solo para probar la interfaz).

Con un Postgres real (local o de Railway), en cambio:

```
npm install
cp .env.example .env      # completar DATABASE_URL
npm run seed
npm start
```

## Correr los tests

```
npm test
node test/smoke.js
```

Ambos corren sobre una base en memoria (pglite) y no requieren Postgres real. Verifican, entre
otras cosas, que la fila CTs no se cargue, que la logica de "etapa actual" de cada caso sea
correcta, y que los permisos por rol funcionen.
