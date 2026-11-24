import { hash } from './random.ts';

export const named = (text: string) => text.trim().toLowerCase();

export function seedOf(text: string): number {
  const t = named(text);
  if (/^\d{1,10}$/.test(t) && Number(t) <= 0xffffffff) return Number(t);
  let h = 0x811c9dc5;
  for (const ch of t) h = hash(h, ch.codePointAt(0) ?? 0);
  return h;
}

const WORDS = (
  'salt gull tar brig reef cove tide surf kelp wave mast sail keel hull helm ' +
  'deck rope knot buoy dock pier port bay isle sand dune palm crab clam cod ' +
  'eel ray orca seal tern skua auk puff swan loon gale squall fog mist rain ' +
  'hail gust calm storm sun moon star north south east west rum grog gold ' +
  'coin map chart compass rose bell flag oar skiff sloop yawl junk dhow raft ' +
  'barge scow ketch cutter frigate hook net line reel lure bait shoal sound ' +
  'strait firth fjord atoll lagoon shell pearl coral sponge squid krill whale ' +
  'shark pike perch bass carp sole dab hake ling smelt sprat wrasse anchor ' +
  'chain cable boom gaff jib yard spar stay shroud bow stern aft fore quay ' +
  'lee gunwale bilge hold hatch cabin galley brine spray foam swell crest ' +
  'trough eddy drift ebb flood neap spring cape head point spit bar rock ' +
  'cliff cave arch stack light beacon flare lamp fire smoke cannon shot ' +
  'grape powder flint pistol cutlass musket crow parrot dog cat rat goat pig ' +
  'hen duck goose otter mink jade amber ivory ebony teak oak pine elm ash yew ' +
  'red blue green grey black white brass iron tin copper'
).split(' ');

export function rolled(u: () => number): string {
  const word = () => WORDS[Math.floor(u() * WORDS.length) % WORDS.length];
  return word() + word();
}
