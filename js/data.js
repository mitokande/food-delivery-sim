// Content tables. Pure data — no three.js, no DOM.

export const TILE = 10; // metres per city tile (Kenney kit unit)
export const GAME_MIN_PER_SEC = 40 / 60; // in-game minutes that pass per real second while riding
export const DAY_START = 8 * 60, DAY_END = 24 * 60;

export const DISTRICTS = [
  { id: 'oldtown', name: 'Old Town', employer: 'Corner Bites Co-op', pay: 1, traffic: 0.55, peds: 1.0, fee: 0,
    req: { lvl: 1 }, color: '#f2a541', desc: 'Short hops between family shops and cafés. Fragile coffee, chatty grannies. Every courier starts here.' },
  { id: 'downtown', name: 'Downtown', employer: 'ZipEats', pay: 1.8, traffic: 1.0, peds: 1.2, fee: 150,
    req: { lvl: 3, rating: 4.0, tier: 1 }, color: '#4aa8ff', desc: 'Offices: lunch rushes, VIPs and express orders. Heavy traffic, police and rivals; tips are stingy.' },
  { id: 'harbor', name: 'Harbor', employer: 'Dockside Express', pay: 2.6, traffic: 0.8, peds: 0.7, fee: 800,
    req: { lvl: 6, rating: 4.2 }, color: '#2ec4b6', desc: 'Long wide roads to the docks. Group orders for whole crews, road works and loose crates.' },
  { id: 'hills', name: 'Green Hills', employer: 'Hilltop Gourmet', pay: 3.6, traffic: 0.4, peds: 0.6, fee: 3500,
    req: { lvl: 10, rating: 4.5, speed: 50 }, color: '#7bd44a', desc: 'Long rides out to the villas and the best tips in town. VIPs everywhere. Watch for dogs.' },
];
export const DISTRICT = Object.fromEntries(DISTRICTS.map((d) => [d.id, d]));

// How each district plays (beyond its pay):
//   dist   restaurant → customer distance, in tiles (Manhattan) — Old Town hops, Green Hills long rides
//   same   share of customers in the same district (the rest live across town: longer rides)
//   tip    tip generosity            haz  road-hazard density       ev  chance of a street event
//   types  order-type weight multipliers (see ORDER_TYPES)          evW event weight multipliers (see ride/events.js)
//   traits short labels for the Jobs tab
export const DPROFILE = {
  oldtown: { dist: [5, 20], same: 0.85, tip: 1.0, haz: 1.0, ev: 1.0, types: { fragile: 1.6, big: 0.5, vip: 0.4, express: 0.3 }, evW: { granny: 1.6, pigeons: 1.5, door: 1.3, soup: 1.3 }, traits: ['Short hops', 'Fragile coffee', 'Grannies crossing'] },
  downtown: { dist: [8, 26], same: 0.8, tip: 0.85, haz: 0.9, ev: 1.25, types: { rush: 2.2, vip: 1.8, express: 1.8, big: 0.7, fragile: 0.8 }, evW: { rival: 1.7, police: 2, yellow: 1.5, door: 1.4 }, traits: ['Rush, VIP & Express', 'Heavy traffic', 'Tips ×0.85'] },
  harbor: { dist: [12, 34], same: 0.7, tip: 1.0, haz: 1.35, ev: 1.0, types: { big: 3.2, fragile: 0.5, rush: 0.8, express: 0.8 }, evW: { roadworks: 2, rival: 1.3, police: 1.2 }, traits: ['Group orders', 'Longer roads', 'Road works'] },
  hills: { dist: [16, 44], same: 0.5, tip: 1.6, haz: 0.75, ev: 0.9, types: { vip: 2.4, fragile: 1.6, big: 1.4, rush: 0.5, express: 0.6 }, evW: { dog: 3, ball: 1.6, granny: 1.3 }, traits: ['Long rides', 'Tips ×1.6', 'VIP villas', 'Dogs!'] },
};

