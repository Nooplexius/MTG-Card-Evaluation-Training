import { describe, expect, it } from 'vitest';
import { checkScenario, USERS } from '../helpers/insightSim.ts';

describe(`smart feedback, ${USERS} simulated users × 400 evaluations through the real scheduler`, () => {
  it('no planted effect: any insight in ≤ 5% of runs, full memory kept', () => checkScenario('null', expect));
});
