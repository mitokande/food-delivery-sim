// Content tables. Pure data — no three.js, no DOM.

export const TILE = 10; // metres per city tile (Kenney kit unit)
export const GAME_MIN_PER_SEC = 40 / 60; // in-game minutes that pass per real second while riding
export const DAY_START = 8 * 60, DAY_END = 24 * 60;

export const DISTRICTS = [
  { id: 'oldtown', name: 'Old Town', employer: 'Corner Bites Co-op', pay: 1, traffic: 0.55, peds: 1.0, fee: 0,
    req: { lvl: 1 }, color: '#f2a541', desc: 'Narrow streets and family shops. Every courier starts here.' },
  { id: 'downtown', name: 'Downtown', employer: 'ZipEats', pay: 1.8, traffic: 1.0, peds: 1.2, fee: 150,
    req: { lvl: 3, rating: 4.0, tier: 1 }, color: '#4aa8ff', desc: 'Towers, offices and heavy traffic. Tight ETAs, better pay.' },
  { id: 'harbor', name: 'Harbor', employer: 'Dockside Express', pay: 2.6, traffic: 0.8, peds: 0.7, fee: 800,
    req: { lvl: 6, rating: 4.2 }, color: '#2ec4b6', desc: 'Warehouses, piers and seafood. Long wide roads, big orders.' },
  { id: 'hills', name: 'Green Hills', employer: 'Hilltop Gourmet', pay: 3.6, traffic: 0.4, peds: 0.6, fee: 3500,
    req: { lvl: 10, rating: 4.5, speed: 50 }, color: '#7bd44a', desc: 'Quiet suburbs, long rides, generous tips. Watch for dogs.' },
];
export const DISTRICT = Object.fromEntries(DISTRICTS.map((d) => [d.id, d]));

// speed km/h; accel 0..1; bump = damage multiplier on bumps; fuel $/km; breakdown chance per ride
export const VEHICLES = [
  { id: 'rustbucket', name: 'Rust Bucket', tier: 0, price: 0, speed: 32, accel: 0.55, bump: 1.5, cap: 1, fuel: 1.1, breakdown: 0.28, boost: 1.0,
    engine: 'engine-moped', horn: 'horn-moped', paint: '#7fc8b8', box: '#b98a55', desc: 'Held together by tape and hope. It was free.' },
  { id: 'zippy', name: 'Zippy 50', tier: 1, price: 150, speed: 40, accel: 0.7, bump: 1.2, cap: 1, fuel: 0.6, breakdown: 0.06, boost: 1.0,
    engine: 'engine-scooter', horn: 'horn-scooter', paint: '#e9edf2', box: '#d9573f', desc: 'Second-hand, honest, starts every time.' },
  { id: 'vespetta', name: 'Vespetta 125', tier: 2, price: 900, speed: 52, accel: 0.8, bump: 1.0, cap: 2, fuel: 0.8, breakdown: 0.02, boost: 1.1,
    engine: 'engine-scooter', horn: 'horn-scooter', paint: '#e8432f', box: '#e8432f', desc: 'The classic. Two orders at once, and it looks great.' },
  { id: 'volt', name: 'Volt E-Scooter', tier: 3, price: 3000, speed: 58, accel: 0.95, bump: 0.9, cap: 2, fuel: 0.15, breakdown: 0, boost: 1.25,
    engine: 'engine-electric', horn: 'horn-scooter', paint: '#f4f6f8', box: '#2f6fd6', desc: 'Silent, instant torque, almost free to run. Never stalls.' },
  { id: 'mule', name: 'Mule Cargo Trike', tier: 3, price: 6000, speed: 48, accel: 0.6, bump: 0.55, cap: 4, fuel: 1.0, breakdown: 0.01, boost: 0.9,
    engine: 'engine-cargo', horn: 'horn-scooter', paint: '#4b6584', box: '#f39c33', desc: 'Four orders, rock steady. Soup arrives as soup.' },
  { id: 'viper', name: 'Viper 600', tier: 4, price: 10000, speed: 75, accel: 1.0, bump: 1.15, cap: 2, fuel: 1.5, breakdown: 0, boost: 1.5,
    engine: 'engine-sport', horn: 'horn-sport', paint: '#43b34a', box: '#22262e', desc: 'Stupidly fast. The turbo will make you laugh.' },
];
export const VEHICLE = Object.fromEntries(VEHICLES.map((v) => [v.id, v]));

