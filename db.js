const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'tournament.db');
const db = new Database(dbPath);

// Initialize database schema
db.exec(`
    CREATE TABLE IF NOT EXISTS tournament (
        id INTEGER PRIMARY KEY DEFAULT 1,
        state TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

// Default tournament state (matches the frontend structure)
const defaultState = {
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
function getTournament() {
    const row = db.prepare('SELECT state FROM tournament WHERE id = 1').get();
    if (row) {
        return JSON.parse(row.state);
    }
    return defaultState;
}

// Save tournament state
function saveTournament(state) {
    const stateJson = JSON.stringify(state);
    const existing = db.prepare('SELECT id FROM tournament WHERE id = 1').get();

    if (existing) {
        db.prepare(`
            UPDATE tournament
            SET state = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
        `).run(stateJson);
    } else {
        db.prepare(`
            INSERT INTO tournament (id, state) VALUES (1, ?)
        `).run(stateJson);
    }

    return getTournament();
}

// Reset tournament to default state
function resetTournament() {
    db.prepare('DELETE FROM tournament WHERE id = 1').run();
    return defaultState;
}

// Update a specific group match
function updateMatch(matchId, matchData) {
    const state = getTournament();
    const matchIndex = state.matches.findIndex(m => m.id === matchId);

    if (matchIndex === -1) {
        throw new Error(`Match ${matchId} not found`);
    }

    state.matches[matchIndex] = { ...state.matches[matchIndex], ...matchData };
    return saveTournament(state);
}

// Update a knockout match
function updateKnockoutMatch(matchKey, matchData) {
    const state = getTournament();

    if (!state.knockoutMatches[matchKey]) {
        throw new Error(`Knockout match ${matchKey} not found`);
    }

    state.knockoutMatches[matchKey] = { ...state.knockoutMatches[matchKey], ...matchData };
    return saveTournament(state);
}

module.exports = {
    getTournament,
    saveTournament,
    resetTournament,
    updateMatch,
    updateKnockoutMatch,
    defaultState
};
