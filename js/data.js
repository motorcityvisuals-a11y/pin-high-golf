// Static game data: clubs, brands, outfits, courses, time-of-day presets.
const YD = 0.9144;           // metres per yard (world units are yards)
const G = 9.81 / YD;         // gravity in yd/s^2
const G_GRAV = G;            // alias: game.js shadows G with its state object
const MPH = 0.48889;         // 1 mph in yd/s

// Full bag, longest to shortest. carry = full-power carry in yards, launch in degrees,
// spin = lift/backspin factor (drives ball flight height and how fast it checks up).
const CLUBS = [
  { id: 'DR', name: 'Driver',   cat: 'woods',  type: 'driver', carry: 255, launch: 11,   spin: 0.50, reach: 0.86 },
  { id: '3W', name: '3 Wood',   cat: 'woods',  type: 'wood',   carry: 231, launch: 12,   spin: 0.60, reach: 0.80 },
  { id: '5W', name: '5 Wood',   cat: 'woods',  type: 'wood',   carry: 214, launch: 13.5, spin: 0.68, reach: 0.76 },
  { id: '4H', name: '4 Hybrid', cat: 'woods',  type: 'hybrid', carry: 199, launch: 14.5, spin: 0.72, reach: 0.72 },
  { id: '4i', name: '4 Iron',   cat: 'irons',  type: 'iron',   carry: 189, launch: 14,   spin: 0.74, reach: 0.70 },
  { id: '5i', name: '5 Iron',   cat: 'irons',  type: 'iron',   carry: 179, launch: 15.5, spin: 0.79, reach: 0.67 },
  { id: '6i', name: '6 Iron',   cat: 'irons',  type: 'iron',   carry: 168, launch: 17,   spin: 0.84, reach: 0.64 },
  { id: '7i', name: '7 Iron',   cat: 'irons',  type: 'iron',   carry: 157, launch: 19,   spin: 0.90, reach: 0.61 },
  { id: '8i', name: '8 Iron',   cat: 'irons',  type: 'iron',   carry: 146, launch: 21.5, spin: 0.96, reach: 0.58 },
  { id: '9i', name: '9 Iron',   cat: 'irons',  type: 'iron',   carry: 134, launch: 24,   spin: 1.02, reach: 0.55 },
  { id: 'PW', name: 'Pitching Wedge', cat: 'wedges', type: 'wedge', carry: 121, launch: 27, spin: 1.08, reach: 0.53 },
  { id: 'GW', name: 'Gap Wedge',      cat: 'wedges', type: 'wedge', carry: 106, launch: 30, spin: 1.14, reach: 0.52 },
  { id: 'SW', name: 'Sand Wedge',     cat: 'wedges', type: 'wedge', carry: 90,  launch: 34, spin: 1.20, reach: 0.51 },
  { id: 'LW', name: 'Lob Wedge',      cat: 'wedges', type: 'wedge', carry: 72,  launch: 40, spin: 1.26, reach: 0.50 },
  { id: 'PT', name: 'Putter',   cat: 'putter', type: 'putter', carry: 0,  launch: 0,    spin: 0,    reach: 0.34, putter: true },
];
const PUTTER_IDX = CLUBS.length - 1;

