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

// load words
const words = JSON.parse(fs.readFileSync(path.join(__dirname, 'words.json'), 'utf8'));

app.use(express.static(path.join(__dirname, 'public')));

// Global game state
let scores = {}; // socket.id -> score
let submissions = {}; // socket.id -> image
let votes = {}; // socket.id -> voted winner
let usernames = {}; // socket.id -> username
let currentWord = null;

let pendingUsers = {}; // socket.id -> username

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
    console.log('usernames_to_scores', result);
    emitToActive('scoresUpdate', result);
}

async function startRound() {
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
        audioUrl: `/audio/${wordObj.audio}`
    });
    emitScores();
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
        // only active players can submit
        if (!(socket.id in scores)) return;
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
            emitToActive('submissions', payload);
        }
        else {
            // Send all submissions to all players who have submitted
            for (const id of Object.keys(submissions)) {
                io.to(id).emit('submissions', payload);
            }
        }
    });

    socket.on('vote', ({ winnerId }) => {
        // only active players can vote
        if (!(socket.id in scores)) return;
        votes[socket.id] = winnerId;

        if (Object.keys(votes).length === Object.keys(scores).length) {
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
            setTimeout(startRound, 5000);
            // Update scores
            for (const [id, count] of Object.entries(tally)) {
                scores[id] += count;
            }
            emitScores();
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
            }
        } else if (socket.id in pendingUsers) {
            delete pendingUsers[socket.id];
            delete usernames[socket.id];
        }
    });
});

server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