export const PARTS = [
  { id: 'engine', name: 'Engine', icon: 'ui-speed', desc: '+6% top speed per level' },
  { id: 'suspension', name: 'Suspension', icon: 'ui-heart', desc: '−12% food damage from bumps per level' },
  { id: 'box', name: 'Thermal Box', icon: 'ui-thermo', desc: 'Food stays hot/cold longer. Level 5: +1 order capacity' },
  { id: 'tires', name: 'Tires', icon: 'ui-route', desc: 'Faster cornering, softer landings' },
];
export const PART_MAX = 5;
export const partCost = (veh, part, lvl) => Math.round(Math.max(30, veh.price * 0.09 + 25) * Math.pow(1.75, lvl) / 5) * 5;

export const PAINTS = ['#e8432f', '#f2a541', '#ffd84d', '#43b34a', '#2ec4b6', '#2f6fd6', '#8e5bd6', '#ff7eb6', '#f4f6f8', '#2b2f38'];
export const PAINT_COST = 60;

export const SKILLS = [
  { id: 'riding', name: 'Riding', icon: 'ui-nitro', desc: 'Turbo lasts longer and recharges faster', per: '+15% turbo' },
  { id: 'navigation', name: 'Navigation', icon: 'ui-shortcut', desc: 'Lv1 reveals shortcuts through alleys and parks; more ETA slack', per: '+4% ETA' },
  { id: 'charm', name: 'Charm', icon: 'ui-heart', desc: 'Customers tip more and forgive more', per: '+12% tips' },
  { id: 'reflexes', name: 'Reflexes', icon: 'ui-clock', desc: 'More time to react in events, wider perfect windows', per: '+12% reaction time' },
  { id: 'stamina', name: 'Stamina', icon: 'ui-bolt', desc: 'Bigger turbo tank', per: '+20% energy' },
];
export const SKILL_MAX = 5;
export const skillCost = (lvl) => [40, 150, 450, 1200, 3000][lvl] ?? 99999;

export const FOODS = {
  burger: { name: 'Burger', icon: 'food-burger', cold: false, fragile: 1.0 },
  pizza: { name: 'Pizza', icon: 'food-pizza', cold: false, fragile: 0.8 },
  sushi: { name: 'Sushi', icon: 'food-sushi', cold: true, fragile: 1.35 },
  coffee: { name: 'Coffee', icon: 'food-coffee', cold: false, fragile: 2.0 },
  donut: { name: 'Donuts', icon: 'food-donut', cold: true, fragile: 0.8 },
  taco: { name: 'Tacos', icon: 'food-taco', cold: false, fragile: 1.2 },
  noodle: { name: 'Noodles', icon: 'food-noodle', cold: false, fragile: 1.5 },
  doner: { name: 'Döner', icon: 'food-doner', cold: false, fragile: 0.9 },
  fish: { name: 'Fish & Chips', icon: 'food-fish', cold: false, fragile: 1.0 },
  icecream: { name: 'Ice Cream', icon: 'food-icecream', cold: true, melts: true, fragile: 1.1 },
};

// Restaurants (model = node in restaurants.glb). Placed by the city generator, one per entry.
export const RESTAURANTS = [
  { id: 'sunny', name: 'Sunny Burger', food: 'burger', model: 'rest-burger', district: 'oldtown', color: '#ffc53d' },
  { id: 'sultan', name: 'Sultan Döner', food: 'doner', model: 'rest-doner', district: 'oldtown', color: '#e8432f' },
  { id: 'bean', name: 'Bean There', food: 'coffee', model: 'rest-cafe', district: 'oldtown', color: '#a8744f' },
  { id: 'mamma', name: 'Mamma Pizza', food: 'pizza', model: 'rest-pizza', district: 'oldtown', color: '#3fae4a' },
  { id: 'sakura', name: 'Sakura Sushi', food: 'sushi', model: 'rest-sushi', district: 'downtown', color: '#e05a6b' },
  { id: 'wok', name: 'Wok This Way', food: 'noodle', model: 'rest-noodle', district: 'downtown', color: '#d9a62e' },
  { id: 'taco', name: 'Taco Loco', food: 'taco', model: 'rest-taco', district: 'downtown', color: '#f07c2a' },
  { id: 'bean2', name: 'Bean There', food: 'coffee', model: 'rest-cafe', district: 'downtown', color: '#a8744f' },
  { id: 'salty', name: 'Salty Fry', food: 'fish', model: 'rest-fish', district: 'harbor', color: '#2d5c9a' },
  { id: 'sakura2', name: 'Sakura Sushi', food: 'sushi', model: 'rest-sushi', district: 'harbor', color: '#e05a6b' },
  { id: 'mamma2', name: 'Mamma Pizza', food: 'pizza', model: 'rest-pizza', district: 'harbor', color: '#3fae4a' },
  { id: 'scoops', name: 'Scoops', food: 'icecream', model: 'rest-icecream', district: 'hills', color: '#ff9ccf' },
  { id: 'donut', name: 'Donut Worry', food: 'donut', model: 'rest-donut', district: 'hills', color: '#ff6fae' },
  { id: 'sunny2', name: 'Sunny Burger', food: 'burger', model: 'rest-burger', district: 'hills', color: '#ffc53d' },
];
export const RESTAURANT = Object.fromEntries(RESTAURANTS.map((r) => [r.id, r]));