// Fictional equipment makers. dist = carry multiplier, sweet = sweet-spot width,
// forgive = how much a mis-hit's curve is dampened, spin = backspin/check multiplier.
const BRANDS = [
  { id: 'kestrel',   name: 'Kestrel',       tag: 'Distance',  dist: 1.06, sweet: 0.80, forgive: 0.20, spin: 0.90,
    head: '#1c1f24', accent: '#ff6a2b', shaft: '#2b2d31', blurb: 'Hot faces, low spin. Long when you find it.' },
  { id: 'tidewater', name: 'Tidewater',     tag: 'Balanced',  dist: 1.00, sweet: 1.00, forgive: 0.35, spin: 1.00,
    head: '#b8c0ca', accent: '#1f4aa8', shaft: '#39414d', blurb: 'The tour-van staple. Nothing to fight.' },
  { id: 'ironclad',  name: 'Ironclad',      tag: 'Control',   dist: 0.97, sweet: 1.30, forgive: 0.45, spin: 1.10,
    head: '#dfe2e6', accent: '#c8102e', shaft: '#8d949c', blurb: 'Forged blades that hold a line in the wind.' },
  { id: 'solstice',  name: 'Solstice Tour', tag: 'Spin',      dist: 1.02, sweet: 0.90, forgive: 0.25, spin: 1.35,
    head: '#e3be62', accent: '#fdfaf0', shaft: '#2d2a22', blurb: 'Grooves that grab. Wedges that zip back.' },
  { id: 'maple',     name: 'Maple & Sons',  tag: 'Forgiving', dist: 0.94, sweet: 1.55, forgive: 0.65, spin: 0.95,
    head: '#8a5a2b', accent: '#ecd6a6', shaft: '#5b3d20', blurb: 'Persimmon heritage. Mis-hits still find grass.' },
];
const BAG_SLOTS = [
  { id: 'woods',  label: 'Woods & Hybrid', clubs: 'DR · 3W · 5W · 4H' },
  { id: 'irons',  label: 'Irons',          clubs: '4i – 9i' },
  { id: 'wedges', label: 'Wedges',         clubs: 'PW · GW · SW · LW' },
  { id: 'putter', label: 'Putter',         clubs: 'PT' },
];

const OUTFIT_OPTIONS = {
  shirt:    ['#f4f4ef', '#1d3557', '#c8102e', '#2a9d8f', '#f4a261', '#ffd166', '#7b2cbf', '#ff7eb6', '#161616', '#79c3ff', '#3a7d44'],
  pants:    ['#e7e1d2', '#1e2a3a', '#4a5058', '#8c7a5b', '#fbfbf8', '#2d5a3d', '#a8323a', '#141414', '#6f8fb3'],
  hatColor: ['#fbfbf8', '#141414', '#1d3557', '#c8102e', '#2a9d8f', '#ffd166', '#f4a261', '#7b2cbf', '#3a7d44'],
  shoes:    ['#fbfbf8', '#141414', '#6b4a2e', '#1d3557', '#c8102e', '#9aa3ad'],
  skin:     ['#f6d3b8', '#e8b48f', '#c98c5f', '#8d5a3b', '#5a3825'],
  hair:     ['#2b1b10', '#6b4423', '#caa45c', '#a33b20', '#161616', '#d8d8d8'],
  hat:      [['cap', 'Cap'], ['visor', 'Visor'], ['bucket', 'Bucket'], ['beanie', 'Beanie'], ['none', 'None']],
  bottoms:  [['pants', 'Trousers'], ['shorts', 'Shorts']],
  ball:     ['#ffffff', '#fff04a', '#ff8a1f', '#ff5fa2', '#39e36b', '#ff3b3b', '#3aa0ff', '#b36bff', '#1a1a1a'],
};
const DEFAULT_OUTFIT = {
  shirt: '#1d3557', pants: '#e7e1d2', hat: 'cap', hatColor: '#fbfbf8',
  shoes: '#fbfbf8', skin: '#e8b48f', hair: '#2b1b10', bottoms: 'pants', ball: '#ffffff',
};

