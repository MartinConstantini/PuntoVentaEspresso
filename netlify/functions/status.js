export async function handler() {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify({
      ok: true,
      app: "esspreso",
      mensaje: "Backend funcionando desde Netlify Functions",
      frontend: "Vite",
      backend: "Netlify Functions",
      firebaseProject: "esspresoanch",
      fecha: new Date().toISOString()
    })
  };
}
