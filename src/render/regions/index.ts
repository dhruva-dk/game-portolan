import type { RenderContext, RenderModule } from '../world.ts';
import { createIceCrown } from './iceCrown.ts';
import { createFjords } from './fjords.ts';
import { createBasaltStacks } from './basaltStacks.ts';
import { createKelpShallows } from './kelpShallows.ts';
import { createAmberShoals } from './amberShoals.ts';
import { createWeepingIsle } from './weepingIsle.ts';
import { createCoralAtolls } from './coralAtolls.ts';
import { createSpiceIsles } from './spiceIsles.ts';
import { createFireArchipelago } from './fireArchipelago.ts';

export const REGION_MODULES: readonly ((ctx: RenderContext) => RenderModule)[] = [createIceCrown, createFjords, createBasaltStacks, createKelpShallows, createAmberShoals, createWeepingIsle, createCoralAtolls, createSpiceIsles, createFireArchipelago];
