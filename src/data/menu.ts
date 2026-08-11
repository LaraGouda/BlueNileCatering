/**
 * Blue Nile Mediterranean Grill — Catering Menu Data
 *
 * Edit this file to add/remove/change menu items.
 * This structure is designed to be easy to swap for a Google Sheets
 * (or other backend) fetch later — just map fetched rows into MenuItem[].
 */

export interface OptionChoice {
  label: string;
  /** Extra cost added to the unit price when selected (e.g. +$8 grilled chicken) */
  priceDelta?: number;
}

export interface ItemOption {
  name: string;
  /** "single" = pick exactly one; "addon" = optional checkbox */
  type: "single" | "addon";
  choices: OptionChoice[];
  defaultChoice?: string;
}

export interface Variant {
  label: string;
  price: number;
}

export interface QuantityChoice {
  label: string;
}

export interface MenuItem {
  id: string;
  name: string;
  category: string;
  serves?: string;
  description?: string;
  /** Base price — omit when `variants` is used */
  price?: number;
  /** Mutually-exclusive versions of the item with their own prices */
  variants?: Variant[];
  options?: ItemOption[];
  quantityChoices?: QuantityChoice[];
  /** e.g. "each", "per person" */
  unit?: string;
}

export const CATEGORIES = [
  "Party Options",
  "Wraps & Sandwiches",
  "Meat Trays",
  "Vegetarian",
  "Pasta",
  "Salads & Sides",
  "Desserts",
  "Drinks",
] as const;

const RICE_OR_POTATOES: ItemOption = {
  name: "Side",
  type: "single",
  choices: [{ label: "Rice" }, { label: "Roasted Potatoes" }],
};

