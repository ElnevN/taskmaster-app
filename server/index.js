// server/index.js

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { nanoid } = require('nanoid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { 
    origin: process.env.FRONTEND_URL || "http://localhost:5173", 
    methods: ["GET", "POST"] 
  }
});

const PORT = 3001;
const sessions = {};

// --- Game Details ---
const GAME_1_DETAILS = {
  title: "Game 1: The most impressive object",
  instructions: "You have 30 seconds to find the most impressive object you can hold in one hand.\n\nOnce we are all back, each of us will get a chance to do a 20-second pitch to explain why it's impressive, weird, or emotionally significant. Be creative!"
};

const GAME_2_DETAILS = {
  title: "Game 2: Recreate in Emoji",
  instructions: "Use only emojis to describe the person below. Think about their personality, quirks, habits, and legacy. Submit your emoji masterpiece!"
};

const GAME_3_DETAILS = {
  title: "Game 3: Wrong Answers Only",
  instructions: "Answer these questions about the person below, but with the wrongest answers you can think of. The more hilarious and absurd, the better!"
};
const GAME_3_QUESTIONS = [
  "What was [NAME] actually hired to do?",
  "What does our department even do?",
  "What will [NAME] do next in life?"
];

// --- UPDATED: Details and Constants for Game 4 ---
const GAME_4_VOTE_EMOJIS = ['🧐', '🤭', '👍', '💡', '🎉'];
const GAME_4_EMOJI_POINTS = { '🧐': 1, '🤭': 2, '👍': 3, '💡': 4, '🎉': 5 };
const GAME_4_GOH_BONUS = { '👍': 2, '💡': 2, '🎉': 2 }; // Bonus points for GoH votes
const CORRECT_GUESS_BONUS = 4;
const POKER_FACE_BONUS = 5;

const GAME_4_DETAILS = {
  title: "Game 4: What’s in Your Mug?",
  instructions: "First, everyone secretly submit what's *actually* in your mug.\n\nThen, one by one, a person will be chosen. They will have 10 seconds to pitch what's in their mug (you can bluff!). Everyone else will guess what's inside. Let's see who can fool the room!"
};


const EMOJI_POINTS = { '⭐': 3, '❤️': 2, '😂': 1 };
const GAME_3_EMOJI_POINTS = { '🤨': 1, '🥹': 2, '🤯': 3, '🤪': 4, '🦄': 5 };

