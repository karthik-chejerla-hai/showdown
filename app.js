// ========================================
// Badminton Tournament App
// ========================================

// State Management
const state = {
    players: [], // Available players from CSV
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

// Socket.io connection
let socket = null;
let isConnected = false;

// Flag to track pending saves (prevents double render from own WebSocket echo)
let pendingSave = false;

// DOM Elements
const sections = document.querySelectorAll('.section');
const navLinks = document.querySelectorAll('.nav-link');
const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');
const scoreModal = document.getElementById('score-modal');
const modalClose = document.getElementById('modal-close');
const modalCancel = document.getElementById('modal-cancel');
const modalSave = document.getElementById('modal-save');

// Current match being edited
let currentEditMatch = null;
let currentEditType = null; // 'group' or 'knockout'

// ========================================
// Initialize App
// ========================================
async function init() {
    createToastContainer();
    addConnectionIndicator();
    setupNavigation();
    setupEventListeners();

    // Load players from server
    await loadPlayers();

    // Connect to WebSocket
    connectSocket();
}

// ========================================
// Toast Notifications
// ========================================
function createToastContainer() {
    const container = document.createElement('div');
    container.className = 'toast-container';
    container.id = 'toast-container';
    document.body.appendChild(container);
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const icons = {
        success: '✅',
        error: '❌',
        info: 'ℹ️'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type]}</span>
        <span class="toast-message">${message}</span>
    `;

    container.appendChild(toast);

    // Auto remove after 3 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ========================================
// Connection Status Indicator
// ========================================
function addConnectionIndicator() {
    const navbar = document.querySelector('.navbar');
    const indicator = document.createElement('div');
    indicator.className = 'connection-status connecting';
    indicator.id = 'connection-status';
    indicator.innerHTML = `
        <span class="connection-dot"></span>
        <span>Connecting...</span>
    `;
    navbar.insertBefore(indicator, navbar.querySelector('.mobile-menu-btn'));
}

function updateConnectionStatus(status) {
    const indicator = document.getElementById('connection-status');
    if (!indicator) return;

    indicator.className = `connection-status ${status}`;
    const text = {
        connected: 'Live',
        disconnected: 'Offline',
        connecting: 'Connecting...'
    };
    indicator.innerHTML = `
        <span class="connection-dot"></span>
        <span>${text[status]}</span>
    `;
}

// ========================================
// Socket.io Connection
// ========================================
function connectSocket() {
    socket = io();

    socket.on('connect', () => {
        isConnected = true;
        updateConnectionStatus('connected');
        console.log('Connected to server');
    });

    socket.on('disconnect', () => {
        isConnected = false;
        updateConnectionStatus('disconnected');
        console.log('Disconnected from server');
    });

    socket.on('tournament:updated', (newState) => {
        console.log('Received tournament update');
        // Update local state
        state.teams = newState.teams;
        state.matches = newState.matches;
        state.knockoutMatches = newState.knockoutMatches;
        state.scheduleGenerated = newState.scheduleGenerated;

        // Skip re-render if this update is from our own save
        if (pendingSave) {
            console.log('Skipping re-render (own update)');
            return;
        }

        // Re-render all views (only for updates from other clients)
        renderTeamForms();
        if (state.scheduleGenerated) {
            renderSchedule();
            renderStandings();
            renderKnockout();
        }
    });
}

// ========================================
// API Helpers
// ========================================
async function loadPlayers() {
    try {
        const response = await fetch('/api/players');
        state.players = await response.json();
        console.log(`Loaded ${state.players.length} players`);
        renderTeamForms();
    } catch (err) {
        console.error('Failed to load players:', err);
        showToast('Failed to load players', 'error');
    }
}

async function fetchTournament() {
    try {
        const response = await fetch('/api/tournament');
        const data = await response.json();
        Object.assign(state, {
            teams: data.teams,
            matches: data.matches,
            knockoutMatches: data.knockoutMatches,
            scheduleGenerated: data.scheduleGenerated
        });
        renderTeamForms();
        if (state.scheduleGenerated) {
            renderSchedule();
            renderStandings();
            renderKnockout();
        }
    } catch (err) {
        console.error('Failed to fetch tournament:', err);
        showToast('Failed to load tournament data', 'error');
    }
}

async function saveTournament() {
    try {
        const response = await fetch('/api/tournament', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                teams: state.teams,
                matches: state.matches,
                knockoutMatches: state.knockoutMatches,
                scheduleGenerated: state.scheduleGenerated
            })
        });
        return await response.json();
    } catch (err) {
        console.error('Failed to save tournament:', err);
        showToast('Failed to save changes', 'error');
        throw err;
    }
}

async function updateMatchOnServer(matchId, matchData) {
    try {
        const response = await fetch(`/api/match/${encodeURIComponent(matchId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(matchData)
        });
        return await response.json();
    } catch (err) {
        console.error('Failed to update match:', err);
        showToast('Failed to save score', 'error');
        throw err;
    }
}

