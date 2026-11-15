// The seam between the career and the UI: the view models each management screen draws, built by the career, and the
// Command union every screen sends back. Types only. Neither ui/ nor career/ imports the other; main.ts wires them.

/** What a screen asks of the career. Each phase adds its commands as a member of this union. */
export type Command = never;