// --- Utility Functions ---
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// --- Socket.IO Connection Handling ---
io.on('connection', (socket) => {
  // --- Helper Functions ---
  const broadcastPlayers = (gameCode) => {
    const session = sessions[gameCode];
    if (session) {
      const payload = {
        players: session.players,
        taskmasterId: session.taskmasterId,
        guestOfHonourIds: session.guestOfHonourIds,
        celebrationType: session.celebrationType // NEW: Broadcast celebration type
      };
      io.to(gameCode).emit('update-players', payload);
    }
  };

  // --- Lobby and Game Setup ---
  socket.on('create-game', (playerName) => {
    const gameCode = nanoid(5).toUpperCase();
    socket.join(gameCode);
    sessions[gameCode] = {
      taskmasterId: socket.id,
      guestOfHonourIds: [],
      players: [{ id: socket.id, name: playerName, score: 0 }],
      gameState: 'lobby',
      celebrationType: 'farewell' // NEW: Default celebration type
    };
    socket.emit('game-created', { gameCode });
    broadcastPlayers(gameCode);
  });

  socket.on('join-game', (data) => {
    const { gameCode, playerName } = data;
    const session = sessions[gameCode];
    if (session) {
      socket.join(gameCode);
      session.players.push({ id: socket.id, name: playerName, score: 0 });
      socket.emit('join-successful', { gameCode, celebrationType: session.celebrationType });
      broadcastPlayers(gameCode);
    } else {
      socket.emit('join-error', 'Game not found.');
    }
  });

  socket.on('nominate-goh', ({ gameCode, playerId }) => {
    const session = sessions[gameCode];
    if (session && session.taskmasterId === socket.id) {
      const isAlreadyNominated = session.guestOfHonourIds.includes(playerId);
      if (isAlreadyNominated) {
        session.guestOfHonourIds = session.guestOfHonourIds.filter(id => id !== playerId);
      } else {
        if (session.guestOfHonourIds.length < 2) {
          session.guestOfHonourIds.push(playerId);
        }
      }
      broadcastPlayers(gameCode);
    }
  });
  
  // NEW: Handler for setting celebration type
  socket.on('set-celebration-type', ({ gameCode, type }) => {
    const session = sessions[gameCode];
    if (session && session.taskmasterId === socket.id) {
      session.celebrationType = type;
      broadcastPlayers(gameCode); // Inform everyone of the change
    }
  });

  socket.on('transfer-taskmaster', ({ gameCode, newMasterId }) => {
    const session = sessions[gameCode];
    if (session && session.taskmasterId === socket.id) {
      const newMasterExists = session.players.some(p => p.id === newMasterId);
      if (newMasterExists) {
        session.taskmasterId = newMasterId;
        session.guestOfHonourIds = session.guestOfHonourIds.filter(id => id !== newMasterId);
        broadcastPlayers(gameCode);
      }
    }
  });

  // --- Game 1: Impressive Object ---
  socket.on('start-game', (gameCode) => {
    const session = sessions[gameCode];
    if (session && session.taskmasterId === socket.id) {
      session.gameState = 'game1_intro';
      io.to(gameCode).emit('game-starting', GAME_1_DETAILS);
    }
  });

  socket.on('start-timer', (gameCode) => {
    const session = sessions[gameCode];
    if (session && session.taskmasterId === socket.id && !session.timerId) {
      session.gameState = 'game1_running';
      let timer = 30;
      const intervalId = setInterval(() => {
        io.to(gameCode).emit('timer-tick', timer);
        timer--;
        if (timer < 0) {
          clearInterval(intervalId);
          delete session.timerId;
          session.gameState = 'game1_pitching';
          session.pitchingOrder = shuffleArray([...session.players]);
          session.currentPitcherIndex = -1;
          session.game1Votes = {};
          io.to(gameCode).emit('timer-finished');
        }
      }, 1000);
      session.timerId = intervalId;
    }
  });

  socket.on('start-pitch-timer', (gameCode) => {
    const session = sessions[gameCode];
    if (session && session.taskmasterId === socket.id && !session.pitchTimerId) {
      let pitchTimer = 20;
      const intervalId = setInterval(() => {
        io.to(gameCode).emit('pitch-timer-tick', pitchTimer);
        pitchTimer--;
        if (pitchTimer < 0) {
          clearInterval(intervalId);
          delete session.pitchTimerId;
          io.to(gameCode).emit('pitch-timer-finished');
        }
      }, 1000);
      session.pitchTimerId = intervalId;
    }
  });

  socket.on('next-pitcher', (gameCode) => {
    const session = sessions[gameCode];
    if (session && session.taskmasterId === socket.id) {
      session.currentPitcherIndex++;
      const pitcherIndex = session.currentPitcherIndex;
      const pitchingOrder = session.pitchingOrder;
      if (pitcherIndex < pitchingOrder.length) {
        const currentPitcher = pitchingOrder[pitcherIndex];
        io.to(gameCode).emit('update-pitcher', currentPitcher);
      } else {
        io.to(gameCode).emit('pitching-finished'); 
      }
    }
  });

  socket.on('cast-vote', ({ gameCode, emoji }) => {
    const session = sessions[gameCode];
    if (!session || !session.pitchingOrder || session.currentPitcherIndex < 0 || session.currentPitcherIndex >= session.pitchingOrder.length) return;
    const pitcher = session.pitchingOrder[session.currentPitcherIndex];
    if (pitcher && session.game1Votes) {
      if (!session.game1Votes[pitcher.id]) session.game1Votes[pitcher.id] = {};
      session.game1Votes[pitcher.id][socket.id] = emoji;
    }
  });
  
  socket.on('tally-votes', (gameCode) => {
    const session = sessions[gameCode];
    if (session && session.taskmasterId === socket.id) {
      session.players.forEach(p => p.score = 0);
      const votes = session.game1Votes;
      for (const pitcherId in votes) {
        for (const voterId in votes[pitcherId]) {
          const emoji = votes[pitcherId][voterId];
          let points = EMOJI_POINTS[emoji] || 0;
          if (session.guestOfHonourIds.includes(voterId)) points *= 2;
          const playerToCredit = session.players.find(p => p.id === pitcherId);
          if (playerToCredit) playerToCredit.score += points;
        }
      }
      const results = [...session.players].sort((a, b) => b.score - a.score);
      io.to(gameCode).emit('show-results', results);
    }
  });

  // --- Game 2: Emoji Colleague ---
  socket.on('start-game-2', (gameCode) => {
    const session = sessions[gameCode];
    if (session && session.taskmasterId === socket.id) {
      session.gameState = 'game2_submission';
      session.game2Submissions = {};
      
      const players = session.players;
      const guests = session.guestOfHonourIds;
      const assignments = {};

      let totalToSubmit = players.length;
      if (guests.length === 1) {
        totalToSubmit = players.length - 1;
      } else if (guests.length === 2) {
        totalToSubmit = players.length;
      }
      session.game2TotalSubmissions = totalToSubmit;

      if (guests.length === 0) {
        const targets = shuffleArray([...players]);
        players.forEach((player, index) => {
          let targetIndex = (index + 1) % targets.length;
          assignments[player.id] = targets[targetIndex];
        });
      } else if (guests.length === 1) {
        const target = players.find(p => p.id === guests[0]);
        players.forEach(player => {
          if (player.id !== target.id) {
            assignments[player.id] = target;
          }
        });
      } else { 
        const guest1Id = guests[0];
        const guest2Id = guests[1];
        const target1 = players.find(p => p.id === guest1Id);
        const target2 = players.find(p => p.id === guest2Id);
        
        assignments[guest1Id] = target2;
        assignments[guest2Id] = target1;

        const otherPlayers = players.filter(p => !guests.includes(p.id));
        const shuffledOthers = shuffleArray(otherPlayers);
        const midpoint = Math.ceil(shuffledOthers.length / 2);
        shuffledOthers.slice(0, midpoint).forEach(p => assignments[p.id] = target1);
        shuffledOthers.slice(midpoint).forEach(p => assignments[p.id] = target2);
      }
      
      session.game2Assignments = assignments;
      
      players.forEach(player => {
        const target = assignments[player.id];
        io.to(player.id).emit('game-2-starting', { ...GAME_2_DETAILS, target });
      });
      io.to(gameCode).emit('update-submission-count', { submitted: 0, total: session.game2TotalSubmissions });
    }
  });

  socket.on('submit-emoji', ({ gameCode, submission }) => {
    const session = sessions[gameCode];
    if (session && session.game2Submissions) {
      session.game2Submissions[socket.id] = submission;
      socket.emit('submission-received');
      const submittedCount = Object.keys(session.game2Submissions).length;
      io.to(gameCode).emit('update-submission-count', { submitted: submittedCount, total: session.game2TotalSubmissions });
    }
  });
  
  socket.on('show-submissions', (gameCode) => {
    const session = sessions[gameCode];
    if (session && session.taskmasterId === socket.id) {
      session.gameState = 'game2_presentation';
      const submittedPlayers = session.players.filter(p => session.game2Submissions[p.id]);
      session.submissionOrder = shuffleArray(submittedPlayers);
      session.currentSubmissionIndex = -1;
      session.game2Votes = {};
      io.to(gameCode).emit('presentation-starting');
    }
  });

  socket.on('next-submission', (gameCode) => {
    const session = sessions[gameCode];
    if (session && session.taskmasterId === socket.id) {
      session.currentSubmissionIndex++;
      const subIndex = session.currentSubmissionIndex;
      const subOrder = session.submissionOrder;
      if (subIndex < subOrder.length) {
        const authorId = subOrder[subIndex].id;
        const submission = { author: subOrder[subIndex], emojis: session.game2Submissions[authorId] };
        io.to(gameCode).emit('update-submission', submission);
      } else {
        io.to(gameCode).emit('submission-finished');
      }
    }
  });

  socket.on('cast-vote-game2', ({ gameCode, emoji }) => {
    const session = sessions[gameCode];
    if (!session || !session.submissionOrder || session.currentSubmissionIndex < 0 || session.currentSubmissionIndex >= session.submissionOrder.length) return;
    const author = session.submissionOrder[session.currentSubmissionIndex];
    if (author && session.game2Votes) {
      if (!session.game2Votes[author.id]) session.game2Votes[author.id] = {};
      session.game2Votes[author.id][socket.id] = emoji;
    }
  });

  socket.on('tally-votes-game2', (gameCode) => {
    const session = sessions[gameCode];
    if (session && session.taskmasterId === socket.id) {
      const votes = session.game2Votes;
      const roundScores = {};

      for (const authorId in votes) {
        for (const voterId in votes[authorId]) {
          const emoji = votes[authorId][voterId];
          let points = EMOJI_POINTS[emoji] || 0;
          if (session.guestOfHonourIds.includes(voterId)) points *= 2;
          roundScores[authorId] = (roundScores[authorId] || 0) + points;
        }
      }

      for (const playerId in roundScores) {
        const player = session.players.find(p => p.id === playerId);
        if (player) player.score += roundScores[playerId];
      }
      
      if (session.guestOfHonourIds.length === 1) {
        const gohId = session.guestOfHonourIds[0];
        const gohPlayer = session.players.find(p => p.id === gohId);
        if (gohPlayer && !session.game2Submissions[gohId]) {
          const competingPlayerIds = Object.keys(roundScores);
          const totalRoundScore = Object.values(roundScores).reduce((sum, score) => sum + score, 0);
          const averageScore = competingPlayerIds.length > 0 ? totalRoundScore / competingPlayerIds.length : 0;
          gohPlayer.score += Math.round(averageScore) + 3;
        }
      }

      const results = [...session.players].sort((a, b) => b.score - a.score);
      io.to(gameCode).emit('show-results-game2', results);
    }
  });

  // --- Game 3: Wrong Answers Only ---
  socket.on('start-game-3', (gameCode) => {
    const session = sessions[gameCode];
    if (session && session.taskmasterId === socket.id) {
      session.gameState = 'game3_submission';
      session.game3Submissions = {};
      
      const players = session.players;
      const guests = session.guestOfHonourIds;
      const assignments = {};
      
      let totalToSubmit = players.length;
      if (guests.length === 1) {
        totalToSubmit = players.length - 1;
      } else if (guests.length === 2) {
        totalToSubmit = players.length;
      }
      session.game3TotalSubmissions = totalToSubmit;

      if (guests.length === 0) {
        const targets = shuffleArray([...players]);
        players.forEach((player, index) => {
          let targetIndex = (index + 1) % targets.length;
          assignments[player.id] = targets[targetIndex];
        });
      } else if (guests.length === 1) {
        const target = players.find(p => p.id === guests[0]);
        players.forEach(player => {
          if (player.id !== target.id) {
            assignments[player.id] = target;
          }
        });
      } else {
        const guest1Id = guests[0];
        const guest2Id = guests[1];
        const target1 = players.find(p => p.id === guest1Id);
        const target2 = players.find(p => p.id === guest2Id);
        
        assignments[guest1Id] = target2;
        assignments[guest2Id] = target1;

        const otherPlayers = players.filter(p => !guests.includes(p.id));
        const shuffledOthers = shuffleArray(otherPlayers);
        const midpoint = Math.ceil(shuffledOthers.length / 2);
        shuffledOthers.slice(0, midpoint).forEach(p => assignments[p.id] = target1);
        shuffledOthers.slice(midpoint).forEach(p => assignments[p.id] = target2);
      }
      
      session.game3Assignments = assignments;
      
      players.forEach(player => {
        const target = assignments[player.id];
        const questions = target ? GAME_3_QUESTIONS.map(q => q.replace('[NAME]', target.name)) : [];
        io.to(player.id).emit('game-3-starting', { ...GAME_3_DETAILS, questions, target });
      });
      io.to(gameCode).emit('update-submission-count', { submitted: 0, total: session.game3TotalSubmissions });
    }
  });

  socket.on('submit-wrong-answers', ({ gameCode, answers }) => {
    const session = sessions[gameCode];
    if (session && session.gameState === 'game3_submission') {
      if (!session.game3Submissions) session.game3Submissions = {};
      session.game3Submissions[socket.id] = answers;
      socket.emit('submission-received');
      const submittedCount = Object.keys(session.game3Submissions).length;
      io.to(gameCode).emit('update-submission-count', { submitted: submittedCount, total: session.game3TotalSubmissions });
    }
  });
  
  socket.on('show-wrong-answers', (gameCode) => {
    const session = sessions[gameCode];
    if (session && session.taskmasterId === socket.id) {
      session.gameState = 'game3_presentation';
      const submittedPlayerIds = Object.keys(session.game3Submissions);
      const submittedPlayers = session.players.filter(p => submittedPlayerIds.includes(p.id));
      
      session.wrongAnswerOrder = shuffleArray(submittedPlayers);
      session.currentWrongAnswerIndex = -1;
      session.game3Votes = {};
      io.to(gameCode).emit('wrong-answers-starting');
    }
  });

  socket.on('next-wrong-answer', (gameCode) => {
    const session = sessions[gameCode];
    if (session && session.taskmasterId === socket.id) {
      session.currentWrongAnswerIndex++;
      const answerIndex = session.currentWrongAnswerIndex;
      const answerOrder = session.wrongAnswerOrder;

      if (answerIndex < answerOrder.length) {
        const author = answerOrder[answerIndex];
        const target = session.game3Assignments[author.id];
        const questions = GAME_3_QUESTIONS.map(q => q.replace('[NAME]', target.name));
        const answers = session.game3Submissions[author.id];
        
        const submission = { author, target, questions, answers };
        io.to(gameCode).emit('update-wrong-answer', submission);
      } else {
        io.to(gameCode).emit('wrong-answers-finished');
      }
    }
  });

  socket.on('cast-vote-game3', ({ gameCode, emoji }) => {
    const session = sessions[gameCode];
    if (!session || !session.wrongAnswerOrder || session.currentWrongAnswerIndex < 0 || session.currentWrongAnswerIndex >= session.wrongAnswerOrder.length) return;
    
    const author = session.wrongAnswerOrder[session.currentWrongAnswerIndex];
    if (author && session.game3Votes) {
      if (!session.game3Votes[author.id]) session.game3Votes[author.id] = {};
      session.game3Votes[author.id][socket.id] = emoji;
    }
  });

  socket.on('tally-votes-game3', (gameCode) => {
    const session = sessions[gameCode];
    if (session && session.taskmasterId === socket.id) {
      const votes = session.game3Votes;
      const roundScores = {};

      for (const authorId in votes) {
        for (const voterId in votes[authorId]) {
          const emoji = votes[authorId][voterId];
          let points = GAME_3_EMOJI_POINTS[emoji] || 0;
          if (session.guestOfHonourIds.includes(voterId)) {
            points *= 2;
          }
          roundScores[authorId] = (roundScores[authorId] || 0) + points;
        }
      }

      for (const playerId in roundScores) {
        const player = session.players.find(p => p.id === playerId);
        if (player) player.score += roundScores[playerId];
      }

      if (session.guestOfHonourIds.length === 1) {
        const gohId = session.guestOfHonourIds[0];
        const gohPlayer = session.players.find(p => p.id === gohId);
        if (gohPlayer && !session.game3Submissions[gohId]) {
          const competingPlayerIds = Object.keys(roundScores);
          const totalRoundScore = Object.values(roundScores).reduce((sum, score) => sum + score, 0);
          const averageScore = competingPlayerIds.length > 0 ? totalRoundScore / competingPlayerIds.length : 0;
          gohPlayer.score += Math.round(averageScore) + 3;
        }
      }

      const results = [...session.players].sort((a, b) => b.score - a.score);
      io.to(gameCode).emit('show-results-game3', results);
    }
  });

  // --- REWRITTEN: Game 4: What's in Your Mug? ---
  socket.on('start-game-4', (gameCode) => {
    const session = sessions[gameCode];
    if (session && session.taskmasterId === socket.id) {
      session.gameState = 'game4_submission';
      session.game4MugContents = {}; // To store everyone's actual mug content
      session.mugOrder = shuffleArray([...session.players]);
      session.currentMugHolderIndex = -1;
      io.to(gameCode).emit('game-4-starting', GAME_4_DETAILS);
    }
  });

  socket.on('submit-my-mug', ({ gameCode, contents }) => {
    const session = sessions[gameCode];
    if (session) {
      session.game4MugContents[socket.id] = contents;
      socket.emit('submission-received'); // Let the client know it's submitted
      const submittedCount = Object.keys(session.game4MugContents).length;
      io.to(gameCode).emit('update-submission-count', { submitted: submittedCount, total: session.players.length });
    }
  });

  socket.on('next-mug-holder', (gameCode) => {
    const session = sessions[gameCode];
    if (session && session.taskmasterId === socket.id) {
      session.currentMugHolderIndex++;
      const mugIndex = session.currentMugHolderIndex;
      if (mugIndex < session.mugOrder.length) {
        const currentMugHolder = session.mugOrder[mugIndex];
        session.game4Guesses = {}; // Reset guesses for the new person
        session.game4Votes = {}; // Reset votes
        session.game4CorrectGuessers = []; // Reset correct guessers
        io.to(gameCode).emit('update-mug-holder', { holder: currentMugHolder, emojis: shuffleArray(GAME_4_VOTE_EMOJIS) });
      } else {
        io.to(gameCode).emit('show-final-results', { results: [...session.players].sort((a, b) => b.score - a.score) });
      }
    }
  });

  socket.on('start-pitch-timer-game4', (gameCode) => {
    const session = sessions[gameCode];
    if (session && session.taskmasterId === socket.id && !session.pitchTimerId) {
      let pitchTimer = 10;
      const intervalId = setInterval(() => {
        io.to(gameCode).emit('pitch-timer-tick', pitchTimer);
        pitchTimer--;
        if (pitchTimer < 0) {
          clearInterval(intervalId);
          delete session.pitchTimerId;
          io.to(gameCode).emit('pitch-timer-finished');
        }
      }, 1000);
      session.pitchTimerId = intervalId;
    }
  });

  socket.on('submit-mug-guess', ({ gameCode, guess }) => {
    const session = sessions[gameCode];
    if (session) {
      const author = session.players.find(p=>p.id === socket.id)
      session.game4Guesses[socket.id] = { guess, author, votes: {} };
      socket.emit('submission-received');
      const submittedCount = Object.keys(session.game4Guesses).length;
      const totalToSubmit = session.players.length - 1;
      io.to(gameCode).emit('update-submission-count', { submitted: submittedCount, total: totalToSubmit });
    }
  });

  socket.on('reveal-all-guesses', ({ gameCode }) => {
    const session = sessions[gameCode];
    if (session && session.taskmasterId === socket.id) {
      const mugHolder = session.mugOrder[session.currentMugHolderIndex];
      const actualContents = session.game4MugContents[mugHolder.id];
      io.to(gameCode).emit('show-all-guesses', { guesses: session.game4Guesses, actualContents });
    }
  });

  socket.on('mark-guess-correct', ({ gameCode, guesserId }) => {
    const session = sessions[gameCode];
    const mugHolder = session.mugOrder[session.currentMugHolderIndex];
    if (session && socket.id === mugHolder.id) {
        if (!session.game4CorrectGuessers.includes(guesserId)) {
            session.game4CorrectGuessers.push(guesserId);
        } else {
            session.game4CorrectGuessers = session.game4CorrectGuessers.filter(id => id !== guesserId);
        }
       // Let clients know who was marked correct
       io.to(gameCode).emit('update-correct-guessers', session.game4CorrectGuessers);
    }
  });
  
  socket.on('cast-vote-game4', ({ gameCode, guesserId, emoji }) => {
    const session = sessions[gameCode];
    const mugHolderId = session.mugOrder[session.currentMugHolderIndex].id;
    if (session && socket.id !== mugHolderId && session.game4Guesses[guesserId]) {
      if (emoji) {
        session.game4Guesses[guesserId].votes[socket.id] = emoji;
      } else {
        delete session.game4Guesses[guesserId].votes[socket.id];
      }
      io.to(gameCode).emit('update-all-guesses', { guesses: session.game4Guesses });
    }
  });

  socket.on('tally-votes-game4', (gameCode) => {
    const session = sessions[gameCode];
    if (session && session.taskmasterId === socket.id) {
        const mugHolder = session.mugOrder[session.currentMugHolderIndex];
        const correctGuessers = session.game4CorrectGuessers;

        // 1. Poker Face Bonus
        if (correctGuessers.length === 0) {
            const player = session.players.find(p => p.id === mugHolder.id);
            if (player) player.score += POKER_FACE_BONUS;
        }

        // 2. Correct Guesser Bonus
        correctGuessers.forEach(guesserId => {
            const player = session.players.find(p => p.id === guesserId);
            if (player) player.score += CORRECT_GUESS_BONUS;
        });

        // 3. Emoji Vote Points
        for (const guesserId in session.game4Guesses) {
            const guessData = session.game4Guesses[guesserId];
            let pointsForThisGuess = 0;
            for (const voterId in guessData.votes) {
                const emoji = guessData.votes[voterId];
                let points = GAME_4_EMOJI_POINTS[emoji] || 0;
                if (session.guestOfHonourIds.includes(voterId) && GAME_4_GOH_BONUS[emoji]) {
                    points += GAME_4_GOH_BONUS[emoji];
                }
                pointsForThisGuess += points;
            }
            const player = session.players.find(p => p.id === guesserId);
            if (player) player.score += pointsForThisGuess;
        }

        const roundResults = {
            mugHolder,
            pokerFaceBonus: POKER_FACE_BONUS,
            correctGuessers: session.players.filter(p => correctGuessers.includes(p.id)).map(p => p.name),
        };
        io.to(gameCode).emit('show-game4-round-results', roundResults);
        broadcastPlayers(gameCode);
    }
  });


// --- NEW: Handler to end a game early ---
socket.on('end-game-early', (gameCode) => {
  const session = sessions[gameCode];
  // Only the taskmaster can end the game
  if (session && session.taskmasterId === socket.id) {
    // Sort the players by their current score
    const finalResults = [...session.players].sort((a, b) => b.score - a.score);
    // Reuse the existing event to show the final leaderboard
    io.to(gameCode).emit('show-final-results', { results: finalResults });
  }
});


// --- Disconnect ---
socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`Backend server is running and listening on http://localhost:${PORT}`);
});
