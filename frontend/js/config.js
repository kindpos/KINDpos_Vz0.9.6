// ═══════════════════════════════════════════════════
//  KINDpos Terminal Vz1 — Configuration
//  Nice. Dependable. Yours.
// ═══════════════════════════════════════════════════

export const CFG = {
  TID: "T-01",
  VER: "Vz1",
  TAX: 0.0,           // Fetched from backend at login; 0 until configured
  CASH_DISC: 0.035,
  API_BASE: "",        // Empty = same origin; set for remote backend
  API_TIMEOUT: 3000,   // ms before falling back to offline roster
};

// Fallback roster — used when API is unreachable
export const FALLBACK_ROSTER = [
  { id: "mgr-fallback",  name: "Manager",  pin: "0000", role: "manager" },
  { id: "svr-fallback",  name: "Server",   pin: "9999", role: "server"  },
];

// Fallback menu — used when API is unreachable
// Structure: Category → Subcategory → Items (matches hex nav 3-level depth)
// Categories with only a few items can be flat arrays (no subcats)
export const FALLBACK_MENU = {
  "Food": {
    "Appetizers": {
      "Wings":  [{ name: "Buffalo", price: 13 }, { name: "BBQ", price: 13 }, { name: "Teriyaki", price: 13 }, { name: "Nashville Hot", price: 14 }],
      "Nachos":  [{ name: "Classic", price: 11 }, { name: "Supreme", price: 13 }, { name: "Chicken", price: 14 }],
      "Salads":  [{ name: "Caesar", price: 10 }, { name: "House", price: 9 }, { name: "Cobb", price: 12 }],
    },
    "Entrees": {
      "Burgers": [{ name: "Classic", price: 12 }, { name: "Cheese", price: 13 }, { name: "Bacon", price: 14 }, { name: "Mushroom Swiss", price: 15 }],
      "Pasta":   [{ name: "Alfredo", price: 14 }, { name: "Marinara", price: 13 }, { name: "Carbonara", price: 15 }],
      "Steaks":  [{ name: "Ribeye", price: 28 }, { name: "NY Strip", price: 26 }, { name: "Filet", price: 32 }],
    },
    "Sides": [{ name: "Fries", price: 5 }, { name: "Sweet Potato Fries", price: 6 }, { name: "Onion Rings", price: 5 }, { name: "Mac & Cheese", price: 6 }, { name: "Coleslaw", price: 4 }, { name: "Steamed Veggies", price: 5 }],
  },
  "Drinks": {
    "Soda":   [{ name: "Cola", price: 3 }, { name: "Lemon-Lime", price: 3 }, { name: "Root Beer", price: 3 }, { name: "Ginger Ale", price: 3 }],
    "Juice":  [{ name: "Orange", price: 4 }, { name: "Apple", price: 4 }, { name: "Cranberry", price: 4 }],
    "Coffee": [{ name: "Regular", price: 3 }, { name: "Decaf", price: 3 }, { name: "Espresso", price: 4 }, { name: "Latte", price: 5 }],
    "Beer":   [{ name: "IPA", price: 7 }, { name: "Lager", price: 6 }, { name: "Stout", price: 8 }, { name: "Pilsner", price: 6 }],
  },
  "Desserts": {
    "Cakes":     [{ name: "Chocolate", price: 8 }, { name: "Red Velvet", price: 8 }, { name: "Cheesecake", price: 9 }, { name: "Carrot", price: 8 }],
    "Ice Cream": [{ name: "Vanilla", price: 5 }, { name: "Chocolate", price: 5 }, { name: "Strawberry", price: 5 }, { name: "Mint Chip", price: 6 }],
    "Pies":      [{ name: "Apple", price: 7 }, { name: "Pecan", price: 8 }, { name: "Key Lime", price: 8 }],
  },
};

export const MODIFIERS = {
  "Produce": [
    { name: "Lettuce", price: 0 },
    { name: "Tomato", price: 0 },
    { name: "Onions", price: 0 },
    { name: "Jalapeños", price: 0.5 },
    { name: "Avocado", price: 1.5 },
    { name: "Pickles", price: 0 },
  ],
  "Protein": [
    { name: "Cheese", price: 1.0 },
    { name: "Bacon", price: 2.0 },
  ],
  "Sauce": [
    { name: "Mayo", price: 0 },
    { name: "Mustard", price: 0 },
    { name: "Ketchup", price: 0 },
    { name: "Hot Sauce", price: 0 },
  ],
};

export const MOD_PREFIXES = ["ADD", "NO", "ON SIDE", "LITE", "EXTRA"];

// Palm logo base64 — embedded to avoid external dependency
export const PALM_LOGO = "assets/palm.jpg";