async function updateKnockoutOnServer(matchKey, matchData) {
    try {
        const response = await fetch(`/api/knockout/${matchKey}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(matchData)
        });
        return await response.json();
    } catch (err) {
        console.error('Failed to update knockout match:', err);
        showToast('Failed to save score', 'error');
        throw err;
    }
}

async function resetTournamentOnServer() {
    try {
        const response = await fetch('/api/tournament', { method: 'DELETE' });
        return await response.json();
    } catch (err) {
        console.error('Failed to reset tournament:', err);
        showToast('Failed to reset tournament', 'error');
        throw err;
    }
}

// ========================================
// Navigation
// ========================================
function setupNavigation() {
    [...navLinks, ...mobileNavLinks].forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const sectionId = link.dataset.section;
            showSection(sectionId);
        });
    });
}

function showSection(sectionId) {
    sections.forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(sectionId).classList.add('active');

    navLinks.forEach(link => {
        link.classList.toggle('active', link.dataset.section === sectionId);
    });

    mobileNavLinks.forEach(link => {
        link.classList.toggle('active', link.dataset.section === sectionId);
    });
}

// ========================================
// Get Selected Players (for validation)
// ========================================
function getSelectedPlayers() {
    const selected = new Set();
    ['A', 'B'].forEach(pool => {
        state.teams[pool].forEach(team => {
            team.players.forEach(player => {
                if (player) selected.add(player);
            });
        });
    });
    return selected;
}

// Update dropdown options in-place without full re-render
function updatePlayerDropdownOptions() {
    const selectedPlayers = getSelectedPlayers();
    document.querySelectorAll('.player-select').forEach(select => {
        const currentValue = select.value;
        // Rebuild options: only show unassigned players + currently selected
        const availablePlayers = state.players.filter(p => p === currentValue || !selectedPlayers.has(p));

        // Keep the placeholder option, rebuild the rest
        select.innerHTML = `<option value="">Select player...</option>` +
            availablePlayers.map(p =>
                `<option value="${p}" ${p === currentValue ? 'selected' : ''}>${p}</option>`
            ).join('');
    });
}

// ========================================
// Team Forms with Dropdowns
// ========================================
function renderTeamForms() {
    renderPoolTeams('A', 'pool-a-teams');
    renderPoolTeams('B', 'pool-b-teams');
}

function renderPoolTeams(pool, containerId) {
    const container = document.getElementById(containerId);
    const teams = state.teams[pool];
    const selectedPlayers = getSelectedPlayers();

    container.innerHTML = teams.map((team, index) => `
        <div class="team-card" data-team="${team.id}">
            <div class="team-card-header">
                <div class="team-number">
                    <span class="team-badge">${index + 1}</span>
                    <input type="text"
                           class="team-name-input"
                           placeholder="Team Name"
                           value="${team.name}"
                           data-pool="${pool}"
                           data-index="${index}"
                           data-field="name"
                           ${state.scheduleGenerated ? 'disabled' : ''}>
                </div>
            </div>
            <div class="players-list">
                ${team.players.map((player, pIndex) => `
                    <div class="player-input-group">
                        <span class="player-number">${pIndex + 1}</span>
                        <select class="player-select ${player ? 'selected' : ''}"
                                data-pool="${pool}"
                                data-index="${index}"
                                data-player="${pIndex}"
                                ${state.scheduleGenerated ? 'disabled' : ''}>
                            <option value="">Select player...</option>
                            ${state.players
                                .filter(p => p === player || !selectedPlayers.has(p))
                                .map(p => `<option value="${p}" ${player === p ? 'selected' : ''}>${p}</option>`)
                                .join('')}
                        </select>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

// ========================================
// Event Listeners
// ========================================
function setupEventListeners() {
    // Team name input changes
    document.addEventListener('input', (e) => {
        if (e.target.classList.contains('team-name-input')) {
            const { pool, index } = e.target.dataset;
            state.teams[pool][index].name = e.target.value;
            // Debounced save
            debouncedSave();
        }
    });

    // Player select changes
    document.addEventListener('change', (e) => {
        if (e.target.classList.contains('player-select')) {
            const { pool, index, player } = e.target.dataset;
            state.teams[pool][index].players[player] = e.target.value;

            // Update visual state
            if (e.target.value) {
                e.target.classList.add('selected');
            } else {
                e.target.classList.remove('selected');
            }

            // Update other dropdowns' disabled options (without full re-render)
            updatePlayerDropdownOptions();

            // Save to server
            debouncedSave();
        }
    });

    // Generate schedule button
    document.getElementById('generate-btn').addEventListener('click', generateSchedule);

    // Reset button
    document.getElementById('reset-btn').addEventListener('click', resetTournament);

    // Schedule tabs
    document.querySelectorAll('.schedule-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.schedule-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            filterMatches(tab.dataset.pool);
        });
    });

    // Modal events
    modalClose.addEventListener('click', closeModal);
    modalCancel.addEventListener('click', closeModal);
    modalSave.addEventListener('click', saveScore);
    scoreModal.addEventListener('click', (e) => {
        if (e.target === scoreModal) closeModal();
    });

    // Keyboard escape to close modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && scoreModal.classList.contains('active')) {
            closeModal();
        }
    });
}

// Debounce helper
let saveTimeout = null;
function debouncedSave() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        pendingSave = true;
        await saveTournament();
        // Small delay to allow WebSocket message to arrive before clearing flag
        setTimeout(() => { pendingSave = false; }, 100);
    }, 500);
}

// ========================================
// Schedule Generation
// ========================================
async function generateSchedule() {
    // Validate all teams have names and players
    const allTeams = [...state.teams.A, ...state.teams.B];

    for (const team of allTeams) {
        if (!team.name.trim()) {
            showToast('Please enter names for all teams', 'error');
            return;
        }
        for (const player of team.players) {
            if (!player.trim()) {
                showToast(`Please select all players for team "${team.name || team.id}"`, 'error');
                return;
            }
        }
    }

    // Check for duplicate players
    const allPlayers = allTeams.flatMap(t => t.players);
    const uniquePlayers = new Set(allPlayers);
    if (uniquePlayers.size !== allPlayers.length) {
        showToast('Each player can only be on one team', 'error');
        return;
    }

    // Generate group stage matches
    state.matches = [];

    // Pool A matches (team 1 vs 2, 1 vs 3, 2 vs 3)
    generatePoolMatches('A');

    // Pool B matches
    generatePoolMatches('B');

    // Initialize knockout matches
    state.knockoutMatches = {
        semi1: createKnockoutMatch('semi1', 'A1', 'B2'),
        semi2: createKnockoutMatch('semi2', 'B1', 'A2'),
        final: createKnockoutMatch('final', 'W1', 'W2')
    };

    state.scheduleGenerated = true;

    try {
        await saveTournament();
        showToast('Schedule generated successfully!', 'success');
        showSection('schedule');
    } catch (err) {
        // Revert on error
        state.matches = [];
        state.knockoutMatches = { semi1: null, semi2: null, final: null };
        state.scheduleGenerated = false;
    }
}

function generatePoolMatches(pool) {
    const teams = state.teams[pool];
    const matchups = [
        [0, 1],
        [0, 2],
        [1, 2]
    ];

    matchups.forEach(([i, j]) => {
        const team1 = teams[i];
        const team2 = teams[j];

        // Generate 3 doubles matches
        // Each player pairs with each other player exactly once
        // Player combinations: (0,1), (0,2), (1,2)
        const pairings = [
            { team1Pair: [0, 1], team2Pair: [0, 1] },
            { team1Pair: [0, 2], team2Pair: [0, 2] },
            { team1Pair: [1, 2], team2Pair: [1, 2] }
        ];

        const match = {
            id: `${pool}-${team1.id}-${team2.id}`,
            pool,
            team1Id: team1.id,
            team2Id: team2.id,
            team1Name: team1.name,
            team2Name: team2.name,
            games: pairings.map((pairing, gameIndex) => ({
                id: gameIndex,
                team1Players: pairing.team1Pair.map(p => team1.players[p]),
                team2Players: pairing.team2Pair.map(p => team2.players[p]),
                team1Score: null,
                team2Score: null,
                winner: null
            })),
            team1GamesWon: 0,
            team2GamesWon: 0,
            winner: null,
            completed: false
        };

        state.matches.push(match);
    });
}

function createKnockoutMatch(id, seed1, seed2) {
    return {
        id,
        seed1,
        seed2,
        team1: null,
        team2: null,
        games: [],
        team1GamesWon: 0,
        team2GamesWon: 0,
        winner: null,
        completed: false
    };
}

// ========================================
// Schedule Rendering
// ========================================
function renderSchedule() {
    const container = document.getElementById('matches-container');

    if (!state.scheduleGenerated || state.matches.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">📋</span>
                <p>Generate the schedule from the Setup page first</p>
            </div>
        `;
        return;
    }

    container.innerHTML = state.matches.map((match, index) => renderMatchCard(match, index)).join('');
}

function renderMatchCard(match, index) {
    const team1Class = match.winner === match.team1Id ? 'winner' : '';
    const team2Class = match.winner === match.team2Id ? 'winner' : '';

    return `
        <div class="match-card" data-match="${match.id}" data-pool="${match.pool}">
            <div class="match-header">
                <div class="match-info">
                    <span class="match-number">Match ${index + 1}</span>
                    <span class="pool-badge pool-${match.pool.toLowerCase()}">Pool ${match.pool}</span>
                </div>
                <span class="match-status ${match.completed ? 'completed' : 'pending'}">
                    ${match.completed ? 'Completed' : 'Pending'}
                </span>
            </div>
            <div class="match-teams">
                <div class="match-team ${team1Class}">
                    <div class="match-team-name">${match.team1Name}</div>
                    <div class="match-team-score">${match.completed ? match.team1GamesWon : '-'}</div>
                </div>
                <span class="match-vs">VS</span>
                <div class="match-team ${team2Class}">
                    <div class="match-team-name">${match.team2Name}</div>
                    <div class="match-team-score">${match.completed ? match.team2GamesWon : '-'}</div>
                </div>
            </div>
            <div class="match-games">
                <div class="match-games-title">Doubles Matches</div>
                <div class="games-list">
                    ${match.games.map((game, gIndex) => renderGameRow(game, gIndex, match)).join('')}
                </div>
            </div>
            <div class="match-actions">
                <button class="btn btn-primary btn-sm" onclick="openScoreModal('${match.id}')">
                    ${match.completed ? 'Edit Score' : 'Enter Score'}
                </button>
            </div>
        </div>
    `;
}

// Helper: Check if score1 beats score2 per badminton rules (BWF Standard)
// - First to 21 wins
// - At 20-20 deuce: need 2-point lead
// - Cap at 30: at 29-29, first to 30 wins
function isGameWinner(score1, score2) {
    if (score1 <= score2) return false;
    // Cap at 30: if score1 reaches 30, they win
    if (score1 === 30) return true;
    // Normal win: reach 21 with opponent below 20
    if (score1 >= 21 && score2 < 20) return true;
    // Deuce win: 2-point lead after 20-all
    if (score1 >= 21 && score2 >= 20 && score1 - score2 >= 2) return true;
    return false;
}

function renderGameRow(game, index, match) {
    const hasScore = game.team1Score !== null && game.team2Score !== null;

    // Use proper badminton win detection
    let team1Won = false;
    let team2Won = false;
    if (hasScore) {
        team1Won = isGameWinner(game.team1Score, game.team2Score);
        team2Won = isGameWinner(game.team2Score, game.team1Score);
    }

    return `
        <div class="game-row">
            <div class="game-team1-players ${team1Won ? 'winner' : ''}">
                ${game.team1Players.join(' & ')}
            </div>
            <div class="game-vs-container">
                ${team1Won ? '<span class="winner-shuttle">🏸</span>' : '<span class="winner-shuttle-placeholder"></span>'}
                <span class="game-vs">vs</span>
                ${team2Won ? '<span class="winner-shuttle">🏸</span>' : '<span class="winner-shuttle-placeholder"></span>'}
            </div>
            <div class="game-team2-players ${team2Won ? 'winner' : ''}">
                ${game.team2Players.join(' & ')}
            </div>
            <div class="game-score">${hasScore ? `${game.team1Score} - ${game.team2Score}` : '-'}</div>
        </div>
    `;
}

function filterMatches(pool) {
    const cards = document.querySelectorAll('.match-card');
    cards.forEach(card => {
        if (pool === 'all' || card.dataset.pool === pool) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
}

// ========================================
// Score Modal
// ========================================
function openScoreModal(matchId) {
    const match = state.matches.find(m => m.id === matchId);
    if (!match) return;

    currentEditMatch = match;
    currentEditType = 'group';

    document.getElementById('modal-title').textContent = `${match.team1Name} vs ${match.team2Name}`;

    const modalBody = document.getElementById('modal-body');
    modalBody.innerHTML = match.games.map((game, index) => `
        <div class="score-input-group">
            <div class="score-input-header">
                <h3>Game ${index + 1}</h3>
            </div>
            <div class="score-pair">
                <div class="score-pair-players">
                    <div>${game.team1Players.join(' & ')}</div>
                    <div class="score-pair-vs">vs</div>
                    <div>${game.team2Players.join(' & ')}</div>
                </div>
                <div class="score-inputs">
                    <input type="number"
                           class="score-input"
                           id="game-${index}-score1"
                           min="0"
                           max="30"
                           value="${game.team1Score !== null ? game.team1Score : ''}"
                           placeholder="0">
                    <span class="score-separator">-</span>
                    <input type="number"
                           class="score-input"
                           id="game-${index}-score2"
                           min="0"
                           max="30"
                           value="${game.team2Score !== null ? game.team2Score : ''}"
                           placeholder="0">
                </div>
            </div>
        </div>
    `).join('');

    scoreModal.classList.add('active');
}

function openKnockoutScoreModal(matchKey) {
    const match = state.knockoutMatches[matchKey];
    if (!match || !match.team1 || !match.team2) {
        showToast('Teams have not been determined yet', 'info');
        return;
    }

    currentEditMatch = match;
    currentEditType = 'knockout';

    document.getElementById('modal-title').textContent = `${match.team1.name} vs ${match.team2.name}`;

    // If games not initialized, create them
    if (match.games.length === 0) {
        initializeKnockoutGames(match);
    }

    const modalBody = document.getElementById('modal-body');
    modalBody.innerHTML = match.games.map((game, index) => `
        <div class="score-input-group">
            <div class="score-input-header">
                <h3>Game ${index + 1}</h3>
            </div>
            <div class="score-pair">
                <div class="score-pair-players">
                    <div>${game.team1Players.join(' & ')}</div>
                    <div class="score-pair-vs">vs</div>
                    <div>${game.team2Players.join(' & ')}</div>
                </div>
                <div class="score-inputs">
                    <input type="number"
                           class="score-input"
                           id="game-${index}-score1"
                           min="0"
                           max="30"
                           value="${game.team1Score !== null ? game.team1Score : ''}"
                           placeholder="0">
                    <span class="score-separator">-</span>
                    <input type="number"
                           class="score-input"
                           id="game-${index}-score2"
                           min="0"
                           max="30"
                           value="${game.team2Score !== null ? game.team2Score : ''}"
                           placeholder="0">
                </div>
            </div>
        </div>
    `).join('');

    scoreModal.classList.add('active');
}

function initializeKnockoutGames(match) {
    const pairings = [
        { team1Pair: [0, 1], team2Pair: [0, 1] },
        { team1Pair: [0, 2], team2Pair: [0, 2] },
        { team1Pair: [1, 2], team2Pair: [1, 2] }
    ];

    match.games = pairings.map((pairing, gameIndex) => ({
        id: gameIndex,
        team1Players: pairing.team1Pair.map(p => match.team1.players[p]),
        team2Players: pairing.team2Pair.map(p => match.team2.players[p]),
        team1Score: null,
        team2Score: null,
        winner: null
    }));
}

function closeModal() {
    scoreModal.classList.remove('active');
    currentEditMatch = null;
    currentEditType = null;
}

async function saveScore() {
    if (!currentEditMatch) return;

    let allGamesScored = true;
    let team1Wins = 0;
    let team2Wins = 0;

    currentEditMatch.games.forEach((game, index) => {
        const score1Input = document.getElementById(`game-${index}-score1`);
        const score2Input = document.getElementById(`game-${index}-score2`);

        const score1 = score1Input.value !== '' ? parseInt(score1Input.value) : null;
        const score2 = score2Input.value !== '' ? parseInt(score2Input.value) : null;

        game.team1Score = score1;
        game.team2Score = score2;

        if (score1 !== null && score2 !== null) {
            // Use proper badminton win detection
            if (isGameWinner(score1, score2)) {
                game.winner = 'team1';
                team1Wins++;
            } else if (isGameWinner(score2, score1)) {
                game.winner = 'team2';
                team2Wins++;
            } else {
                // Game not yet decided (e.g., 20-20 with no 2-point lead)
                game.winner = null;
                allGamesScored = false;
            }
        } else {
            allGamesScored = false;
        }
    });

    currentEditMatch.team1GamesWon = team1Wins;
    currentEditMatch.team2GamesWon = team2Wins;
    currentEditMatch.completed = allGamesScored;

    if (allGamesScored) {
        if (team1Wins > team2Wins) {
            currentEditMatch.winner = currentEditType === 'group'
                ? currentEditMatch.team1Id
                : currentEditMatch.team1.id;
        } else if (team2Wins > team1Wins) {
            currentEditMatch.winner = currentEditType === 'group'
                ? currentEditMatch.team2Id
                : currentEditMatch.team2.id;
        }
    }

    try {
        if (currentEditType === 'group') {
            await updateMatchOnServer(currentEditMatch.id, currentEditMatch);
        } else {
            // Update knockout progression before saving
            updateKnockoutProgression();
            await saveTournament();
        }
        showToast('Score saved!', 'success');
    } catch (err) {
        showToast('Failed to save score', 'error');
    }

    closeModal();
}

// ========================================
// Standings
// ========================================
function renderStandings() {
    renderPoolStandings('A', 'standings-a');
    renderPoolStandings('B', 'standings-b');
}

function renderPoolStandings(pool, tableId) {
    const teams = state.teams[pool];
    const standings = calculateStandings(pool);

    const tbody = document.querySelector(`#${tableId} tbody`);
    tbody.innerHTML = standings.map((team, index) => `
        <tr>
            <td><span class="position-badge position-${index + 1}">${index + 1}</span></td>
            <td>${team.name}</td>
            <td>${team.played}</td>
            <td>${team.matchesWon}</td>
            <td>${team.matchesLost}</td>
            <td>${team.gamesWon}</td>
            <td>${team.gamesLost}</td>
            <td><strong>${team.points}</strong></td>
        </tr>
    `).join('');
}

function calculateStandings(pool) {
    const teams = state.teams[pool];
    const poolMatches = state.matches.filter(m => m.pool === pool);

    const standings = teams.map(team => ({
        id: team.id,
        name: team.name,
        played: 0,
        matchesWon: 0,
        matchesLost: 0,
        gamesWon: 0,
        gamesLost: 0,
        points: 0
    }));

    poolMatches.forEach(match => {
        if (!match.completed) return;

        const team1Standing = standings.find(s => s.id === match.team1Id);
        const team2Standing = standings.find(s => s.id === match.team2Id);

        if (team1Standing && team2Standing) {
            team1Standing.played++;
            team2Standing.played++;

            team1Standing.gamesWon += match.team1GamesWon;
            team1Standing.gamesLost += match.team2GamesWon;
            team2Standing.gamesWon += match.team2GamesWon;
            team2Standing.gamesLost += match.team1GamesWon;

            if (match.winner === match.team1Id) {
                team1Standing.matchesWon++;
                team1Standing.points += 2;
                team2Standing.matchesLost++;
            } else if (match.winner === match.team2Id) {
                team2Standing.matchesWon++;
                team2Standing.points += 2;
                team1Standing.matchesLost++;
            } else {
                // Draw (both get 1 point)
                team1Standing.points += 1;
                team2Standing.points += 1;
            }
        }
    });

    // Sort by points, then game difference
    standings.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        const aDiff = a.gamesWon - a.gamesLost;
        const bDiff = b.gamesWon - b.gamesLost;
        return bDiff - aDiff;
    });

    return standings;
}

// ========================================
// Knockout Stage
// ========================================
function renderKnockout() {
    updateKnockoutTeams();

    const { semi1, semi2, final: finalMatch } = state.knockoutMatches;

    // Semi 1 (A1 vs B2)
    renderBracketMatch('semi1', semi1);

    // Semi 2 (B1 vs A2)
    renderBracketMatch('semi2', semi2);

    // Final
    renderBracketMatch('final', finalMatch);

    // Show champion if final is complete
    if (finalMatch && finalMatch.completed && finalMatch.winner) {
        const champion = finalMatch.winner === finalMatch.team1.id
            ? finalMatch.team1.name
            : finalMatch.team2.name;

        document.getElementById('champion-name').textContent = champion;
        document.getElementById('champion-display').style.display = 'block';
    } else {
        document.getElementById('champion-display').style.display = 'none';
    }
}

function renderBracketMatch(matchKey, match) {
    const element = document.getElementById(matchKey);
    if (!element || !match) return;

    const team1Name = match.team1 ? match.team1.name : 'TBD';
    const team2Name = match.team2 ? match.team2.name : 'TBD';
    const team1Score = match.completed ? match.team1GamesWon : '-';
    const team2Score = match.completed ? match.team2GamesWon : '-';

    const team1Winner = match.completed && match.winner === (match.team1 ? match.team1.id : null);
    const team2Winner = match.completed && match.winner === (match.team2 ? match.team2.id : null);

    element.innerHTML = `
        <div class="bracket-team top ${team1Winner ? 'winner' : ''}">
            <span class="seed">${match.seed1}</span>
            <span class="team-name">${team1Name}</span>
            <span class="score">${team1Score}</span>
        </div>
        <div class="vs-badge">VS</div>
        <div class="bracket-team bottom ${team2Winner ? 'winner' : ''}">
            <span class="seed">${match.seed2}</span>
            <span class="team-name">${team2Name}</span>
            <span class="score">${team2Score}</span>
        </div>
    `;

    // Add click handler for scoring
    element.onclick = () => openKnockoutScoreModal(matchKey);
}

function updateKnockoutTeams() {
    if (!state.scheduleGenerated) return;

    const standingsA = calculateStandings('A');
    const standingsB = calculateStandings('B');

    // Get team data
    const getTeamData = (pool, position) => {
        const standings = pool === 'A' ? standingsA : standingsB;
        if (standings[position - 1]) {
            const teamId = standings[position - 1].id;
            const poolData = state.teams[pool];
            return poolData.find(t => t.id === teamId);
        }
        return null;
    };

    // Semi 1: A1 vs B2
    const a1 = getTeamData('A', 1);
    const b2 = getTeamData('B', 2);
    if (state.knockoutMatches.semi1) {
        state.knockoutMatches.semi1.team1 = a1;
        state.knockoutMatches.semi1.team2 = b2;
    }

    // Semi 2: B1 vs A2
    const b1 = getTeamData('B', 1);
    const a2 = getTeamData('A', 2);
    if (state.knockoutMatches.semi2) {
        state.knockoutMatches.semi2.team1 = b1;
        state.knockoutMatches.semi2.team2 = a2;
    }
}

function updateKnockoutProgression() {
    const { semi1, semi2, final: finalMatch } = state.knockoutMatches;

    // Update final teams based on semifinal winners
    if (semi1 && semi1.completed && semi1.winner) {
        finalMatch.team1 = semi1.winner === semi1.team1.id ? semi1.team1 : semi1.team2;
    }

    if (semi2 && semi2.completed && semi2.winner) {
        finalMatch.team2 = semi2.winner === semi2.team1.id ? semi2.team1 : semi2.team2;
    }

    // Reset final games if teams change
    if (finalMatch.team1 && finalMatch.team2 && finalMatch.games.length === 0) {
        initializeKnockoutGames(finalMatch);
    }
}

// ========================================
// Reset Tournament
// ========================================
async function resetTournament() {
    if (!confirm('Are you sure you want to reset the tournament? All data will be lost.')) {
        return;
    }

    try {
        await resetTournamentOnServer();
        showToast('Tournament reset successfully', 'success');
        showSection('setup');
    } catch (err) {
        showToast('Failed to reset tournament', 'error');
    }
}

// Make functions globally available for onclick handlers
window.openScoreModal = openScoreModal;
window.openKnockoutScoreModal = openKnockoutScoreModal;

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', init);
