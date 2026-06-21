# esspreso - Punto de acceso

Sistema web para cafeteria con venta, productos y finanzas. El frontend y el backend viven en la misma carpeta del proyecto.

## Que incluye

- Inicio con 3 tarjetas: Venta, Productos y Finanzas.
- Venta con mesas o tickets para llevar activos.
- Agregar productos por categoria, producto y cantidad.
- Modificar cantidades o eliminar productos del ticket.
- Cobro por efectivo, tarjeta o transferencia.
- Productos con alta, edicion y eliminacion usando Firebase Firestore.
- Finanzas por dia, total vendido, metodos de pago, reporte imprimible y guardado como PDF desde el navegador.
- Diseno responsive para celular y escritorio.
- Logo principal de esspreso.
- Productos base tomados del menu de cafeteria.
- Backend sencillo con Netlify Functions en `netlify/functions`.

## Estructura

```txt
esspreso-punto-acceso/
├─ index.html
├─ package.json
├─ netlify.toml
├─ firestore.rules
├─ .env
├─ .env.example
├─ public/assets/
│  ├─ logo-esspreso.jpeg
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
   └─ status.js
```

## Firebase

El proyecto ya trae la configuracion web de Firebase en `.env` y tambien como respaldo en `src/firebase.js` para que Netlify pueda construir aunque no subas el `.env`.

Variables usadas:

```env
VITE_FIREBASE_API_KEY=AIzaSyD7nddNYWyIrxfQZNeLKUN1i2c49sTO3po
VITE_FIREBASE_AUTH_DOMAIN=esspresoanch.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=esspresoanch
VITE_FIREBASE_STORAGE_BUCKET=esspresoanch.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=172136834596
VITE_FIREBASE_APP_ID=1:172136834596:web:eaaa38e85d2a34c3235ab1
VITE_FIREBASE_MEASUREMENT_ID=G-VR00WLZ9JS
```

## Reglas de Firestore para pruebas

Para pruebas puedes usar:

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

## Instalar y correr local

```bash
npm install
npm run dev
```

Abre:

```txt
http://localhost:5173
```

Para probar frontend + backend de Netlify en local necesitas tener Netlify CLI instalado:

```bash
npm install -g netlify-cli
npm run dev:netlify
```

Prueba el backend en:

```txt
http://localhost:8888/api/status
```

## Subir a GitHub

```bash
git init
git add .
git commit -m "punto de acceso esspreso"
git branch -M main
git remote add origin URL_DE_TU_REPOSITORIO
git push -u origin main
```

## Subir a Netlify desde GitHub

En Netlify selecciona el repositorio y usa:

```txt
Build command: npm run build
Publish directory: dist
Functions directory: netlify/functions
```

El archivo `netlify.toml` ya trae esta configuracion.

## Como usar

1. Entra a Productos.
2. Presiona `Cargar productos base` la primera vez.
3. Agrega, edita o elimina productos cuando sea necesario.
4. Entra a Venta.
5. Crea una mesa o ticket para llevar.
6. Agrega productos al ticket.
7. Cobra y selecciona efectivo, tarjeta o transferencia.
8. Entra a Finanzas para ver ventas por dia e imprimir el reporte.

## Notas

- El PDF del menu no se guarda en el codigo.
- Los productos se guardan en Firestore.
- Cuando edites productos desde la pagina, los tickets nuevos los leen automaticamente desde Firebase.
- El backend esta en la misma carpeta usando Netlify Functions.
