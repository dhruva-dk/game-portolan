import {
  perRole,
  type CareerState,
  type NewsEvent,
  type Person,
  type Ship,
  type Team,
} from './state.ts';

export const updateTeam = (
  state: CareerState,
  index: number,
  change: (team: Team) => Team
): CareerState => ({
  ...state,
  teams: state.teams.map((team, i) => (i === index ? change(team) : team)),
});

export const updateShip = (
  ships: Team['ships'],
  slot: number,
  change: (ship: Ship) => Ship
): Team['ships'] => [
  slot === 0 ? change(ships[0]) : ships[0],
  slot === 1 ? change(ships[1]) : ships[1],
];

export const vacate = (
  teams: readonly Team[],
  gone: ReadonlySet<number>
): Team[] =>
  teams.map((team) => ({
    ...team,
    seats: perRole((role) => {
      const id = team.seats[role];
      return id !== null && gone.has(id) ? null : id;
    }),
  }));

export const announce = (
  state: CareerState,
  ...events: readonly NewsEvent[]
): CareerState =>
  events.length === 0
    ? state
    : { ...state, pendingEvents: [...state.pendingEvents, ...events] };

export const named = (
  person: Pick<Person, 'id' | 'name'>
): Pick<NewsEvent, 'person' | 'personId'> => ({
  person: person.name,
  personId: person.id,
});
