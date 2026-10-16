/** The controls, in the order the pause menu lists them. The README's controls table follows the same keys. */
export const CONTROL_SECTIONS: readonly { title: string; rows: readonly (readonly [string, string])[] }[] = [
  {
    title: 'Move and look',
    rows: [
      ['W A S D', 'Move'],
      ['Mouse', 'Look'],
      ['Space', 'Jump, fly up, swim up'],
      ['Shift', 'Sprint, fly down'],
      ['F', 'Toggle flying'],
    ],
  },
  {
    title: 'Blocks',
    rows: [
      ['Left, hold', 'Break block (single mode)'],
      ['Right, hold', 'Place block (single mode)'],
      ['Middle click', 'Pick block'],
      ['1-9, wheel', 'Select block'],
      ['E', 'Inventory (also from the pause menu)'],
    ],
  },
  {
    title: 'Volume tools',
    rows: [
      ['R', 'Mode: single, add, remove'],
      ['Q', 'Tool: box, sphere, plane, wall, floor, flatten'],
      ['[ ]', 'Size'],
      [', .', 'Thickness or width'],
      ['G', 'Box and sphere: solid or shell'],
      ['C', 'Plane and flatten: square or disc'],
      ['X', 'Cancel a wall or floor'],
      ['Ctrl+Z', 'Undo the last volume action'],
    ],
  },
  {
    title: 'Other',
    rows: [
      ['Esc', 'Pause'],
      ['F3', 'Debug info'],
    ],
  },
];

/** The keys shown on screen during the first minute of play. */
export const HINT_KEYS: readonly (readonly [string, string])[] = [
  ['E', 'Inventory'],
  ['R', 'Mode'],
  ['Q', 'Tool'],
  ['Esc', 'Pause'],
];
