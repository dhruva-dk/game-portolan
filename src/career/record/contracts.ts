import type { CareerState } from '../state.ts';

export const countDownContracts = (state: CareerState): CareerState => ({
  ...state,
  people: state.people.map((person) =>
    person.contract === null
      ? person
      : {
          ...person,
          contract: {
            ...person.contract,
            racesLeft: person.contract.racesLeft - 1,
          },
        }
  ),
});