export const ORDER_TYPES = {
  standard: { name: 'Standard', pay: 1, eta: 1, tip: 1, w: 10 },
  rush: { name: 'Rush', pay: 1.5, eta: 0.78, tip: 1.2, w: 3, badge: 'RUSH' },
  fragile: { name: 'Fragile', pay: 1.35, eta: 1.1, tip: 1.3, w: 2, badge: 'FRAGILE', fragile: 1.8 },
  big: { name: 'Group order', pay: 2.1, eta: 1.15, tip: 1.1, w: 2, badge: 'BIG ×2', size: 2 },
  vip: { name: 'VIP', pay: 2.4, eta: 0.9, tip: 2, w: 1, badge: 'VIP', minLvl: 4 },
};

export const FIRST_NAMES = ['Emma', 'Mert', 'Lena', 'Kaan', 'Noah', 'Zeynep', 'Leo', 'Ayla', 'Omar', 'Mia', 'Can', 'Sofia', 'Jonas', 'Elif', 'Theo',
  'Nora', 'Deniz', 'Hugo', 'Ece', 'Max', 'Iris', 'Arda', 'Yuki', 'Selin', 'Luca', 'Defne', 'Felix', 'Ada', 'Emir', 'Lara', 'Oscar', 'Nil', 'Ravi', 'Esra', 'Milo'];
export const CHAR_IDS = ['male-a', 'male-b', 'male-c', 'male-d', 'male-e', 'male-f', 'female-a', 'female-b', 'female-c', 'female-d', 'female-e', 'female-f'];

// Fleet / dispatch office
export const FLEET = {
  unlockLvl: 5,
  officeCost: 1500,
  levels: [ // office level → courier slots, offline cap (hours), upgrade cost to reach this level
    { slots: 2, cap: 2, cost: 0 },
    { slots: 3, cap: 3, cost: 2500 },
    { slots: 5, cap: 5, cost: 7000 },
    { slots: 7, cap: 8, cost: 18000 },
    { slots: 10, cap: 12, cost: 45000 },
  ],
  commission: 0.3,
  hireBase: 120,
};
// $/min for one courier: district pay × base × vehicle speed factor × skill factor × (1-commission)
export const fleetRate = (district, veh, skill) => DISTRICT[district].pay * 1.9 * (VEHICLE[veh].speed / 32) * (0.75 + skill * 0.12) * (1 - FLEET.commission);

export const xpToNext = (lvl) => Math.round(90 * Math.pow(lvl, 1.35) / 10) * 10;

// Daily goal templates
export const GOALS = [
  { id: 'deliver', text: (n) => `Deliver ${n} orders`, n: [4, 6, 8], reward: 1 },
  { id: 'five', text: (n) => `Get ${n} five-star ratings`, n: [2, 3, 4], reward: 1.3 },
  { id: 'shortcut', text: (n) => `Take ${n} shortcuts`, n: [2, 3], reward: 1, needs: 'navigation' },
  { id: 'overtake', text: (n) => `Overtake ${n} cars`, n: [3, 5, 8], reward: 0.8 },
  { id: 'perfect', text: (n) => `Land ${n} perfect hops`, n: [3, 5], reward: 0.8 },
  { id: 'early', text: (n) => `Deliver ${n} orders early`, n: [2, 3, 4], reward: 1.1 },
  { id: 'nodamage', text: (n) => `${n} deliveries with no food damage`, n: [1, 2, 3], reward: 1.2 },
];
