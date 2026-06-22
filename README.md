# esspreso - Punto de venta

Sistema web para cafeteria con venta, productos, cocina, finanzas y menu publico en linea. El frontend y el backend viven en la misma carpeta del proyecto.

## Que incluye

- Inicio protegido con 4 secciones: Venta, Productos, Cocina y Finanzas.
- Login con JWT usando Netlify Functions.
- Sesion con caducidad de 4 horas desde el inicio de sesion.
- Usuarios incluidos:
  - andrea / andreaSpre
  - ximena / ximenaSpre
- Menu publico en `#menu` sin login y sin navegacion interna.
- Venta con mesas o tickets para llevar activos.
- Agregar productos por categoria, producto y cantidad.
- Cocina en tiempo real con ordenes activas.
- Productos en preparacion en rojo y preparados en verde.
- Si un producto ya esta preparado no se puede modificar ni eliminar desde Venta.
- Cobro por efectivo, tarjeta o transferencia.
- Productos con alta, edicion y eliminacion usando Firebase Firestore.
- Exportar productos actualizados en PDF.
- Codigo QR para ver el menu online.
- Finanzas por dia, total vendido, metodos de pago, reporte imprimible y guardado como PDF.
- Diseno responsive para iPhone, Samsung y escritorio.
- Backend en `netlify/functions`.

## Estructura

```txt
esspreso-punto-venta/
├─ index.html
├─ package.json
├─ netlify.toml
├─ firestore.rules
├─ .env.example
├─ public/assets/
│  ├─ logo-esspreso.jpeg
│  ├─ logo-esspreso.png
│  ├─ latte.svg
│  ├─ crepa.svg
│  ├─ sandwich.svg
│  └─ bowl.svg
├─ src/
│  ├─ main.js
│  ├─ firebase.js
│  ├─ productsSeed.js
│  └─ styles.css
└─ netlify/functions/
   ├─ login.js
   ├─ verify.js
   └─ status.js
```

## Variables de entorno

En Netlify agrega estas variables en **Site configuration > Environment variables**:

```env
VITE_FIREBASE_API_KEY=AIzaSyD7nddNYWyIrxfQZNeLKUN1i2c49sTO3po
VITE_FIREBASE_AUTH_DOMAIN=esspresoanch.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=esspresoanch
VITE_FIREBASE_STORAGE_BUCKET=esspresoanch.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=172136834596
VITE_FIREBASE_APP_ID=1:172136834596:web:eaaa38e85d2a34c3235ab1
VITE_FIREBASE_MEASUREMENT_ID=G-VR00WLZ9JS
JWT_SECRET=cambia_este_valor_por_un_texto_largo_y_privado
AUTH_TOKEN_HOURS=4
```

`JWT_SECRET` debe ser un texto largo y privado. No lo subas en un archivo `.env` al repositorio.

## Firestore para pruebas

Tus reglas actuales abiertas funcionan para pruebas:

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

Para produccion real, se recomienda cerrar reglas y usar autenticacion de Firebase o llamadas de backend.

## Instalar y correr local

```bash
npm install
npm run dev
```

Con `npm run dev`, el login funciona con respaldo local para pruebas en localhost.

Para probar Netlify Functions localmente:

```bash
npm install -g netlify-cli
npm run dev:netlify
```

## Subir a GitHub

```bash
git add .
git commit -m "Agrega login JWT"
git push
```

## Netlify

Configuracion:

```txt
Build command: npm run build
Publish directory: dist
Functions directory: netlify/functions
```

El archivo `netlify.toml` ya trae esta configuracion.

## Rutas

```txt
/          App protegida
/#inicio   Inicio protegido
/#venta    Venta protegida
/#productos Productos protegido
/#cocina   Cocina protegida
/#finanzas Finanzas protegido
/#menu     Menu publico sin login
```

## Uso rapido

1. Entra con Andrea o Ximena.
2. En Productos carga o edita productos.
3. En Venta crea mesas o tickets.
4. En Cocina marca productos como preparados.
5. En Finanzas revisa ventas y reimprime tickets.
6. Usa `#menu` o el QR para clientes.
