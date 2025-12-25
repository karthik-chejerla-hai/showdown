// Shared types for the Badminton Showdown application

export interface Team {
  id: string;
  name: string;
  players: string[];
}

export interface Teams {
  A: Team[];
  B: Team[];
}

export interface Game {
  id: number;
  team1Players: string[];
  team2Players: string[];
  team1Score: number | null;
  team2Score: number | null;
  winner: 'team1' | 'team2' | null;
}

export interface Match {
  id: string;
  pool: 'A' | 'B';
  team1Id: string;
  team2Id: string;
  team1Name: string;
  team2Name: string;
  games: Game[];
  team1GamesWon: number;
  team2GamesWon: number;
  winner: string | null;
  completed: boolean;
}

export interface KnockoutMatch {
  id: string;
  seed1: string;
  seed2: string;
  team1: Team | null;
  team2: Team | null;
  games: Game[];
  team1GamesWon: number;
  team2GamesWon: number;
  winner: string | null;
  completed: boolean;
}

export interface KnockoutMatches {
  semi1: KnockoutMatch | null;
  semi2: KnockoutMatch | null;
  final: KnockoutMatch | null;
}

export interface TournamentState {
  teams: Teams;
  matches: Match[];
  knockoutMatches: KnockoutMatches;
  scheduleGenerated: boolean;
}

export interface User {
  id: string;
  name: string;
  email?: string;
  photo?: string;
}
