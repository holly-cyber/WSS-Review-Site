// Full WSS review taxonomy. Levels: category > subcategory > sub-subcategory.
// Used by the mega menu (BaseLayout) and the listing pages (reviews/[...path]).
export function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export const taxonomy = [
  { slug: 'run', name: 'Run', subs: [
    { name: 'Shoes', items: ['Road Running Shoes', 'Trail Running Shoes', 'Track & Racing Shoes', 'Cross Training Shoes', 'Walking & Hiking Shoes'] },
    { name: 'Clothing', items: ['Shorts', 'Tights & Leggings', 'Tops', 'Midlayer & Fleece', 'Jackets & Gilets', 'All-in-Ones & Playsuits'] },
    { name: 'Accessories', items: ['Socks', 'Headwear', 'Gloves', 'Sunglasses', 'Buffs & Neck Gaiters'] },
    { name: 'Gear & Equipment', items: ['Running Vests & Packs', 'Running Belts & Pouches', 'Headtorches', 'GPS Watches', 'Heart Rate Monitors'] },
    { name: 'Recovery', items: ['Compression Wear', 'Foam Rollers & Massage', 'Recovery Footwear'] },
  ]},
  { slug: 'swim', name: 'Swim', subs: [
    { name: 'Open Water', items: ['Wetsuits', 'Goggles', 'Safety & Visibility', 'Swim Skins', 'Neoprene Accessories'] },
    { name: 'Pool', items: ['Swimsuits', 'Goggles', 'Swim Caps', 'Training Aids'] },
    { name: 'Accessories', items: ['Swim Bags & Kit Bags', 'Ear Plugs & Nose Clips', 'Anti-Fog Spray', 'Towels & Robes'] },
  ]},
  { slug: 'cycle', name: 'Cycle', subs: [
    { name: 'Bikes', items: ['Road', 'Gravel', 'Mountain', 'Triathlon & TT'] },
    { name: 'Clothing', items: ['Bib Shorts & Tights', 'Jerseys', 'Jackets & Gilets', 'Base Layers', 'Casual & Commuter'] },
    { name: 'Shoes & Pedals', items: ['Road', 'MTB & Gravel', 'Commuter', 'Tri', 'Cleats'] },
    { name: 'Helmets', items: ['Road', 'Aero', 'MTB', 'Commuter'] },
    { name: 'Technology', items: ['Cycling Computers & GPS', 'Power Meters', 'Smart Trainers', 'Bike Lights', 'Heart Rate Monitors'] },
    { name: 'Accessories', items: ['Gloves', 'Eyewear & Sunglasses', 'Socks', 'Cycling Caps', 'Arm & Leg Warmers', 'Saddles', 'Bottle Cages & Bidons', 'Bags & Storage'] },
  ]},
  { slug: 'tri', name: 'Tri', subs: [
    { name: 'Racing Kit', items: ['Trisuits', 'Tri Tops & Shorts', 'Race Accessories'] },
    { name: 'Swim', items: ['Tri Wetsuits', 'Open Water Goggles'] },
    { name: 'Bike', items: ['Tri Helmets', 'Tri Shoes', 'Aero Bars'] },
    { name: 'Run', items: ['Tri Running Shoes', 'Race Day Run Kit'] },
    { name: 'Nutrition & Fuelling', items: ['Race Day Plans', 'Gels & Chews', 'Hydration'] },
    { name: 'Technology', items: ['Multisport GPS', 'Power Meters', 'Timing Chips'] },
  ]},
  { slug: 'sports-bras', name: 'Sports Bras', subs: [
    { name: 'By Impact Level', items: ['High Impact', 'Medium Impact', 'Low Impact'] },
    { name: 'By Cup Size', items: ['A-B', 'C-D', 'E-F', 'G-HH'] },
    { name: 'By Style', items: ['Encapsulation', 'Compression', 'Encapsulation & Compression', 'Crop Top', 'Longline', 'Front Fastening'] },
    { name: 'By Size Range', items: ['Standard UK 6-16', 'Plus Size UK 18-28', 'Petite'] },
    { name: 'Accessories', items: ['Bra Care', 'Fitting Guides'] },
  ]},
  { slug: 'nutrition', name: 'Nutrition', subs: [
    { name: 'Race Day & Performance', items: ['Energy Gels', 'Energy Chews & Bars', 'Hydration & Electrolytes'] },
    { name: 'Training Nutrition', items: ['Pre-Workout', 'Intra-Workout', 'Recovery'] },
    { name: 'Protein', items: ['Whey', 'Plant-Based', 'Casein', 'Bars & Snacks'] },
    { name: 'Female-Specific Nutrition', items: ['Menstrual Cycle Support', 'Perimenopause & Menopause', 'Bone Health & Calcium', 'Iron & Haemoglobin', 'Hormone Support'] },
    { name: 'Daily Supplements', items: ['Vitamins & Minerals', 'Omega 3 & Fish Oils', 'Gut Health & Probiotics', 'Collagen & Joint Support'] },
    { name: 'Diet & Lifestyle', items: ['Meal Replacement', 'Weight Management', 'Healthy Snacks'] },
  ]},
  { slug: 'technology', name: 'Technology', subs: [
    { name: 'Watches & Trackers', items: ['GPS Running', 'Multisport', 'Triathlon', 'Fitness Bands'] },
    { name: 'Cycling Technology', items: ['Cycling Computers & GPS', 'Power Meters', 'Smart Trainers'] },
    { name: 'Heart Rate & Recovery', items: ['Heart Rate Monitors', 'Recovery & Sleep Trackers', 'HRV Monitors'] },
    { name: 'Navigation & Safety', items: ['GPS Devices', 'Emergency Beacons', 'Bike Radar & Cameras'] },
    { name: 'Female Health Technology', items: ['Cycle Tracking Devices', 'Menopause Tracking', 'Fertility & Health Monitors'] },
    { name: 'Apps & Software', items: ['Training Platforms', 'Nutrition Apps', 'Recovery Apps'] },
  ]},
  { slug: 'equipment', name: 'Equipment', subs: [
    { name: 'Strength & Gym', items: ['Resistance Bands', 'Weights & Dumbbells', 'Gym Mats', 'Gym Bags & Kit Bags'] },
    { name: 'Recovery & Mobility', items: ['Foam Rollers', 'Massage Guns', 'Compression Therapy', 'Stretching & Yoga Props', 'Ice & Heat Therapy'] },
    { name: 'Swimming Equipment', items: ['Ergometers', 'Resistance & Drag'] },
    { name: 'Cycling Equipment', items: ['Turbo Trainers', 'Bike Racks', 'Maintenance'] },
    { name: 'Outdoor & Adventure', items: ['Hiking Poles', 'Camping Kit', 'Navigation'] },
    { name: 'Safety & Protection', items: ['Helmets', 'Protective Pads & Guards', 'Visibility & Safety'] },
  ]},
];

// Categories that already have a hand-built index.astro (don't double-generate them).
export const STATIC_CATEGORY_INDEXES = ['run', 'swim', 'cycle', 'tri', 'sports-bras', 'nutrition'];
