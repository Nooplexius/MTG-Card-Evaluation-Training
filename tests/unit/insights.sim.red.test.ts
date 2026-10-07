import { describe, expect, it } from 'vitest';
import { checkScenario, USERS } from '../helpers/insightSim.ts';

describe(`smart feedback, ${USERS} simulated users × 400 evaluations through the real scheduler`, () => {
  it('overrates red and compresses toward C: both found in ≥ 90% of runs, any other insight in ≤ 5%, full memory kept', () => checkScenario('red-compressed', expect));
});
