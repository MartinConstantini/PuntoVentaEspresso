import { doc, setDoc, serverTimestamp, writeBatch } from "firebase/firestore";

export const defaultProducts = [
  { category: "Ensaladas", name: "Paraiso Dulce chica", price: 75, description: "Base de lechuga italiana, pasta, pollo, queso panela, fruta y crutones.", imageTag: "bowl" },
  { category: "Ensaladas", name: "Paraiso Dulce grande", price: 95, description: "Base de lechuga italiana, pasta, pollo, queso panela, fruta y crutones.", imageTag: "bowl" },
  { category: "Ensaladas", name: "Mix Frutal chica", price: 75, description: "Lechuga, pasta, pollo, jamon de pavo, pina, pepino, jicama, betabel, mango y fresa.", imageTag: "bowl" },
  { category: "Ensaladas", name: "Mix Frutal grande", price: 95, description: "Lechuga, pasta, pollo, jamon de pavo, pina, pepino, jicama, betabel, mango y fresa.", imageTag: "bowl" },
  { category: "Ensaladas", name: "Mix Salada chica", price: 75, description: "Lechuga, pasta, pollo, jamon de pavo, brocoli, zanahoria, repollo morado, espinaca y elote.", imageTag: "bowl" },
  { category: "Ensaladas", name: "Mix Salada grande", price: 95, description: "Lechuga, pasta, pollo, jamon de pavo, brocoli, zanahoria, repollo morado, espinaca y elote.", imageTag: "bowl" },
  { category: "Ensaladas", name: "Tropical chica", price: 75, description: "Lechuga, pasta, pollo, pina, pepino, repollo morado, mango, espinaca, cacahuate y ajonjoli.", imageTag: "bowl" },
  { category: "Ensaladas", name: "Tropical grande", price: 95, description: "Lechuga, pasta, pollo, pina, pepino, repollo morado, mango, espinaca, cacahuate y ajonjoli.", imageTag: "bowl" },
  { category: "Extras", name: "Proteina o aderezo extra", price: 15, description: "Extra para ensalada o bowl.", imageTag: "bowl" },

  { category: "Sandwich", name: "Pollo empanizado sencillo", price: 40, description: "Sandwich sencillo de pollo empanizado.", imageTag: "sandwich" },
  { category: "Sandwich", name: "Pollo empanizado triple", price: 60, description: "Sandwich triple de pollo empanizado.", imageTag: "sandwich" },
  { category: "Sandwich", name: "Pollo asado sencillo", price: 40, description: "Sandwich sencillo de pollo asado.", imageTag: "sandwich" },
  { category: "Sandwich", name: "Pollo asado triple", price: 60, description: "Sandwich triple de pollo asado.", imageTag: "sandwich" },
  { category: "Sandwich", name: "Jamon de pavo sencillo", price: 35, description: "Sandwich sencillo de jamon de pavo.", imageTag: "sandwich" },
  { category: "Sandwich", name: "Jamon de pavo triple", price: 50, description: "Sandwich triple de jamon de pavo.", imageTag: "sandwich" },

  { category: "Hamburguesas", name: "Pollo empanizado", price: 55, description: "Hamburguesa de pollo empanizado.", imageTag: "sandwich" },
  { category: "Hamburguesas", name: "Pollo empanizado con papas", price: 80, description: "Hamburguesa de pollo empanizado con papas.", imageTag: "sandwich" },

  { category: "Combos", name: "Sandwich sencillo mas ensalada", price: 70, description: "Combo de sandwich sencillo con ensalada.", imageTag: "sandwich" },
  { category: "Combos", name: "Sandwich triple mas ensalada", price: 85, description: "Combo de sandwich triple con ensalada.", imageTag: "sandwich" },

  { category: "Bowl", name: "Sushi Bowl", price: 100, description: "Arroz, pollo en salsa BBQ, queso crema, pepino, aguacate, mango, zanahoria y ajonjoli.", imageTag: "bowl" },
  { category: "Bowl", name: "Mix Bowl", price: 100, description: "Arroz, pollo asado, huevo cocido, elote amarillo, espinaca, arandano, germen, jitomate, aguacate y ajonjoli.", imageTag: "bowl" },

  { category: "Tortas", name: "Pollo empanizado", price: 55, description: "Torta de pollo empanizado.", imageTag: "sandwich" },
  { category: "Tortas", name: "Pollo asado", price: 50, description: "Torta de pollo asado.", imageTag: "sandwich" },
  { category: "Tortas", name: "Jamon de pavo", price: 40, description: "Torta de jamon de pavo.", imageTag: "sandwich" },

  { category: "Baguette", name: "Pollo empanizado", price: 95, description: "Baguette de pollo empanizado.", imageTag: "sandwich" },
  { category: "Baguette", name: "Pollo asado", price: 90, description: "Baguette de pollo asado.", imageTag: "sandwich" },
  { category: "Baguette", name: "Jamon de pavo", price: 60, description: "Baguette de jamon de pavo.", imageTag: "sandwich" },

  { category: "Bebidas calientes", name: "Latte", price: 60, description: "Bebida caliente.", imageTag: "latte" },
  { category: "Bebidas calientes", name: "Capuchino", price: 70, description: "Bebida caliente.", imageTag: "latte" },
  { category: "Bebidas calientes", name: "Caramel", price: 70, description: "Bebida caliente.", imageTag: "latte" },
  { category: "Bebidas calientes", name: "Chocolate", price: 60, description: "Bebida caliente.", imageTag: "latte" },
  { category: "Bebidas calientes", name: "Mocka", price: 70, description: "Bebida caliente.", imageTag: "latte" },
  { category: "Bebidas calientes", name: "Matcha", price: 70, description: "Bebida caliente.", imageTag: "latte" },
  { category: "Bebidas calientes", name: "Taro", price: 75, description: "Bebida caliente.", imageTag: "latte" },
  { category: "Bebidas calientes", name: "Chai", price: 75, description: "Bebida caliente.", imageTag: "latte" },

  { category: "Bebidas frias", name: "Latte", price: 60, description: "Bebida fria.", imageTag: "latte" },
  { category: "Bebidas frias", name: "Caramel", price: 70, description: "Bebida fria.", imageTag: "latte" },
  { category: "Bebidas frias", name: "Mocka", price: 70, description: "Bebida fria.", imageTag: "latte" },
  { category: "Bebidas frias", name: "Chai", price: 75, description: "Bebida fria.", imageTag: "latte" },
  { category: "Bebidas frias", name: "Taro", price: 75, description: "Bebida fria.", imageTag: "latte" },
  { category: "Bebidas frias", name: "Matcha", price: 75, description: "Bebida fria.", imageTag: "latte" },

  { category: "Base horchata", name: "Latte", price: 75, description: "Bebida base horchata.", imageTag: "latte" },
  { category: "Base horchata", name: "Matcha", price: 90, description: "Bebida base horchata.", imageTag: "latte" },
  { category: "Base horchata", name: "Vaso de agua de horchata", price: 30, description: "Vaso de agua de horchata.", imageTag: "latte" },

  { category: "Otras bebidas", name: "Agua", price: 20, description: "Agua natural.", imageTag: "latte" },
  { category: "Otras bebidas", name: "Soda italiana", price: 55, description: "Sabor fresa o limon.", imageTag: "latte" },
  { category: "Extras", name: "Caramelo o leche de almendra", price: 10, description: "Extra para bebida.", imageTag: "latte" },

  { category: "Malteadas", name: "Fresa", price: 30, description: "Disponible por la tarde.", imageTag: "latte" },
  { category: "Malteadas", name: "Chocolate", price: 30, description: "Disponible por la tarde.", imageTag: "latte" },
  { category: "Malteadas", name: "Cafe", price: 30, description: "Disponible por la tarde.", imageTag: "latte" },
  { category: "Malteadas", name: "Vainilla", price: 30, description: "Disponible por la tarde.", imageTag: "latte" },

  { category: "Frappe", name: "Caramel", price: 70, description: "Disponible por la tarde.", imageTag: "latte" },
  { category: "Frappe", name: "Mocka", price: 75, description: "Disponible por la tarde.", imageTag: "latte" },
  { category: "Frappe", name: "Taro", price: 80, description: "Disponible por la tarde.", imageTag: "latte" },

  { category: "Crepas", name: "Clasica", price: 70, description: "Nutella, queso crema o mermelada + 2 frutas de tu eleccion.", imageTag: "crepa" },
  { category: "Crepas", name: "Frutal", price: 75, description: "Nutella, queso crema o mermelada + frutas de temporada.", imageTag: "crepa" },
  { category: "Crepas", name: "Frutos rojos", price: 80, description: "Nutella, queso crema o mermelada + miel y frutos rojos.", imageTag: "crepa" },
  { category: "Waffles", name: "Clasico", price: 65, description: "Nutella, queso crema o mermelada + 2 frutas de tu eleccion.", imageTag: "crepa" },
  { category: "Waffles", name: "Frutal", price: 70, description: "Nutella, queso crema o mermelada + frutas de temporada.", imageTag: "crepa" },
  { category: "Waffles", name: "Frutos rojos", price: 75, description: "Nutella, queso crema o mermelada + miel y frutos rojos.", imageTag: "crepa" }
];

const espressoCategories = new Set([
  "Bebidas calientes",
  "Bebidas frias",
  "Base horchata",
  "Otras bebidas",
  "Malteadas",
  "Frappe"
]);

function inferMenuSection(product = {}) {
  if (product.menuSection === "brunchdy" || product.menuSection === "espresso") return product.menuSection;
  return espressoCategories.has(product.category || "") ? "espresso" : "brunchdy";
}

function slug(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function seedDefaultProducts(db) {
  const batch = writeBatch(db);
  defaultProducts.forEach((product) => {
    const id = slug(`${product.category}-${product.name}`);
    batch.set(doc(db, "products", id), {
      ...product,
      menuSection: inferMenuSection(product),
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
  });
  await batch.commit();
}
