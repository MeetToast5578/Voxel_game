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
      ['Right, with a crop', 'Survival: eat it, or plant it on grass or dirt'],
      ['Right, on a bed', 'Set the respawn point; sleep through the night'],
      ['Right, on a crafting table', 'Craft on a 3×3 grid (the inventory has 2×2)'],
      ['Right, on a furnace', 'Smelt: input on top, fuel below'],
      ['Right, on a door', 'Open or close it'],
      ['Left, on a creature', 'Hit it; hold wheat and grazers follow'],
      ['Middle click', 'Pick block'],
      ['1-9, wheel', 'Select block'],
      ['E', 'Inventory (also from the pause menu)'],
      ['E, Blocks tab', 'Pick any block in the game (creative)'],
    ],
  },
  {
    title: 'Gamepad and touch',
    rows: [
      ['Left stick', 'Move (press: sprint)'],
      ['Right stick', 'Look'],
      ['A / B', 'Jump, fly up / crouch, fly down'],
      ['RT / LT', 'Break / place'],
      ['LB / RB', 'Select block'],
      ['X / Y', 'Toggle flying / inventory'],
      ['Start', 'Pause or resume'],
      ['Touch', 'Stick to move, drag the right half to look, buttons to act'],
    ],
  },
  {
    title: 'Volume tools',
    rows: [
      ['R', 'Mode: single, add, remove'],
      ['Q', 'Shape: box, sphere, plane, wall, floor, roof, flatten'],
      ['[ ]', 'Size'],
      [', .', 'Thickness or width'],
      ['G', 'Box and sphere: solid or shell'],
      ['C', 'Plane and flatten: square or disc'],
      ['X or Esc', 'Cancel a wall, floor or roof in progress'],
      ['Ctrl/Cmd+C, twice', 'Copy opposite corners of a region (creative)'],
      ['Ctrl/Cmd+V', 'Paste next to aimed face; keep existing blocks'],
      ['Ctrl/Cmd+Z', 'Undo the last volume action'],
      ['Ctrl/Cmd+Y or Shift+Z', 'Redo the last undone volume action'],
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