// Surface palettes and generator knobs per course style.
const THEMES = {
  parkland: {
    fair: '#63a93c', fair2: '#579c33', cut: '#4f8a2e', rough: '#3f7a2a', rough2: '#356b23',
    green: '#72c24d', green2: '#6ab946', fringe: '#5aa53a', sand: '#eadcae', sand2: '#d8c592',
    water: '#23628f', water2: '#3a86b6', outer: '#34652a', waste: null, flag: '#ffd21f',
    trees: ['oak', 'pine', 'oak'], treeDensity: 1.0, waterChance: 0.45, fwW: 19, hillAmp: 2.4, sideAmp: 3.2,
    fwBunkers: 2, sideBunkers: 3, pots: 0, rings: [0, 0, 1.5, 6, 16, 40, 70], ocean: false, backdrop: 'forest',
  },
  links: {
    fair: '#93b155', fair2: '#86a54b', cut: '#8e9b4f', rough: '#a2a05a', rough2: '#948f4c',
    green: '#86bd50', green2: '#7db448', fringe: '#8aad4f', sand: '#e6d3a0', sand2: '#cdb57c',
    water: '#2b6c86', water2: '#3f8aa3', outer: '#b7a66b', waste: '#c2ab72', flag: '#d7263d',
    trees: ['shrub'], treeDensity: 0.35, waterChance: 0.18, fwW: 23, hillAmp: 3.6, sideAmp: 5,
    fwBunkers: 2, sideBunkers: 2, pots: 4, rings: [0, 0, 3, 8, 6, -7, -7], ocean: true, backdrop: 'dunes',
  },
  tropical: {
    fair: '#52c24a', fair2: '#47b440', cut: '#43a53c', rough: '#379437', rough2: '#2f852f',
    green: '#62d05a', green2: '#58c551', fringe: '#4db847', sand: '#f7efd8', sand2: '#eadfbf',
    water: '#1a9bb0', water2: '#3fc5cf', outer: '#e9dfbf', waste: null, flag: '#ff5a36',
    trees: ['palm', 'palm', 'oak'], treeDensity: 0.7, waterChance: 0.85, fwW: 20, hillAmp: 1.5, sideAmp: 2,
    fwBunkers: 1, sideBunkers: 3, pots: 0, rings: [0, 0, 0.5, 0.2, -7, -7, -7], ocean: true, backdrop: 'ocean',
  },
  georgia: {
    fair: '#4a9e3d', fair2: '#56ac46', cut: '#45923a', rough: '#428c37', rough2: '#3b8132',
    green: '#6cc052', green2: '#63b54a', fringe: '#54a33e', sand: '#fdfcf8', sand2: '#ebe9e1',
    water: '#1d5a66', water2: '#2d7e88', outer: '#4c6a2c', waste: '#8f5c2e', flag: '#ffd21f',
    trees: ['tallpine'], treeDensity: 1.25, waterChance: 0.2, fwW: 25, hillAmp: 4.2, sideAmp: 3.4,
    fwBunkers: 1, sideBunkers: 2, pots: 0, rings: [0, 0, 4, 14, 30, 50, 60], ocean: false, backdrop: 'forest',
    azaleas: true, gslope: 1.15, mow: 'wide', gmow: 'stripes',
  },
  alpine: {
    fair: '#4f9c46', fair2: '#468f3e', cut: '#3f8039', rough: '#3a6f36', rough2: '#33632f',
    green: '#5fb452', green2: '#57a94b', fringe: '#4b953f', sand: '#e1d9c4', sand2: '#cbc0a3',
    water: '#2f7597', water2: '#4d94b5', outer: '#eef2f5', waste: '#e9eef2', flag: '#1f6fe0',
    trees: ['pine'], treeDensity: 1.2, waterChance: 0.35, fwW: 18, hillAmp: 3.2, sideAmp: 5,
    fwBunkers: 1, sideBunkers: 2, pots: 0, rings: [0, 0, 6, 30, 110, 320, 520], ocean: false, backdrop: 'mountains',
  },
};

