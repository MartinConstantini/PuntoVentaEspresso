exports.handler = async function () {
  try {
    const apiKey = process.env.VITE_FIREBASE_API_KEY;
    const projectId = process.env.VITE_FIREBASE_PROJECT_ID;

    if (!apiKey || !projectId) {
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ok: false,
          message: "Faltan variables de Firebase en Netlify"
        })
      };
    }

    const url =
      `https://firestore.googleapis.com/v1/projects/${projectId}` +
      `/databases/(default)/documents/products?key=${apiKey}`;

    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();

      return {
        statusCode: response.status,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ok: false,
          message: "No se pudo leer el menu",
          error: errorText
        })
      };
    }

    const data = await response.json();
    const documents = data.documents || [];

    const products = documents
      .map((doc) => firestoreDocToProduct(doc))
      .filter((product) => product.active !== false)
      .sort((a, b) => {
        const sectionCompare = sectionOrder(a.menuSection) - sectionOrder(b.menuSection);
        if (sectionCompare !== 0) return sectionCompare;
        const categoryCompare = String(a.category || "").localeCompare(String(b.category || ""), "es");
        if (categoryCompare !== 0) return categoryCompare;
        return String(a.name || "").localeCompare(String(b.name || ""), "es");
      });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
        "Netlify-CDN-Cache-Control": "public, max-age=3600, stale-while-revalidate=86400"
      },
      body: JSON.stringify({
        ok: true,
        updatedAt: new Date().toISOString(),
        products
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ok: false,
        message: "Error interno al generar menu publico",
        error: error.message
      })
    };
  }
};

function firestoreDocToProduct(doc) {
  const fields = doc.fields || {};
  const id = String(doc.name || "").split("/").pop();

  return {
    id,
    name: getValue(fields.name),
    category: getValue(fields.category),
    menuSection: inferMenuSection({
      menuSection: getValue(fields.menuSection),
      category: getValue(fields.category)
    }),
    price: Number(getValue(fields.price) || 0),
    description: getValue(fields.description) || "",
    imageTag: getValue(fields.imageTag) || "latte",
    active: getValue(fields.active) !== false
  };
}

const espressoCategories = new Set([
  "Bebidas calientes",
  "Bebidas frias",
  "Base horchata",
  "Otras bebidas",
  "Malteadas",
  "Frappe"
]);

function inferMenuSection(product = {}) {
  const section = String(product.menuSection || "").trim().toLowerCase();
  if (section === "brunchdy" || section === "espresso") return section;
  return espressoCategories.has(product.category || "") ? "espresso" : "brunchdy";
}

function sectionOrder(section = "") {
  return section === "espresso" ? 2 : 1;
}

function getValue(field) {
  if (!field) return "";

  if ("stringValue" in field) return field.stringValue;
  if ("integerValue" in field) return Number(field.integerValue);
  if ("doubleValue" in field) return Number(field.doubleValue);
  if ("booleanValue" in field) return Boolean(field.booleanValue);
  if ("nullValue" in field) return null;

  return "";
}
