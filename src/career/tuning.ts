export const LEVEL_VALUES = {
  topSpeed: { line: 'sails', atZero: 20, atHundred: 45 },
  gather: { line: 'rigging', atZero: 0.9, atHundred: 2.0 },
  gustCapacity: { line: 'rigging', atZero: 3, atHundred: 8 },
  turnRate: { line: 'rudder', atZero: 0.45, atHundred: 0.8 },
  hullPoints: { line: 'hull', atZero: 80, atHundred: 200 },
  spreadFactor: { line: 'keel', atZero: 1.3, atHundred: 0.6 },
  reloadFactor: { line: 'mounts', atZero: 1.2, atHundred: 0.6 },
  damageFactor: { line: 'gun', atZero: 0.8, atHundred: 1.4 },
  assistCone: { line: 'gun', atZero: 0.06, atHundred: 0.1 },
} as const;

export const LEVEL_SPAN = { least: 0, most: 100 } as const;

export const MECHANIC_VALUES = {
  shieldRate: { stat: 'shield', none: 1.5, base: 2, perPoint: 0.2 },
  healTime: { stat: 'healSpeed', none: 2.5, base: 2.2, perPoint: -0.07 },
  healFactor: { stat: 'healAmount', none: 0.8, base: 0.9, perPoint: 0.03 },
} as const;
