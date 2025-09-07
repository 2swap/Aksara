const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

const inputLang = process.argv[2].toLowerCase();

// load words
const wordFilePath = path.join(__dirname, `words`, `${inputLang}.json`);
if (fs.existsSync(wordFilePath) === false) {
    console.error(`Word file for language "${inputLang}" not found at path: ${wordFilePath}`);
    process.exit(1);
}
const words = JSON.parse(fs.readFileSync(wordFilePath));

app.use(express.static(path.join(__dirname, 'public')));

// Global game state
let scores = {}; // socket.id -> score
let submissions = {}; // socket.id -> image
let votes = {}; // socket.id -> voted winner
let usernames = {}; // socket.id -> username
let currentWord = null;

let pendingUsers = {}; // socket.id -> username

let writeTimer = null;
let voteTimer = null;
let currentPhase = null; // 'writing' | 'voting' | null

function emitToActive(event, payload) {
    for (const id of Object.keys(scores)) {
        io.to(id).emit(event, payload);
    }
}

// Make a map from usernames to scores
function usernames_to_scores() {
    const result = {};
    for (const [id, score] of Object.entries(scores)) {
        result[usernames[id]] = score;
    }
    return result;
}

function emitScores() {
    const result = usernames_to_scores();
    emitToActive('scoresUpdate', result);
}

function clearWriteTimer() {
    if (writeTimer) {
        clearTimeout(writeTimer);
        writeTimer = null;
    }
}

function clearVoteTimer() {
    if (voteTimer) {
        clearTimeout(voteTimer);
        voteTimer = null;
    }
}

function startVotingPhase() {
    if (currentPhase !== 'writing') return;
    clearWriteTimer();
    currentPhase = 'voting';
    // send submissions to all active players, indicate readyToVote
    const payload = {
        submissions: Object.entries(submissions).map(([id, img]) => ({ id, image: img })),
        word: currentWord ? currentWord.word : null,
        translation: currentWord ? currentWord.translation : null,
        readyToVote: true
    };
    emitToActive('submissions', payload);
    emitToActive('votingStarted', { duration: 10 });
    // start vote timer
    voteTimer = setTimeout(() => {
        finalizeVoting();
    }, 15 * 1000);
}

function finalizeVoting() {
    if (currentPhase !== 'voting') return;
    clearVoteTimer();
    currentPhase = null;
    // Tally votes, should include zero scores
    const tally = {};
    for (const id of Object.keys(scores)) {
        tally[id] = 0;
    }
    for (const votedId of Object.values(votes)) {
        if (votedId in tally) {
            tally[votedId] += 1;
        }
    }
    emitToActive('roundResult', { tally });
    // Update scores
    for (const [id, count] of Object.entries(tally)) {
        scores[id] += count;
    }
    emitScores();
    // schedule next round
    setTimeout(startRound, 5000);
}

async function startRound() {
    // clear any existing timers
    clearWriteTimer();
    clearVoteTimer();
    currentPhase = null;

    // promote pending users to active players
    for (const [id, username] of Object.entries(pendingUsers)) {
        scores[id] = 0;
        usernames[id] = username;
    }
    pendingUsers = {};

    const wordObj = words[Math.floor(Math.random() * words.length)];
    currentWord = wordObj;
    submissions = {};
    votes = {};
    emitToActive('newRound', {
        audioUrl: `/audio/${inputLang}/${wordObj.audio}`
    });
    emitScores();

    // start writing phase
    currentPhase = 'writing';
    writeTimer = setTimeout(() => {
        startVotingPhase();
    }, 60 * 1000);
}

console.log('Starting server...');

io.on('connection', (socket) => {
    console.log('client connected', socket.id);

    socket.on('join', ({ username }) => {
        if (!username) return;
        // If a round is active, user must wait until next round starts
        if (currentWord) {
            pendingUsers[socket.id] = username;
            usernames[socket.id] = username;
            console.log('user pending', username, socket.id);
            // do not send any information to this socket until next round
        } else {
            // no active round, add immediately and start a round
            scores[socket.id] = 0;
            usernames[socket.id] = username;
            emitScores();
            if (!currentWord) startRound();
        }
    });

    socket.on('submitDrawing', ({ imageDataUrl }) => {
        // only active players can submit and only during writing phase
        if (!(socket.id in scores)) return;
        if (currentPhase !== 'writing') return;
        submissions[socket.id] = imageDataUrl;

        // when all connected players have submitted, go to showdown
        const allSubmitted = Object.keys(submissions).length === Object.keys(scores).length;
        const payload = {
            submissions: Object.entries(submissions).map(([id, img]) => ({ id, image: img })),
            word: currentWord.word,
            translation: currentWord.translation,
            readyToVote: allSubmitted
        };
        if (allSubmitted) {
            // move to voting immediately
            startVotingPhase();
        } else {
            // Send all submissions to all players who have submitted
            for (const id of Object.keys(submissions)) {
                io.to(id).emit('submissions', payload);
            }
        }
    });

    socket.on('vote', ({ winnerId }) => {
        // only active players can vote and only during voting phase
        if (!(socket.id in scores)) return;
        if (currentPhase !== 'voting') return;
        votes[socket.id] = winnerId;

        if (Object.keys(votes).length === Object.keys(scores).length) {
            finalizeVoting();
        }
    });

    socket.on('disconnect', () => {
        console.log('disconnect', socket.id);
        if (socket.id in scores) {
            delete scores[socket.id];
            delete submissions[socket.id];
            delete votes[socket.id];
            delete usernames[socket.id];
            emitScores();
            if (Object.keys(scores).length === 0) {
                currentWord = null;
                // clear timers if no players remain
                clearWriteTimer();
                clearVoteTimer();
                currentPhase = null;
            }
        } else if (socket.id in pendingUsers) {
            delete pendingUsers[socket.id];
            delete usernames[socket.id];
        }
    });
});

server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT} (language: ${inputLang})`));
