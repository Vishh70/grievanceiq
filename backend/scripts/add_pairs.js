const fs = require('fs');

const path = 'backend/data/real_complaint_pairs.json';
const existing = JSON.parse(fs.readFileSync(path, 'utf8'));

const newPairs = [
  {
    pair_id: "pair_011",
    complaint_A: { text: "Road is completely washed out near the bridge.", category: "Roads", location_lat: 18.5310, location_lng: 73.8500, time_offset_hours: 0 },
    complaint_B: { text: "Bridge approach road collapsed.", category: "Roads", location_lat: 18.5311, location_lng: 73.8502, time_offset_hours: 3 },
    true_label: "Duplicate", reasoning: "Same structural failure at the exact same location."
  },
  {
    pair_id: "pair_012",
    complaint_A: { text: "Heavy flooding on main street, water entering shops.", category: "Drainage", location_lat: 18.5250, location_lng: 73.8600, time_offset_hours: 0 },
    complaint_B: { text: "Traffic at a standstill due to waterlogging.", category: "Roads", location_lat: 18.5250, location_lng: 73.8600, time_offset_hours: 1 },
    true_label: "Related", reasoning: "Flooding (Drainage) directly causing Traffic/Road issues. Causal link."
  },
  {
    pair_id: "pair_013",
    complaint_A: { text: "Streetlights not working in entire sector 4.", category: "Electricity", location_lat: 18.5400, location_lng: 73.8400, time_offset_hours: 0 },
    complaint_B: { text: "No power in sector 4 homes.", category: "Electricity", location_lat: 18.5405, location_lng: 73.8405, time_offset_hours: 0.5 },
    true_label: "Related", reasoning: "Streetlight failure and home power outage share a common electrical grid failure."
  },
  {
    pair_id: "pair_014",
    complaint_A: { text: "Garbage truck hasn't visited in a week.", category: "Waste Management", location_lat: 18.5100, location_lng: 73.8200, time_offset_hours: 0 },
    complaint_B: { text: "Stray dogs tearing up trash bags on the sidewalk.", category: "Other", location_lat: 18.5101, location_lng: 73.8202, time_offset_hours: 24 },
    true_label: "Related", reasoning: "Uncollected garbage is attracting stray dogs."
  },
  {
    pair_id: "pair_015",
    complaint_A: { text: "Pothole on airport road.", category: "Roads", location_lat: 18.5800, location_lng: 73.9100, time_offset_hours: 0 },
    complaint_B: { text: "Large pothole on highway.", category: "Roads", location_lat: 18.6000, location_lng: 73.9500, time_offset_hours: 2 },
    true_label: "Similar", reasoning: "Both are potholes, but located 5+ km apart. Not duplicates, but similar issues."
  },
  {
    pair_id: "pair_016",
    complaint_A: { text: "Water tasting metallic.", category: "Water Supply", location_lat: 18.5500, location_lng: 73.8000, time_offset_hours: 0 },
    complaint_B: { text: "Brown water coming from taps.", category: "Water Supply", location_lat: 18.5505, location_lng: 73.8010, time_offset_hours: 5 },
    true_label: "Duplicate", reasoning: "Same contaminated water supply affecting the neighborhood."
  },
  {
    pair_id: "pair_017",
    complaint_A: { text: "Dead animal on the road.", category: "Waste Management", location_lat: 18.5200, location_lng: 73.8500, time_offset_hours: 0 },
    complaint_B: { text: "Terrible smell coming from the bushes.", category: "Other", location_lat: 18.5201, location_lng: 73.8501, time_offset_hours: 12 },
    true_label: "Related", reasoning: "Dead animal causing the smell."
  },
  {
    pair_id: "pair_018",
    complaint_A: { text: "Construction debris dumped on footpath.", category: "Waste Management", location_lat: 18.5300, location_lng: 73.8400, time_offset_hours: 0 },
    complaint_B: { text: "Footpath broken and unwalkable.", category: "Public Infrastructure", location_lat: 18.5301, location_lng: 73.8401, time_offset_hours: 48 },
    true_label: "Related", reasoning: "Debris dumping likely damaged the footpath or is obstructing it."
  },
  {
    pair_id: "pair_019",
    complaint_A: { text: "No water supply since morning.", category: "Water Supply", location_lat: 18.5600, location_lng: 73.8100, time_offset_hours: 0 },
    complaint_B: { text: "Low water pressure in the building.", category: "Water Supply", location_lat: 18.5600, location_lng: 73.8100, time_offset_hours: 2 },
    true_label: "Duplicate", reasoning: "Same root cause (water supply issue) at the same location."
  },
  {
    pair_id: "pair_020",
    complaint_A: { text: "Tree branches touching power lines.", category: "Electricity", location_lat: 18.5700, location_lng: 73.8200, time_offset_hours: 0 },
    complaint_B: { text: "Sparks flying from electrical pole.", category: "Electricity", location_lat: 18.5700, location_lng: 73.8201, time_offset_hours: 4 },
    true_label: "Related", reasoning: "Tree branches likely caused the short circuit/sparks."
  },
  {
    pair_id: "pair_021",
    complaint_A: { text: "Open manhole is dangerous.", category: "Drainage", location_lat: 18.5400, location_lng: 73.8300, time_offset_hours: 0 },
    complaint_B: { text: "Accident due to open gutter.", category: "Public Infrastructure", location_lat: 18.5400, location_lng: 73.8300, time_offset_hours: 6 },
    true_label: "Related", reasoning: "Open manhole (Drainage) directly caused the accident."
  },
  {
    pair_id: "pair_022",
    complaint_A: { text: "Traffic signal completely off.", category: "Electricity", location_lat: 18.5100, location_lng: 73.8600, time_offset_hours: 0 },
    complaint_B: { text: "Huge traffic jam at the intersection.", category: "Roads", location_lat: 18.5100, location_lng: 73.8600, time_offset_hours: 1 },
    true_label: "Related", reasoning: "Dead signal causing traffic jam."
  },
  {
    pair_id: "pair_023",
    complaint_A: { text: "Bus stop roof collapsed.", category: "Public Infrastructure", location_lat: 18.5500, location_lng: 73.8800, time_offset_hours: 0 },
    complaint_B: { text: "Need more buses on route 4.", category: "Other", location_lat: 18.5500, location_lng: 73.8800, time_offset_hours: 24 },
    true_label: "Independent", reasoning: "Infrastructure failure vs Service request. No causal link despite same location."
  },
  {
    pair_id: "pair_024",
    complaint_A: { text: "Illegal hoarding fell down.", category: "Public Infrastructure", location_lat: 18.5200, location_lng: 73.8700, time_offset_hours: 0 },
    complaint_B: { text: "Tree fell on the road.", category: "Public Infrastructure", location_lat: 18.5250, location_lng: 73.8750, time_offset_hours: 1 },
    true_label: "Similar", reasoning: "Both are falling hazards, likely due to same storm, but separate incidents."
  },
  {
    pair_id: "pair_025",
    complaint_A: { text: "Drain is clogged with plastic.", category: "Drainage", location_lat: 18.5600, location_lng: 73.8900, time_offset_hours: 0 },
    complaint_B: { text: "Water pooling on the street.", category: "Roads", location_lat: 18.5600, location_lng: 73.8900, time_offset_hours: 2 },
    true_label: "Related", reasoning: "Clogged drain causing water pooling."
  },
  {
    pair_id: "pair_026",
    complaint_A: { text: "Public toilet is extremely dirty.", category: "Waste Management", location_lat: 18.5300, location_lng: 73.8500, time_offset_hours: 0 },
    complaint_B: { text: "No water in public toilet.", category: "Water Supply", location_lat: 18.5300, location_lng: 73.8500, time_offset_hours: 1 },
    true_label: "Related", reasoning: "Lack of water causes the dirty condition."
  },
  {
    pair_id: "pair_027",
    complaint_A: { text: "Stray cow on the highway.", category: "Other", location_lat: 18.5800, location_lng: 73.8200, time_offset_hours: 0 },
    complaint_B: { text: "Car hit a cow.", category: "Roads", location_lat: 18.5802, location_lng: 73.8205, time_offset_hours: 1 },
    true_label: "Related", reasoning: "Animal hazard led to traffic accident."
  },
  {
    pair_id: "pair_028",
    complaint_A: { text: "Loud speaker noise past midnight.", category: "Other", location_lat: 18.5400, location_lng: 73.8600, time_offset_hours: 0 },
    complaint_B: { text: "Water pipe leaking.", category: "Water Supply", location_lat: 18.5400, location_lng: 73.8600, time_offset_hours: 1 },
    true_label: "Independent", reasoning: "Noise complaint and water leak are unrelated despite being at the same address."
  },
  {
    pair_id: "pair_029",
    complaint_A: { text: "Pavement dug up by telecom company.", category: "Public Infrastructure", location_lat: 18.5100, location_lng: 73.8300, time_offset_hours: 0 },
    complaint_B: { text: "Debris left by digging crew.", category: "Waste Management", location_lat: 18.5100, location_lng: 73.8300, time_offset_hours: 24 },
    true_label: "Related", reasoning: "Digging created the debris."
  },
  {
    pair_id: "pair_030",
    complaint_A: { text: "Transformer caught fire.", category: "Electricity", location_lat: 18.5500, location_lng: 73.8400, time_offset_hours: 0 },
    complaint_B: { text: "Transformer is burning.", category: "Electricity", location_lat: 18.5500, location_lng: 73.8400, time_offset_hours: 0.5 },
    true_label: "Duplicate", reasoning: "Exact same emergency reported by two people."
  }
];

const allPairs = [...existing, ...newPairs];
fs.writeFileSync(path, JSON.stringify(allPairs, null, 2));
console.log('Added 20 pairs. Total is now: ', allPairs.length);
