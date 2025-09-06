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
let currentWord = null;

async function startRound() {
  const wordObj = words[Math.floor(Math.random() * words.length)];
  currentWord = wordObj;
  submissions = {};
  votes = {};
  io.emit('newRound', {
    word: wordObj.word,
    translation: wordObj.translation,
    audioUrl: `/audio/${wordObj.audio}`
  });
}

io.on('connection', (socket) => {
  console.log('client connected', socket.id);
  scores[socket.id] = 0;

  socket.emit('joined', { scores });
  io.emit('scoresUpdate', scores);

  if (!currentWord) startRound();

  socket.on('submitDrawing', ({ imageDataUrl }) => {
    submissions[socket.id] = imageDataUrl;
    io.emit('submissionUpdate', { submitted: Object.keys(submissions).length });

    // when all connected players have submitted, go to showdown
    if (Object.keys(submissions).length === Object.keys(scores).length) {
      const payload = Object.entries(submissions).map(([id, img]) => ({ id, image: img }));
      io.emit('showdown', { submissions: payload });
    }
  });

  socket.on('vote', ({ winnerId }) => {
    votes[socket.id] = winnerId;

    if (Object.keys(votes).length === Object.keys(scores).length) {
      // tally
      const counts = {};
      for (const v of Object.values(votes)) counts[v] = (counts[v] || 0) + 1;
      let winner = null;
      if (Object.keys(counts).length > 0) {
        winner = Object.keys(counts).reduce((a, b) => (counts[a] >= counts[b] ? a : b));
        scores[winner] = (scores[winner] || 0) + 1;
      }

      io.emit('roundResult', { winner, scores });
      setTimeout(startRound, 2000);
    }
  });

  socket.on('disconnect', () => {
    console.log('disconnect', socket.id);
    delete scores[socket.id];
    delete submissions[socket.id];
    delete votes[socket.id];
    io.emit('scoresUpdate', scores);
    if (Object.keys(scores).length === 0) {
      currentWord = null;
    }
  });
});

server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
