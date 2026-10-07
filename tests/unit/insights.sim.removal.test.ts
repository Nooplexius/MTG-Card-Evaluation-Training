import { describe, expect, it } from 'vitest';
import { checkScenario, USERS } from '../helpers/insightSim.ts';

describe(`smart feedback, ${USERS} simulated users × 400 evaluations through the real scheduler`, () => {
  it('underrates removal and grades high: both found in ≥ 90% of runs, any other insight in ≤ 5%, full memory kept', () => checkScenario('removal-optimist', expect));
});
