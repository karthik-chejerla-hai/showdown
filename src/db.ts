import { TournamentState, Match, KnockoutMatch } from './types';

// In-memory storage (temporary - for debugging deployment issues)
let tournamentState: TournamentState | null = null;

// Default tournament state (matches the frontend structure)
export const defaultState: TournamentState = {
    teams: {
        A: [
            { id: 'A1', name: 'Team 1', players: ['', '', ''] },
            { id: 'A2', name: 'Team 2', players: ['', '', ''] },
            { id: 'A3', name: 'Team 3', players: ['', '', ''] }
        ],
        B: [
            { id: 'B1', name: 'Team 4', players: ['', '', ''] },
            { id: 'B2', name: 'Team 5', players: ['', '', ''] },
            { id: 'B3', name: 'Team 6', players: ['', '', ''] }
        ]
    },
    matches: [],
    knockoutMatches: {
        semi1: null,
        semi2: null,
        final: null
    },
    scheduleGenerated: false
};

// Get tournament state
export function getTournament(): TournamentState {
    return tournamentState || defaultState;
}

// Save tournament state
export function saveTournament(state: TournamentState): TournamentState {
    tournamentState = JSON.parse(JSON.stringify(state));
    return getTournament();
}

// Reset tournament to default state
export function resetTournament(): TournamentState {
    tournamentState = null;
    return defaultState;
}

// Update a specific group match
export function updateMatch(matchId: string, matchData: Partial<Match>): TournamentState {
    const state = getTournament();
    const matchIndex = state.matches.findIndex(m => m.id === matchId);

    if (matchIndex === -1) {
        throw new Error(`Match ${matchId} not found`);
    }

    state.matches[matchIndex] = { ...state.matches[matchIndex], ...matchData };
    return saveTournament(state);
}

// Update a knockout match
export function updateKnockoutMatch(matchKey: keyof TournamentState['knockoutMatches'], matchData: Partial<KnockoutMatch>): TournamentState {
    const state = getTournament();

    if (!state.knockoutMatches[matchKey]) {
        throw new Error(`Knockout match ${matchKey} not found`);
    }

    state.knockoutMatches[matchKey] = { ...state.knockoutMatches[matchKey]!, ...matchData };
    return saveTournament(state);
}