// speed km/h; accel 0..1; bump = damage multiplier on bumps; fuel $/km; breakdown chance per ride
export const VEHICLES = [
  { id: 'rustbucket', name: 'Rust Bucket', tier: 0, price: 0, speed: 32, accel: 0.55, bump: 1.5, cap: 1, fuel: 3.3, breakdown: 0.28, boost: 1.0,
    engine: 'engine-moped', horn: 'horn-moped', paint: '#7fc8b8', box: '#b98a55', desc: 'Held together by tape and hope. It was free.' },
  { id: 'zippy', name: 'Zippy 50', tier: 1, price: 150, speed: 40, accel: 0.7, bump: 1.2, cap: 1, fuel: 1.8, breakdown: 0.06, boost: 1.0,
    engine: 'engine-scooter', horn: 'horn-scooter', paint: '#e9edf2', box: '#d9573f', desc: 'Second-hand, honest, starts every time.' },
  { id: 'vespetta', name: 'Vespetta 125', tier: 2, price: 900, speed: 52, accel: 0.8, bump: 1.0, cap: 2, fuel: 2.4, breakdown: 0.02, boost: 1.1,
    engine: 'engine-scooter', horn: 'horn-scooter', paint: '#e8432f', box: '#e8432f', desc: 'The classic. Two orders at once, and it looks great.' },
  { id: 'volt', name: 'Volt E-Scooter', tier: 3, price: 3000, speed: 58, accel: 0.95, bump: 0.9, cap: 2, fuel: 0.45, breakdown: 0, boost: 1.25,
    engine: 'engine-electric', horn: 'horn-scooter', paint: '#f4f6f8', box: '#2f6fd6', desc: 'Silent, instant torque, almost free to run. Never stalls.' },
  { id: 'mule', name: 'Mule Cargo Trike', tier: 3, price: 6000, speed: 48, accel: 0.6, bump: 0.55, cap: 4, fuel: 3.0, breakdown: 0.01, boost: 0.9,
    engine: 'engine-cargo', horn: 'horn-scooter', paint: '#4b6584', box: '#f39c33', desc: 'Four orders, rock steady. Soup arrives as soup.' },
  { id: 'viper', name: 'Viper 600', tier: 4, price: 10000, speed: 75, accel: 1.0, bump: 1.15, cap: 2, fuel: 4.5, breakdown: 0, boost: 1.5,
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
  express: { name: 'Express', pay: 2.2, eta: 0.7, tip: 1.5, w: 1.4, badge: 'EXPRESS', minLvl: 8 },
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
  rateScale: 0.45, // passive income stays below what riding yourself earns
  dispatch: 1.3, // ×income while you are out riding (you dispatch on the go)
  wageMin: 10, // daily wage = this many minutes of the courier's own earnings (always leaves them profitable)
  eventEvery: 45, // minutes of fleet time between decisions, on average
};
// $/min for one courier: district pay × base × vehicle speed factor × skill factor × (1-commission)
export const fleetRate = (district, veh, skill, cut = FLEET.commission) => DISTRICT[district].pay * 1.9 * (VEHICLE[veh].speed / 32) * (0.75 + skill * 0.12) * (1 - cut) * FLEET.rateScale;

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

// Employer ranks per district (deliveries there + rating there). Perks apply to that district's orders.
export const RANKS = [
  { id: 'rookie', name: 'Rookie', del: 0, rating: 0, pay: 0, tip: 0, perk: '' },
  { id: 'regular', name: 'Regular', del: 15, rating: 4.2, pay: 0.05, tip: 0, perk: '+5% pay' },
  { id: 'pro', name: 'Pro', del: 50, rating: 4.5, pay: 0.1, tip: 0.05, perk: '+10% pay · +5% tips' },
  { id: 'star', name: 'Star', del: 120, rating: 4.7, pay: 0.15, tip: 0.1, perk: '+15% pay · +10% tips' },
];

// Premium finishes for scooter paint, delivery box and helmet. Bought in the Garage or won (achievements, contracts).
export const PREMIUM = [
  { id: 'midnight', name: 'Midnight', color: '#1d2547', price: 900, metal: 0.4 },
  { id: 'mint', name: 'Mint Chrome', color: '#7fe0c8', price: 1600, metal: 0.75 },
  { id: 'neon', name: 'Neon Pink', color: '#ff3fa8', price: 2200, glow: 0.35 },
  { id: 'gold', name: 'Gold', color: '#d9a93a', price: 4500, metal: 0.9 },
  { id: 'chrome', name: 'Chrome', color: '#c9cfd8', price: 7000, metal: 1 },
  { id: 'lava', name: 'Lava', color: '#ff5a1f', price: 0, glow: 0.45, award: true },
  { id: 'galaxy', name: 'Galaxy', color: '#5b3fd6', price: 0, metal: 0.6, glow: 0.2, award: true },
];
export const PREMIUM_BY_COLOR = Object.fromEntries(PREMIUM.map((p) => [p.color, p]));

// Achievements: `stat` reads the save, `n` is the target. Reward: cash, or a premium paint (`paint`).
export const ACHIEVEMENTS = [
  { id: 'd10', name: 'First Shift', desc: 'Deliver 10 orders', stat: 'deliveries', n: 10, cash: 60 },
  { id: 'd100', name: 'Regular Face', desc: 'Deliver 100 orders', stat: 'deliveries', n: 100, cash: 400 },
  { id: 'd500', name: 'Street Legend', desc: 'Deliver 500 orders', stat: 'deliveries', n: 500, cash: 3000 },
  { id: 'd1000', name: 'The Whole City Knows You', desc: 'Deliver 1,000 orders', stat: 'deliveries', n: 1000, paint: 'galaxy' },
  { id: 'five50', name: 'Five-Star Service', desc: '50 five-star ratings', stat: 'fiveStars', n: 50, cash: 500 },
  { id: 'early50', name: 'Ahead of Time', desc: '50 early deliveries', stat: 'early', n: 50, cash: 500 },
  { id: 'ot100', name: 'Lane Splitter', desc: 'Overtake 100 cars', stat: 'overtakes', n: 100, cash: 300 },
  { id: 'hop100', name: 'Pothole Ballet', desc: '100 perfect hops', stat: 'perfectHops', n: 100, cash: 300 },
  { id: 'sc50', name: 'Local Knowledge', desc: 'Take 50 shortcuts', stat: 'shortcuts', n: 50, cash: 400 },
  { id: 'km100', name: 'Hundred Kilometres', desc: 'Ride 100 km', stat: 'km', n: 100, cash: 800 },
  { id: 'rain25', name: 'Singing in the Rain', desc: '25 deliveries in the rain', stat: 'rainy', n: 25, cash: 600 },
  { id: 'night25', name: 'Night Owl', desc: '25 deliveries after dark', stat: 'night', n: 25, cash: 600 },
  { id: 'vip25', name: 'Red Carpet', desc: '25 VIP deliveries', stat: 'vip', n: 25, cash: 1200 },
  { id: 'exp25', name: 'Need for Speed', desc: '25 Express deliveries', stat: 'express', n: 25, paint: 'lava' },
  { id: 'flow2', name: 'In the Zone', desc: 'Reach a ×2.0 Flow', stat: 'maxFlow', n: 2, cash: 500 },
  { id: 'earn10k', name: 'Five Figures', desc: 'Earn $10,000 in total', stat: 'earned', n: 10000, cash: 1000 },
  { id: 'earn100k', name: 'Delivery Tycoon', desc: 'Earn $100,000 in total', stat: 'earned', n: 100000, cash: 10000 },
  { id: 'all4', name: 'Key to the City', desc: 'Work in all four districts', stat: 'districts', n: 4, cash: 2000 },
  { id: 'star1', name: 'Employee of the Month', desc: 'Reach Star rank with any employer', stat: 'stars', n: 1, cash: 3000 },
  { id: 'fleet10', name: 'Dispatch Boss', desc: 'Have 10 couriers', stat: 'couriers', n: 10, cash: 5000 },
  { id: 'garage', name: 'Collector', desc: 'Own all six vehicles', stat: 'vehicles', n: 6, cash: 5000 },
  { id: 'contract10', name: 'Contractor', desc: 'Complete 10 weekly contracts', stat: 'contracts', n: 10, cash: 4000 },
];

// Weekly contracts: a fresh set every CONTRACT_DAYS in-game days. Scaled by level in state.js.
export const CONTRACT_DAYS = 5;
export const CONTRACTS = [
  { id: 'deliver', text: (n) => `Deliver ${n} orders`, n: 30 },
  { id: 'dist', text: (n, d) => `Deliver ${n} orders in ${d}`, n: 15, district: true },
  { id: 'five', text: (n) => `Get ${n} five-star ratings`, n: 15 },
  { id: 'early', text: (n) => `Deliver ${n} orders early`, n: 12 },
  { id: 'earn', text: (n) => `Earn $${n.toLocaleString('en-US')} riding`, n: 1, money: true },
  { id: 'nodamage', text: (n) => `${n} deliveries with no food damage`, n: 12 },
  { id: 'express', text: (n) => `Deliver ${n} Express orders`, n: 6, minLvl: 8 },
  { id: 'vip', text: (n) => `Deliver ${n} VIP orders`, n: 6, minLvl: 4 },
];
