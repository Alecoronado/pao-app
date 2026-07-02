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

## Permisos (sin contrasenas, simple)

Cada persona se identifica eligiendo su nombre en el selector de arriba a la derecha (no hay
login con password, es un esquema liviano para uso interno). Los roles se administran desde el
boton "Usuarios" (solo lo ve un Admin):

- **admin**: edita todo, borra proyectos, administra usuarios/roles. (Alessandro por defecto)
- **editor**: puede editar proyectos y tildar etapas. Pensado para la VP y los Jefes.
- **viewer**: solo puede ver el tablero y usar "Solicitar cambio". Gaston, Javier y Eliana
  arrancan con este rol; un admin puede subirlos a "editor" cuando quieran desde el panel de
  Usuarios.

Nota de seguridad: como no hay contrasena, cualquiera que abra la app puede elegirse como "VP" en
el selector. Esto es intencional para simplificar el uso diario del equipo, pero si mas adelante
quieren algo mas estricto (login real con password), se puede agregar despues.

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
   Postgres esta en el mismo proyecto; si no, copiar el valor manualmente desde la base).
6. Railway va a detectar `package.json` y correr `npm install` + `node server.js`
   automaticamente (ya incluye `railway.json` con esa configuracion).
7. La primera vez, correr el seed para crear las tablas y cargar los 24 proyectos. Se puede hacer
   desde la pestana **Shell/Console** del servicio en Railway con:
   ```
   npm run seed
   ```
   (esto solo carga datos si la tabla esta vacia; para forzar una recarga completa,
   `FORCE_RESEED=1 npm run seed`).
8. Railway asigna una URL publica (Settings -> Networking -> Generate Domain). Esa es la direccion
   que van a usar Alessandro, la VP, los Jefes, Gaston, Javier y Eliana desde cualquier
   dispositivo.

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
