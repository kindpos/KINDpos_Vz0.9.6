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
    "Mains":  [{ name: "Smash Burger", price: 12 }, { name: "Chicken Sand.", price: 11 }, { name: "Hot Dog", price: 8, is86: true }, { name: "Veggie Wrap", price: 10 }, { name: "Fish Tacos", price: 13 }, { name: "Ribeye", price: 24, isSpecial: true }],
    "Sides":  [{ name: "Waffle Fries", price: 5 }, { name: "Onion Rings", price: 5 }, { name: "Slaw", price: 4 }, { name: "Side Salad", price: 4 }, { name: "Mac & Cheese", price: 6 }],
    "Extras": [{ name: "Cheese +", price: 1 }, { name: "Bacon +", price: 2 }, { name: "Sauce", price: 0.5 }, { name: "Jalapeños", price: 0.5 }, { name: "Avocado", price: 1.5 }],
  },
  "Drinks": {
    "Non-Alc": [{ name: "Lemonade", price: 4 }, { name: "Soda", price: 3 }, { name: "Water", price: 2 }, { name: "Iced Tea", price: 3 }, { name: "Coffee", price: 3 }],
    "Beer":    [{ name: "IPA Draft", price: 7 }, { name: "Lager Draft", price: 6 }, { name: "Pilsner", price: 6 }, { name: "Stout", price: 8 }],
    "Wine":    [{ name: "House Red", price: 9 }, { name: "House White", price: 9 }, { name: "Prosecco", price: 11 }, { name: "Cab Sauv.", price: 12 }],
  },
  "Desserts": [{ name: "Brownie", price: 6 }, { name: "Ice Cream", price: 5 }, { name: "Cheesecake", price: 8 }],
};

export const MODIFIERS = [
  { name: "Onions", price: 0 },
  { name: "Jalapeños", price: 0.5 },
  { name: "Cheese", price: 1.0 },
  { name: "Bacon", price: 2.0 },
  { name: "Avocado", price: 1.5 },
  { name: "Lettuce", price: 0 },
  { name: "Tomato", price: 0 },
  { name: "Pickles", price: 0 },
  { name: "Mayo", price: 0 },
  { name: "Mustard", price: 0 },
  { name: "Ketchup", price: 0 },
  { name: "Hot Sauce", price: 0 }
];

export const MOD_PREFIXES = ["ADD", "NO", "ON SIDE", "LITE", "EXTRA"];

// Palm logo base64 — embedded to avoid external dependency
export const PALM_LOGO = "assets/palm.jpg";