export const MENU_ITEMS: MenuItem[] = [
  // ---------- PARTY OPTIONS (Serves 10) ----------
  {
    id: "chicken-tenders-platter",
    name: "Chicken Tenders Platter",
    category: "Party Options",
    serves: "Serves 10",
    price: 60,
    description:
      "Served with your choice of Honey Mustard, BBQ Sauce, or Garlic Parmesan Cheese sauce",
    options: [
      {
        name: "Sauce",
        type: "single",
        choices: [
          { label: "Honey Mustard" },
          { label: "BBQ Sauce" },
          { label: "Garlic Parmesan Cheese" },
        ],
      },
    ],
  },
  {
    id: "fruit-cheese-platter",
    name: "Fresh Fruit & Cheese Platter",
    category: "Party Options",
    serves: "Serves 10",
    price: 55,
    description: "Includes fresh fruits and an assortment of cheeses, and crackers",
  },
  {
    id: "grilled-vegetables-platter",
    name: "Grilled Vegetables Platter",
    category: "Party Options",
    serves: "Serves 10",
    price: 55,
    description:
      "Includes Peppers, Asparagus, Zucchini, Corn, and roasted red potatoes with garlic, herbs, and balsamic vinegar.",
  },
  {
    id: "mediterranean-platter",
    name: "Mediterranean Platter",
    category: "Party Options",
    serves: "Serves 10",
    price: 70,
    description:
      "Includes homemade falafel, stuffed Grape leaves, hummus, Baba ganouj (Roasted Eggplant), Spanakopita, Tzatziki Sauce, Fresh Cucumbers, Cherry Tomatoes, Carrots, and toasted pita bread.",
  },
  {
    id: "stuffed-grape-leaves-platter",
    name: "Stuffed Grape Leaves Platter",
    category: "Party Options",
    serves: "Serves 10",
    price: 70,
    description:
      "Homemade grape leaves stuffed with rice, ground beef, and onions served with yogurt (Tzatziki sauce)",
  },
  {
    id: "baba-ganouj-tray",
    name: "Baba Ganouj Tray",
    category: "Party Options",
    serves: "Serves 10",
    price: 40,
    description:
      "Creamy, savory, smoky eggplant dip with tahini, garlic and citrus served with toasted pita, Cherry tomatoes, cucumbers, and carrots",
  },
  {
    id: "hummus-tray",
    name: "Homemade Hummus Tray",
    category: "Party Options",
    serves: "Serves 10",
    price: 40,
    description:
      "Creamiest homemade hummus served with toasted pita, Cherry tomatoes, cucumbers, and carrots",
  },
  {
    id: "hummus-pita-tray",
    name: "Hummus And Toasted Pita Tray",
    category: "Party Options",
    serves: "Serves 10",
    price: 25,
    description: "Creamiest homemade hummus served with toasted pita",
  },

  // ---------- WRAPS AND SANDWICHES (Serves 10) ----------
  {
    id: "chicken-shawarma-wrap-tray",
    name: "Chicken Shawarma Wrap Tray",
    category: "Wraps & Sandwiches",
    serves: "Serves 10",
    price: 70,
    description:
      "Includes grilled chicken shawarma wraps (w/ onions, green peppers & garlic cream sauce) and beef & lamb gyro wraps (w/ tzatziki sauce). Served with homemade hummus.",
  },
  {
    id: "beef-shawarma-wrap-tray",
    name: "Beef Shawarma Wrap Tray",
    category: "Wraps & Sandwiches",
    serves: "Serves 10",
    price: 75,
    description:
      "Includes grilled beef shawarma wraps (w/ onions, green peppers & garlic cream sauce) and beef & lamb gyro wraps (w/ tzatziki sauce). Served with homemade hummus.",
  },
  {
    id: "vegetarian-ciabatta",
    name: "Vegetarian Ciabatta Sandwiches",
    category: "Wraps & Sandwiches",
    serves: "Serves 10",
    price: 75,
    description:
      "Grilled Zucchini, bell peppers, caramelized onions, spinach, and mushrooms, topped with fresh mozzarella cheese on a warm toasted crispy bread.",
  },
  {
    id: "croissant-sandwiches",
    name: "Croissant Sandwiches",
    category: "Wraps & Sandwiches",
    serves: "Serves 10",
    price: 75,
    description:
      "Includes a mix of Turkey, Roast Beef, Tuna salad, topped with cheese, Lettuce, and mayo.",
  },

  // ---------- MEAT TRAYS (Serves 10, choice of Rice or Roasted Potatoes) ----------
  {
    id: "beef-shawarma-meat-tray",
    name: "Beef Shawarma Meat Tray",
    category: "Meat Trays",
    serves: "Serves 10",
    price: 75,
    description: "Thin-sliced beef marinated with spices.",
    options: [RICE_OR_POTATOES],
  },
  {
    id: "chicken-shawarma-meat-tray",
    name: "Chicken Shawarma Meat Tray",
    category: "Meat Trays",
    serves: "Serves 10",
    price: 70,
    description: "Thin-sliced chicken marinated with spices.",
    options: [RICE_OR_POTATOES],
  },
  {
    id: "chicken-skewers",
    name: "Chicken Skewers",
    category: "Meat Trays",
    serves: "Serves 10",
    price: 70,
    description:
      "Chicken cubes marinated and grilled. Served with Garlic creamy spread (Tumeia)",
    options: [RICE_OR_POTATOES],
  },
  {
    id: "beef-kabab",
    name: "Beef Kabab",
    category: "Meat Trays",
    serves: "Serves 10",
    price: 75,
    description:
      "Marinated and Grilled beef cubes. Served with Garlic creamy spread (Tumeia)",
    options: [RICE_OR_POTATOES],
  },
  {
    id: "mix-grill-feast",
    name: "Mix Grill Feast",
    category: "Meat Trays",
    serves: "Serves 10",
    price: 165,
    description:
      "Includes marinated beef kebabs, kofta (ground lamb & beef w/ parsley, onions & spices), lamb chops, and chicken skewers.",
    options: [RICE_OR_POTATOES],
  },
  {
    id: "diy-gyro-feast",
    name: "DIY GYRO Feast",
    category: "Meat Trays",
    serves: "Serves 10",
    price: 120,
    description:
      "Includes Gyro meat, French fries, fresh vegetables (onions, lettuce, tomatoes, and cucumbers) with toasted Gyro bread & Tzatziki sauce.",
  },
  {
    id: "grilled-shrimp",
    name: "Grilled Shrimp",
    category: "Meat Trays",
    serves: "Serves 10",
    price: 70,
    description: "Marinated and chargrilled shrimp skewers",
    options: [RICE_OR_POTATOES],
  },
  {
    id: "honey-balsamic-chicken",
    name: "Honey Balsamic Chicken",
    category: "Meat Trays",
    serves: "Serves 10",
    price: 60,
    description:
      "Chicken thigh marinated with garlic, herbs, olive oil, and our famous balsamic glaze.",
    options: [RICE_OR_POTATOES],
  },
  {
    id: "roast-beef-gravy",
    name: "Homemade Roast Beef and Gravy",
    category: "Meat Trays",
    serves: "Serves 10",
    price: 75,
    description:
      "Thin sliced beef marinated with wine, herbs, onions, and slow cooked.",
    options: [RICE_OR_POTATOES],
  },
  {
    id: "honey-glazed-salmon",
    name: "Honey Glazed Salmon",
    category: "Meat Trays",
    serves: "Serves 10",
    price: 80,
    description:
      "Fresh salmon marinated, grilled, and topped with our famous honey glaze and garlic sauce",
    options: [RICE_OR_POTATOES],
  },
  {
    id: "chicken-marsala",
    name: "Chicken Marsala",
    category: "Meat Trays",
    serves: "Serves 10",
    price: 65,
    description:
      "Chicken sautéed and simmered in a rich Marsala wine and mushroom sauce",
    options: [RICE_OR_POTATOES],
  },
  {
    id: "chicken-parmesan",
    name: "Chicken Parmesan",
    category: "Meat Trays",
    serves: "Serves 10",
    price: 65,
    description:
      "Breaded chicken cutlets topped with tomato sauce, mozzarella cheese, and Parmesan cheese",
    options: [RICE_OR_POTATOES],
  },
  {
    id: "meat-balls",
    name: "Meat Balls",
    category: "Meat Trays",
    serves: "Serves 10",
    price: 60,
    description:
      "Mediterranean-Style Meatballs & Potatoes soaked in tomato and garlic sauce",
  },

  // ---------- VEGETARIAN DISHES (Serves 10) ----------
  {
    id: "spinach-cheese-fillo",
    name: "Spinach and Cheese Fillo",
    category: "Vegetarian",
    serves: "Serves 10",
    price: 45,
    description: "Fillo pastry filled with fresh spinach, vegetables, and cheese",
  },
  {
    id: "kushari",
    name: "Kushari",
    category: "Vegetarian",
    serves: "Serves 10",
    price: 45,
    description:
      "Rice, elbow pasta, and black lentils served with spiced tomato sauce, garlic vinegar, chickpeas, and fried onions",
  },
  {
    id: "falafel",
    name: "Falafel",
    category: "Vegetarian",
    serves: "Serves 10",
    price: 35,
    description:
      "Chickpea fritters and Fava beans. Served with tahini sauce, pickled vegetables, and toasted pita",
  },

  // ---------- PASTA (Serves 10) ----------
  {
    id: "baked-ziti",
    name: "Baked Ziti",
    category: "Pasta",
    serves: "Serves 10",
    price: 40,
    description: "Baked pasta with ricotta, mozzarella, and Parmesan cheese",
  },
  {
    id: "penne-bechamel",
    name: "Penne w/ Béchamel Sauce",
    category: "Pasta",
    serves: "Serves 10",
    price: 60,
    description:
      "Baked Penne pasta, With ground beef, onions, creamy bechamel sauce",
  },
  {
    id: "cavatelli-cream-sauce",
    name: "Cavatelli Pasta in a Cream Sauce",
    category: "Pasta",
    serves: "Serves 10",
    price: 65,
    description:
      "Your choice of Grilled Shrimp or Grilled Chicken marinated with garlic, butter cooked with pasta and cream sauce",
    options: [
      {
        name: "Protein",
        type: "single",
        choices: [{ label: "Grilled Shrimp" }, { label: "Grilled Chicken" }],
      },
    ],
  },

  // ---------- SALADS AND SIDE ORDERS ----------
  {
    id: "mediterranean-salad",
    name: "Mediterranean Salad",
    category: "Salads & Sides",
    description:
      "Greens with bell peppers, tomatoes, red onions, black olives, cucumbers, feta, and vinaigrette dressing.",
    variants: [
      { label: "Half Tray", price: 35 },
      { label: "Full Tray", price: 55 },
    ],
  },
  {
    id: "caesar-salad",
    name: "Caesar Salad",
    category: "Salads & Sides",
    description:
      "Romaine lettuce, parmesan cheese, and croutons dressed with lemon juice, and Caesar dressing.",
    variants: [
      { label: "Half Tray", price: 35 },
      { label: "Full Tray", price: 55 },
    ],
    options: [
      {
        name: "Extras",
        type: "addon",
        choices: [{ label: "Add Grilled Chicken", priceDelta: 8 }],
      },
    ],
  },
  {
    id: "chickpea-salad",
    name: "Chickpea Salad",
    category: "Salads & Sides",
    serves: "Serves 8",
    price: 40,
    description:
      "Small cut Cucumbers, tomatoes, green peppers, creamy avocado, black olives, feta cheese, and homemade dressing",
  },
  {
    id: "pesto-pasta-salad",
    name: "Mediterranean-Style Pesto Pasta Salad",
    category: "Salads & Sides",
    serves: "Serves 8",
    price: 40,
    description:
      "Pasta with creamy fresh pesto sauce, cherry tomatoes, black olives, mozzarella pearls, and Romano cheese",
  },
  {
    id: "avocado-salad",
    name: "Tasty Avocado Salad",
    category: "Salads & Sides",
    serves: "Serves 8",
    price: 40,
    description:
      "Small cut Cucumbers, tomatoes, green peppers, creamy avocado, black olives, feta cheese, and homemade dressing",
  },
  {
    id: "couscous-salad",
    name: "Healthy Vegetarian Couscous Salad",
    category: "Salads & Sides",
    serves: "Serves 8",
    price: 40,
    description:
      "Cucumbers, tomatoes, green peppers, red onions, couscous, chickpea, and Mediterranean herbs topped with homemade dressing",
  },
  {
    id: "side-half-tray",
    name: "Side Half Tray",
    category: "Salads & Sides",
    serves: "1/2 Tray",
    price: 25,
    description:
      "Your choice of Yellow Rice, French Fries, Onion Rice, or Roasted Red Potatoes",
    options: [
      {
        name: "Side",
        type: "single",
        choices: [
          { label: "Yellow Rice" },
          { label: "French Fries" },
          { label: "Onion Rice" },
          { label: "Roasted Red Potatoes" },
        ],
      },
    ],
  },

  // ---------- DESSERTS ----------
  {
    id: "baklava",
    name: "Baklava",
    category: "Desserts",
    serves: "10–15 People",
    price: 50,
    description: "Phyllo pastry with honey and nuts",
  },
  {
    id: "baklava-cream",
    name: "Baklava with Cream Sauce",
    category: "Desserts",
    serves: "10–15 People",
    price: 50,
    description: "Phyllo pastry with homemade cream sauce and honey",
  },
  {
    id: "rice-pudding",
    name: "Rice Pudding",
    category: "Desserts",
    unit: "each",
    price: 5,
    description: "Rice with milk, cinnamon, coconut, topped with nuts",
  },
  {
    id: "cream-caramel",
    name: "Cream Caramel Cups",
    category: "Desserts",
    unit: "each",
    price: 3,
    description: "Silky custard, condensed milk, topped with caramel sauce",
  },
  {
    id: "choc-chip-cookies",
    name: "Chocolate Chip Cookies",
    category: "Desserts",
    unit: "each",
    price: 1.5,
  },

  // ---------- DRINKS ----------
  {
    id: "bottled-water",
    name: "Bottled Water",
    category: "Drinks",
    unit: "each",
    price: 1.75,
    description: "Add bottled water by quantity.",
    quantityChoices: [{ label: "Bottled Water" }],
  },
  {
    id: "assorted-drinks",
    name: "Assorted Drinks",
    category: "Drinks",
    unit: "each",
    price: 2,
    description: "Enter a total quantity and the cook will choose a mixed drink assortment.",
    quantityChoices: [{ label: "Assorted Drinks - cook's choice" }],
  },
  {
    id: "cola",
    name: "Cola/Pepsi",
    category: "Drinks",
    unit: "each",
    price: 2,
    description: "Coke or Pepsi products based on availability.",
    quantityChoices: [
      { label: "Regular Cola/Pepsi" },
      { label: "Diet Cola/Pepsi" },
    ],
  },
  {
    id: "lemon-lime-soda",
    name: "Sprite",
    category: "Drinks",
    unit: "each",
    price: 2,
    description: "Sprite or similar lemon-lime soda based on availability.",
    quantityChoices: [
      { label: "Regular Sprite" },
      { label: "Diet Sprite" },
    ],
  },
  {
    id: "dr-pepper",
    name: "Dr Pepper",
    category: "Drinks",
    unit: "each",
    price: 2,
    quantityChoices: [{ label: "Dr Pepper" }, { label: "Diet Dr Pepper" }],
  },
  {
    id: "ginger-ale",
    name: "Ginger Ale",
    category: "Drinks",
    unit: "each",
    price: 2,
    quantityChoices: [{ label: "Ginger Ale" }, { label: "Diet Ginger Ale" }],
  },
  {
    id: "orange-soda",
    name: "Orange Soda",
    category: "Drinks",
    unit: "each",
    price: 2,
    quantityChoices: [{ label: "Orange Soda" }, { label: "Diet Orange Soda" }],
  },
  {
    id: "snapple-iced-tea",
    name: "Snapple Iced Tea",
    category: "Drinks",
    unit: "each",
    price: 2.75,
    description: "Choose iced tea flavors by quantity.",
    quantityChoices: [
      { label: "Lemon Iced Tea" },
      { label: "Peach Iced Tea" },
    ],
  },
  {
    id: "snapple-juice",
    name: "Snapple Juice",
    category: "Drinks",
    unit: "each",
    price: 2.75,
    description: "Choose juice flavors by quantity.",
    quantityChoices: [
      { label: "Apple" },
      { label: "Kiwi Strawberry" },
    ],
  },
];

export const BUSINESS = {
  name: "Blue Nile Mediterranean Grill",
  tagline: "Let’s cater for your next event. We will bring the party to you.",
  about:
    "Blue Nile is a family-owned business serving South Jersey, Hamilton, Trenton, PA, and Jersey Shore area since 2019.",
  location: "NJ 33 - Hamilton, NJ",
  phone: "856-796-0113",
  phoneHref: "tel:8567960113",
  deliveryFee: 30,
  minimumPeople: 10,
  advanceNoticeHours: 12,
  paperSuppliesFeePerPerson: 0.5,
  individuallyWrappedFeePerPerson: 17.5,
};

export const formatPrice = (n: number) =>
  `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