const COURSES = [
  { id: 'azaleapines', name: 'Azalea Pines National', theme: 'georgia', seed: 1934, pars: [4, 5, 4, 3, 4, 5, 4, 3, 4],
    plan: ['forest', 'azalea', 'forest', 'frontpond', 'lonetree', 'creek', 'azalea', 'lake', 'forest'],
    holeNames: ['Wisteria', 'Sweetgum', 'Gardenia', 'Honeysuckle', 'Laurel', 'Crepe Myrtle', 'Foxglove', 'Hydrangea', 'Bluebell'],
    blurb: 'Rolling Georgia parkland. Towering pines, azaleas in bloom, brilliant white bunkers, slick sloping greens and water on the closing stretch.',
    windMul: 0.9, air: 1.0 },
  { id: 'pinecrest', name: 'Pinecrest National', theme: 'parkland', seed: 1307, pars: [4, 4, 3, 5, 4, 3, 4, 5, 4],
    blurb: 'Tree-lined parkland. Ponds guard the approaches and doglegs punish the greedy line.', windMul: 1.0, air: 1.0 },
  { id: 'sandpiper', name: 'Sandpiper Dunes', theme: 'links', seed: 5521, pars: [4, 5, 3, 4, 4, 4, 3, 5, 4],
    blurb: 'Seaside links. Pot bunkers, fescue and a wind that never quite drops.', windMul: 1.7, air: 1.0 },
  { id: 'coralcove', name: 'Coral Cove', theme: 'tropical', seed: 8803, pars: [4, 3, 4, 5, 3, 4, 4, 5, 4],
    blurb: 'Island resort golf. Water on nearly every hole and palms on the edges.', windMul: 1.2, air: 1.0 },
  { id: 'frostline', name: 'Frostline Alpine', theme: 'alpine', seed: 4242, pars: [5, 4, 3, 4, 4, 3, 5, 4, 4],
    blurb: 'Mountain golf at 7,000 ft. Thin air adds carry, snow swallows strays.', windMul: 0.8, air: 0.86 },
];

const TIMES = {
  dawn:   { label: 'Dawn',    skyTop: '#51719f', skyBot: '#f5c29a', fog: '#e7c7ad', sun: '#ffd3a6', sunI: 0.95,
            hemiSky: '#c2cbe0', hemiGround: '#5a5236', hemiI: 0.62, sunEl: 9,  sunAz: -65, stars: 0, lamps: false, disc: '#fff1d6' },
  day:    { label: 'Midday',  skyTop: '#2f7fd6', skyBot: '#cfe7ff', fog: '#cfe2f3', sun: '#fffaf0', sunI: 1.05,
            hemiSky: '#dcecff', hemiGround: '#4b5a32', hemiI: 0.72, sunEl: 58, sunAz: 35,  stars: 0, lamps: false, disc: '#fffef5' },
  sunset: { label: 'Sunset',  skyTop: '#26336a', skyBot: '#ff8045', fog: '#d98463', sun: '#ffa060', sunI: 1.0,
            hemiSky: '#8d7fa8', hemiGround: '#4a3222', hemiI: 0.55, sunEl: 5,  sunAz: 150, stars: 0.2, lamps: false, disc: '#ffcf8a' },
  night:  { label: 'Night',   skyTop: '#02060f', skyBot: '#10233f', fog: '#0c1a30', sun: '#a9c0ff', sunI: 0.38,
            hemiSky: '#3a4f78', hemiGround: '#0b1210', hemiI: 0.38, sunEl: 40, sunAz: -30, stars: 1, lamps: true, disc: '#e8eeff' },
};

const LIES = {
  tee:     { label: 'Tee',     dist: 1.00, check: 1.00 },
  fairway: { label: 'Fairway', dist: 1.00, check: 1.00 },
  fringe:  { label: 'Fringe',  dist: 0.98, check: 0.90 },
  green:   { label: 'Green',   dist: 0.98, check: 0.90 },
  rough:   { label: 'Rough',   dist: 0.87, check: 0.35 },
  waste:   { label: 'Waste',   dist: 0.80, check: 0.20 },
  bunker:  { label: 'Bunker',  dist: 0.72, check: 0.50 },
};
const WASTE_LABEL = { links: 'Fescue', alpine: 'Snow', georgia: 'Pine straw' };

const SCORE_NAMES = { '-4': 'Condor', '-3': 'Albatross', '-2': 'Eagle', '-1': 'Birdie', '0': 'Par',
  '1': 'Bogey', '2': 'Double Bogey', '3': 'Triple Bogey' };
