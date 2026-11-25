import type { Talk, Team } from '../state.ts';

export const talkWith = (team: Team, person: number): Talk =>
  team.talks.find((talk) => talk.person === person) ?? {
    person,
    attempts: 0,
    answer: null,
    counter: null,
  };

export const withTalk = (team: Team, talk: Talk): Team => ({
  ...team,
  talks: team.talks.some((t) => t.person === talk.person)
    ? team.talks.map((t) => (t.person === talk.person ? talk : t))
    : [...team.talks, talk],
});
