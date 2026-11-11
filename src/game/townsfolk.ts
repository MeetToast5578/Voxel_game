import { hash2 } from '../core/random';

/** What a townsperson may say: their everyday lines, then lines for the night, rain, a red night and slime rain. */
const LINES: Readonly<Record<string, readonly string[]>> = {
  farmer: ['The wheat likes a bit of rain, and so do I.', 'Bone meal makes anything grow. Ask a skeleton.', 'Sheep give wool if you are gentle.',
    'Farmland by water grows twice as fast.', 'Cows follow anyone holding wheat. Cows are simple.', 'I sell seeds. Well, wheat. Same thing.',
    'Carrots and potatoes come from the ruins, sometimes.', 'A full belly heals you quicker. Cook your meat!'],
  smith: ['Iron, gold, diamond, then jade. Never skip a step.', 'A hammer hits hard but slow. Like me.', 'Bring me ingots and I will make it worth it.',
    'Ember crystals make steel sing. Find a forge.', 'Full iron armour stops more than the pieces alone.', 'A spear keeps trouble at arm\'s length.',
    'Grind your tools down and they snap. Keep spares.', 'Jade lies deeper than anything. Bring light.'],
  herbalist: ['Gel, poppies and a bottle make a fine regeneration potion.', 'Red mushrooms heal. Brown ones cure poison.', 'The moths come out at night. Mind them.',
    'A gill pendant lets you breathe like a fish.', 'Flowers grow where the light is good.', 'An alchemy table: two bottles over three planks.',
    'Spiders bite with poison. Carry an antidote.', 'Feathers? I will buy them.'],
  guide: ['Punch a tree for wood, then make a workbench.', 'Torches keep monsters off. Coal over a stick.', 'A bed sets where you wake. Sleep through the night!',
    'Build a room with a door, a light and a table, and someone will move in.', 'Dig down for ore, but never straight down.', 'Pyramids hide in deserts, temples in deep forests.',
    'Sky islands float high above. A grappling hook helps.', 'The journal pays you for every milestone. Check it!'],
  merchant: ['Everything has a price. Mostly coins.', 'Gold sells well. Diamonds sell better.', 'A grappling hook! The best purchase you will ever make.',
    'I have travelled far. The roads are not safe at night.', 'Arrows by the bundle, cheap today.', 'Twenty coins buys a lot of friendship.',
    'Never carry all your coins. Half fall out when you do.', 'Bosses pay well, in treasure bags.'],
  nurse: ['You look pale. Drink something.', 'A life crystal makes your heart stronger. Find them deep down.', 'Healing potions work at once, but not twice in a row.',
    'Eat a cooked meal and you heal faster.', 'Antidotes cure poison and bleeding.', 'Armour stops harm. Wear it!',
    'Cold and heat hurt too. Dress for the weather.', 'I will patch you up, for a price.'],
  alchemist: ['Every potion starts with a bottle.', 'Ember crystal and coal: fire resistance. Lava is no longer your enemy.', 'Fish and reeds: breathe under water.',
    'Dandelions and feathers make you quick.', 'Potion sickness is a lesson in patience.', 'I buy nothing. I sell everything.',
    'The best ingredients grow far from town.', 'A mimic? Never open a chest you do not trust.'],
  tinkerer: ['Two charms are better than one. Bring me a pair.', 'A cloud charm and a featherfall charm make a fine storm charm.',
    'Bosses carry the best trinkets. Beat one and bring me the pieces.', 'Gears, springs and a little gel. That is all a gadget is.',
    'Dash boots and an anklet? Now we are talking.', 'I can not make what you do not bring me.',
    'An iron band and a heart locket: the Guardian Band. Very popular.', 'Ember ring, gill pendant. Fire and water in one amulet.'],
  explorer: ['I have maps to places you have never been.', 'Pyramids in the desert, temples in the jungle, islands in the sky.',
    'The compass points to the last place you marked.', 'Under the ground there are caves that glow. I have seen them.',
    'Crystal shards fetch a good price. I buy them.', 'Every map leads somewhere new.',
    'The Ember Depths? Far below. Hot. Do not go without a pickaxe of jade.', 'I once slept on a sky island. Windy.'],
  trader: ['Coins for goods, goods for coins.', 'I go where the roads go.', 'Have you seen the sky islands?', 'Lovely weather for a trade.',
    'I hear the deep places hold jade.', 'Mind the slimes. They stick.', 'Always happy to see a customer.', 'Safe travels, friend.'],
};
const NIGHT = ['It is late. Monsters walk in the dark.', 'I should be in bed. So should you.'];
const RAIN = ['Wet day. The fires stay out, at least.', 'Rain! Good for crops, bad for travel.'];
const RED = ['The moon is red. Stay inside if you can!', 'A red moon... the monsters come in hordes tonight.'];
const SLIMES = ['It is raining slimes! Again!', 'Beat enough slimes and their king will come.'];

