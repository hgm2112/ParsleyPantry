/**
 * Deterministic emoji + pastel-gradient tiles for recipes and pantry items.
 * Everything is derived from a stable hash of the name so tiles never flicker
 * between renders and need no image storage.
 */

const KEYWORDS: [RegExp, string][] = [
  [/\b(chicken|poultry|drumstick|rotisserie)\b/, "🍗"],
  [/\b(beef|steak|meatball|burger)\b/, "🥩"],
  [/\b(pork|bacon|ham|sausage)\b/, "🥓"],
  [/\b(fish|salmon|tuna|shrimp|prawn|cod)\b/, "🐟"],
  [/\b(pasta|spaghetti|noodle|lasagna|penne|mac)\b/, "🍝"],
  [/\b(pizza)\b/, "🍕"],
  [/\b(rice|risotto|sushi|biryani|paella)\b/, "🍚"],
  [/\b(oat|oats|porridge|granola|muesli)\b/, "🥣"],
  [/\b(salad|greens|lettuce|arugula|slaw)\b/, "🥗"],
  [/\b(wrap|burrito|taco|quesadilla|fajita)\b/, "🌯"],
  [/\b(soup|stew|broth|chili|ramen)\b/, "🍲"],
  [/\b(sandwich|toast|sub|panini)\b/, "🥪"],
  [/\b(egg|omelet|omelette|quiche|frittata)\b/, "🍳"],
  [/\b(muffin|scone|pastry|croissant|danish)\b/, "🥐"],
  [/\b(bread|bagel|bun|roll|loaf|dough)\b/, "🍞"],
  [/\b(cookie|biscuit|brownie|blondie)\b/, "🍪"],
  [/\b(cake|cupcake|pie|tart|dessert|pudding|custard)\b/, "🍰"],
  [/\b(smoothie|shake|juice|latte|tea|coffee|drink)\b/, "🥤"],
  [/\b(sauce|salsa|pesto|marinade|dressing)\b/, "🥫"],
  [/\b(milk|milkshake)\b/, "🥛"],
  [/\b(cheese|yogurt|yoghurt|cream|butter)\b/, "🧀"],
  [/\b(potato|fries|roast)\b/, "🥔"],
  [/\b(tomato|marinara)\b/, "🍅"],
  [/\b(onion|garlic|scallion)\b/, "🧅"],
  [/\b(pepper|chili|chile|jalape)\b/, "🫑"],
  [/\b(carrot)\b/, "🥕"],
  [/\b(corn)\b/, "🌽"],
  [/\b(mushroom)\b/, "🍄"],
  [/\b(fruit|apple|banana|berry|berries|orange|grape|peach|pear|melon)\b/, "🍎"],
  [/\b(Bean|lentil|chickpea|hummus)\b/i, "🫘"],
  [/\b(nut|almond|peanut|walnut|cashew)\b/, "🥜"],
  [/\b(honey|syrup|jam|spread)\b/, "🍯"],
  [/\b(pasta sauce|tomato)\b/, "🥫"],
  [/\b(frozen|ice|popsicle)\b/, "🧊"],
  [/\b(dinner|supper|roast|bowl|plate|meal)\b/, "🍽️"],
];

const FALLBACK = ["🍳", "🥘", "🍽️", "🥘", "🍲", "🧁", "🥐", "🥗"];

const GRADIENTS = [
  "from-emerald-100 to-teal-50",
  "from-violet-100 to-fuchsia-50",
  "from-amber-100 to-orange-50",
  "from-sky-100 to-blue-50",
  "from-rose-100 to-pink-50",
  "from-lime-100 to-green-50",
  "from-purple-100 to-indigo-50",
  "from-cyan-100 to-sky-50",
];

const AISLE_KEYWORDS: [RegExp, string][] = [
  [/\b(freezer|frozen)\b/, "🧊"],
  [/\b(drink|drinks|juice|soda|beverage|beverages)\b/, "🥤"],
  [/\b(canned|can)\b/, "🥫"],
  [/\b(baking|bake)\b/, "🧁"],
  [/\b(cleaning|cleaner|household)\b/, "🧹"],
  [/\b(paper|toilet|tissue)\b/, "🧻"],
  [/\b(meat|butcher)\b/, "🥩"],
  [/\b(deli)\b/, "🥪"],
  [/\b(produce|fruit|fruits|vegetable|vegetables|veg)\b/, "🥬"],
  [/\b(bread|bakery)\b/, "🍞"],
  [/\b(dairy|egg|eggs|milk)\b/, "🥚"],
  [/\b(breakfast|cereal)\b/, "🥣"],
  [/\b(snack|snacks|chip|chips)\b/, "🍟"],
  [/\b(cookie|cookies|candy|cracker|crackers|sweets)\b/, "🍪"],
  [/\b(mexican|asian|international|ethnic|world)\b/, "🌮"],
  [/\b(pasta|rice|grain|grains)\b/, "🍝"],
  [/\b(sauce|sauces|condiment|condiments|spice|spices)\b/, "🧂"],
  [/\b(personal|hygiene|care|beauty)\b/, "🧴"],
  [/\b(pet|pets|dog|cat)\b/, "🐾"],
  [/\b(baby|babies|infant)\b/, "🍼"],
  [/\b(health|pharmacy|vitamin|medicine)\b/, "💊"],
];

export function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

/** Food emoji picked from name/tag keywords, with a stable fallback. */
export function foodEmoji(name: string, tags: string[] = []): string {
  const haystack = `${name} ${tags.join(" ")}`;
  for (const [pattern, emoji] of KEYWORDS) {
    if (pattern.test(haystack)) return emoji;
  }
  return FALLBACK[hashString(name) % FALLBACK.length];
}

/** Emoji for a store aisle or category title (aisle words → food → cart).
 *  Returns null when the title already carries an emoji of its own. */
export function aisleEmoji(name: string): string | null {
  if (/\p{Extended_Pictographic}/u.test(name)) return null;
  const lower = name.toLowerCase();
  for (const [pattern, emoji] of AISLE_KEYWORDS) {
    if (pattern.test(lower)) return emoji;
  }
  for (const [pattern, emoji] of KEYWORDS) {
    if (pattern.test(lower)) return emoji;
  }
  return "🛒";
}

/** Pastel gradient background classes ("from-… to-…"). */
export function tileGradient(name: string): string {
  return GRADIENTS[hashString(name) % GRADIENTS.length];
}

export type Tile = { emoji: string; gradient: string };

export function tileFor(name: string, tags: string[] = []): Tile {
  return { emoji: foodEmoji(name, tags), gradient: tileGradient(name) };
}
