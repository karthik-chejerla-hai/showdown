import { createClient } from '@libsql/client';
import { TournamentState, Match, KnockoutMatch } from './types';

// Initialize Turso client
const db = createClient({
    url: process.env.TURSO_DATABASE_URL || 'file:tournament.db',
    authToken: process.env.TURSO_AUTH_TOKEN,
});

// Initialize database schema
export async function initDatabase(): Promise<void> {
    await db.execute(`
        CREATE TABLE IF NOT EXISTS tournament (
            id INTEGER PRIMARY KEY DEFAULT 1,
            state TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
}

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
export async function getTournament(): Promise<TournamentState> {
    const result = await db.execute('SELECT state FROM tournament WHERE id = 1');
    if (result.rows.length > 0) {
        return JSON.parse(result.rows[0].state as string) as TournamentState;
    }
    return defaultState;
}

// Save tournament state
export async function saveTournament(state: TournamentState): Promise<TournamentState> {
    const stateJson = JSON.stringify(state);
    const existing = await db.execute('SELECT id FROM tournament WHERE id = 1');

    if (existing.rows.length > 0) {
        await db.execute({
            sql: 'UPDATE tournament SET state = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1',
            args: [stateJson]
        });
    } else {
        await db.execute({
            sql: 'INSERT INTO tournament (id, state) VALUES (1, ?)',
            args: [stateJson]
        });
    }

    return getTournament();
}

// Reset tournament to default state
export async function resetTournament(): Promise<TournamentState> {
    await db.execute('DELETE FROM tournament WHERE id = 1');
    return defaultState;
}

// Update a specific group match
export async function updateMatch(matchId: string, matchData: Partial<Match>): Promise<TournamentState> {
    const state = await getTournament();
    const matchIndex = state.matches.findIndex(m => m.id === matchId);

    if (matchIndex === -1) {
        throw new Error(`Match ${matchId} not found`);
    }

    state.matches[matchIndex] = { ...state.matches[matchIndex], ...matchData };
    return saveTournament(state);
}

// Update a knockout match
export async function updateKnockoutMatch(matchKey: keyof TournamentState['knockoutMatches'], matchData: Partial<KnockoutMatch>): Promise<TournamentState> {
    const state = await getTournament();

    if (!state.knockoutMatches[matchKey]) {
        throw new Error(`Knockout match ${matchKey} not found`);
    }

    state.knockoutMatches[matchKey] = { ...state.knockoutMatches[matchKey]!, ...matchData };
    return saveTournament(state);
}