export interface TalkContext { night: boolean; raining: boolean; event: string | null; seed: number; time: number }

/** A line for `job` to say now: the situation first (an event, the weather, the night), otherwise an everyday one. */
export function talkLine(job: string, c: TalkContext): string {
  const pick = (list: readonly string[]) => list[Math.floor(hash2(c.seed, Math.floor(c.time / 20), job.length) * list.length)]!;
  if (c.event === 'red_night') return pick(RED);
  if (c.event === 'slime_rain') return pick(SLIMES);
  if (hash2(c.seed + 1, Math.floor(c.time / 20), 0) < 0.3) {
    if (c.raining) return pick(RAIN);
    if (c.night) return pick(NIGHT);
  }
  return pick(LINES[job] ?? LINES.trader!);
}
export const TALKERS = Object.keys(LINES);
export const linesOf = (job: string): readonly string[] => LINES[job] ?? [];

/** A task a townsperson asks for: bring items, or defeat creatures; and what it pays. */
export interface Quest { id: string; job: string; text: string; kind: 'bring' | 'defeat'; key: string; count: number; reward: readonly (readonly [string, number])[] }

/** Each townsperson's tasks, in order: one at a time, the next once the last is done. */
export const QUESTS: readonly Quest[] = [
  { id: 'farmer_wheat', job: 'farmer', text: 'Bring me 16 wheat for the winter store.', kind: 'bring', key: 'wheat', count: 16, reward: [['trade_coin', 4], ['cooked_meat', 3]] },
  { id: 'farmer_zombies', job: 'farmer', text: 'Zombies trample my field. Defeat 5 of them.', kind: 'defeat', key: 'zombie', count: 5, reward: [['trade_coin', 6], ['bone_meal', 8]] },
  { id: 'smith_iron', job: 'smith', text: 'My forge is hungry. Bring 8 iron ingots.', kind: 'bring', key: 'iron_ingot', count: 8, reward: [['trade_coin', 10], ['iron_spear', 1]] },
  { id: 'smith_skeletons', job: 'smith', text: 'Skeletons shoot at my door. Defeat 4.', kind: 'defeat', key: 'skeleton', count: 4, reward: [['iron_arrow', 16], ['trade_coin', 5]] },
  { id: 'herbalist_gel', job: 'herbalist', text: 'Bring me 10 gel for my salves.', kind: 'bring', key: 'gel', count: 10, reward: [['trade_coin', 5], ['healing_potion', 1]] },
  { id: 'herbalist_moths', job: 'herbalist', text: 'The gloom moths eat my flowers. Defeat 3.', kind: 'defeat', key: 'gloom_moth', count: 3, reward: [['feather_charm', 1]] },
  { id: 'guide_logs', job: 'guide', text: 'Bring 20 logs. Every town needs wood.', kind: 'bring', key: 'log', count: 20, reward: [['torch', 16], ['trade_coin', 4]] },
  { id: 'guide_slimes', job: 'guide', text: 'Defeat 10 green slimes to learn to fight.', kind: 'defeat', key: 'slime', count: 10, reward: [['dash_boots', 1]] },
  { id: 'merchant_gold', job: 'merchant', text: 'I deal in gold. Bring 4 ingots.', kind: 'bring', key: 'gold_ingot', count: 4, reward: [['trade_coin', 24]] },
  { id: 'nurse_mushrooms', job: 'nurse', text: 'Bring 5 red mushrooms for my potions.', kind: 'bring', key: 'red_mushroom', count: 5, reward: [['healing_potion', 2], ['antidote', 1]] },
  { id: 'alchemist_poppies', job: 'alchemist', text: 'Bring 6 poppies, freshly picked.', kind: 'bring', key: 'poppy', count: 6, reward: [['swiftness_potion', 1], ['regeneration_potion', 1]] },
  { id: 'alchemist_mimic', job: 'alchemist', text: 'Defeat a mimic. I need to know what is inside.', kind: 'defeat', key: 'mimic', count: 1, reward: [['life_crystal', 1], ['trade_coin', 10]] },
];
