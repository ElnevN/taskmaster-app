// client/src/App.jsx

import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import EmojiPicker from 'emoji-picker-react';
import './App.css';

const socket = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001');

const endSounds = ['/horn.mp3', '/endjingle.mp3', '/passionend.mp3', '/cute.mp3'];
const VOTE_EMOJIS = ['⭐', '❤️', '😂'];
const GAME_3_VOTE_EMOJIS = ['🤨', '🥹', '🤯', '🤪', '🦄'];
const CORRECT_GUESS_BONUS = 4;

function shuffleArray(array) {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

// --- Components ---

const TaskmasterHeader = ({ gameCode, onSettingsClick }) => {
  if (!gameCode) return null;
  return (
    <div className="taskmaster-header">
      <span>Game Code: <strong>{gameCode}</strong></span>
      <button className="settings-icon" onClick={onSettingsClick} title="Game Settings">⚙️</button>
    </div>
  );
};

const TransferTaskmasterModal = ({ show, onClose, players, onTransfer }) => {
  if (!show) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>Transfer Taskmaster Role</h2>
        <p>Select a player to make them the new taskmaster.</p>
        <ul className="player-list">
          {players.map(player => (
            <li key={player.id} onClick={() => onTransfer(player.id)}>
              {player.name}
            </li>
          ))}
        </ul>
        <button className="button button-secondary" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
};

const AttributionModal = ({onClose}) => (
  <div className="modal-overlay" onClick={onClose}>
    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
      <h2>Sound effect attributions</h2>
      <div className="attribution-item">
        <p>"Cartoon (Sting)" by Twin Musicom is licensed under a Creative Commons Attribution 4.0 license.</p>
        <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">https://creativecommons.org/licenses/by/4.0/</a>
        <p>Artist: <a href="http://www.twinmusicom.org/" target="_blank" rel="noopener noreferrer">http://www.twinmusicom.org/</a></p>
      </div>
      <div className="attribution-item">
        <p>"Puppy Love (Sting)" by Twin Musicom is licensed under a Creative Commons Attribution 4.0 license.</p>
        <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">https://creativecommons.org/licenses/by/4.0/</a>
        <p>Artist: <a href="http://www.twinmusicom.org/" target="_blank" rel="noopener noreferrer">http://www.twinmusicom.org/</a></p>
      </div>
      <button className="button button-secondary" onClick={onClose}>Close</button>
    </div>
  </div>
);

// --- Main App Component ---

function App() {
  // State variables
  const [view, setView] = useState('welcome');
  const [gameCode, setGameCode] = useState('');
  const [players, setPlayers] = useState([]);
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [taskmasterId, setTaskmasterId] = useState(null);
  const [guestOfHonourIds, setGuestOfHonourIds] = useState([]);
  const [gameData, setGameData] = useState({});
  const [timer, setTimer] = useState(null);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [currentPitcher, setCurrentPitcher] = useState(null);
  const [pitchTimer, setPitchTimer] = useState(null);
  const [isPitchTimerRunning, setIsPitchTimerRunning] = useState(false);
  const [pitchingComplete, setPitchingComplete] = useState(false);
  const [results, setResults] = useState([]);
  const [emojiSubmission, setEmojiSubmission] = useState('');
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [currentSubmission, setCurrentSubmission] = useState(null);
  const [submissionComplete, setSubmissionComplete] = useState(false);
  const [wrongAnswers, setWrongAnswers] = useState(['', '', '']);
  const [game3Target, setGame3Target] = useState(null);
  const [showAttribution, setShowAttribution] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [submissionCount, setSubmissionCount] = useState({ submitted: 0, total: 0 });
  const [currentWrongAnswer, setCurrentWrongAnswer] = useState(null);
  const [wrongAnswersComplete, setWrongAnswersComplete] = useState(false);
  const [game3VoteEmojis, setGame3VoteEmojis] = useState([]);
  const [game2Target, setGame2Target] = useState(null);

  // --- Game 4 & Celebration State ---
  const [myVote, setMyVote] = useState({});
  const [currentMugHolder, setCurrentMugHolder] = useState(null);
  const [mugGuess, setMugGuess] = useState('');
  const [myMugContents, setMyMugContents] = useState('');
  const [game4State, setGame4State] = useState('intro');
  const [allGuesses, setAllGuesses] = useState({});
  const [game4VoteEmojis, setGame4VoteEmojis] = useState([]);
  const [correctGuessers, setCorrectGuessers] = useState([]);
  const [game4ActualContents, setGame4ActualContents] = useState('');
  const [celebrationType, setCelebrationType] = useState('farewell');


  // Audio refs
  const tickingAudioRef = useRef(new Audio('/ticking.mp3'));
  const endSoundsRef = useRef(endSounds.map(src => new Audio(src)));

  // --- Helper Functions ---
  const playRandomEndSound = () => {
    endSoundsRef.current.forEach(audio => { audio.pause(); audio.currentTime = 0; });
    const randomIndex = Math.floor(Math.random() * endSoundsRef.current.length);
    const randomSound = endSoundsRef.current[randomIndex];
    randomSound.currentTime = 0;
    randomSound.play().catch(e => console.error("Error playing sound:", e));
    setTimeout(() => { randomSound.pause(); }, 4000);
  };

  // --- Effects ---
  useEffect(() => {
    const tickingAudio = tickingAudioRef.current;
    tickingAudio.loop = true;
    if (isTimerRunning || isPitchTimerRunning) {
      tickingAudio.play().catch(e => console.error("Error playing ticking sound:", e));
    } else {
      tickingAudio.pause();
      tickingAudio.currentTime = 0;
    }
    return () => {
      tickingAudio.pause();
      tickingAudio.currentTime = 0;
    }
  }, [isTimerRunning, isPitchTimerRunning]);
  
  useEffect(() => {
    if (view.startsWith('game4')) {
      document.body.style.backgroundColor = 'var(--midnight-green)';
    } else if (view.startsWith('game3')) {
      document.body.style.backgroundColor = 'var(--blue-ncs)';
    } else if (view.startsWith('game2')) {
      document.body.style.backgroundColor = 'var(--sunglow-yellow)';
    } else {
      document.body.style.backgroundColor = 'var(--caribbean-green)';
    }
  }, [view]);

  useEffect(() => {
    // --- Socket Event Listeners ---
    socket.on('update-players', (data) => { 
      setPlayers(data.players); 
      setTaskmasterId(data.taskmasterId); 
      setGuestOfHonourIds(data.guestOfHonourIds || []);
      setCelebrationType(data.celebrationType);
    });
    socket.on('game-created', (data) => { setGameCode(data.gameCode); setView('lobby'); });
    socket.on('join-successful', (data) => { 
      setGameCode(data.gameCode); 
      setCelebrationType(data.celebrationType);
      setView('lobby'); 
    });
    socket.on('join-error', (message) => { alert(message); });
    socket.on('submission-received', () => { setHasSubmitted(true); });

    // Game 1
    socket.on('game-starting', (data) => { setGameData(data); setView('game1'); setPitchingComplete(false); setResults([]); setCurrentPitcher(null); });
    socket.on('timer-tick', (currentTime) => { setIsTimerRunning(true); setTimer(currentTime); });
    socket.on('timer-finished', () => { setIsTimerRunning(false); setTimer(0); setView('game1_pitching'); playRandomEndSound(); });
    socket.on('update-pitcher', (pitcher) => { setCurrentPitcher(pitcher); setIsPitchTimerRunning(false); setMyVote({}); });
    socket.on('pitching-finished', () => { setPitchingComplete(true); setCurrentPitcher(null); });
    socket.on('pitch-timer-tick', (currentTime) => { setIsPitchTimerRunning(true); setPitchTimer(currentTime); });
    socket.on('pitch-timer-finished', () => {
      setIsPitchTimerRunning(false); 
      setPitchTimer(0); 
      playRandomEndSound(); 
      if (view === 'game4') {
        setGame4State('guessing');
      }
    });
    socket.on('show-results', (resultsData) => { setResults(resultsData); setView('game1_results'); });
    
    // Game 2
    socket.on('game-2-starting', (data) => {
      setGameData(data); setGame2Target(data.target); setHasSubmitted(false);
      setEmojiSubmission(''); setCurrentSubmission(null); setSubmissionComplete(false);
      setSubmissionCount({ submitted: 0, total: 0 });
      setView('game2_submission');
    });
    socket.on('presentation-starting', () => { setView('game2_presentation'); });
    socket.on('update-submission', (submission) => { setCurrentSubmission(submission); setMyVote({}); });
    socket.on('submission-finished', () => { setSubmissionComplete(true); setCurrentSubmission(null); });
    socket.on('show-results-game2', (resultsData) => { setResults(resultsData); setView('game2_results'); });
    
    // Game 3
    socket.on('game-3-starting', (data) => {
      setGameData(data); setGame3Target(data.target); setWrongAnswers(['', '', '']);
      setHasSubmitted(false); setSubmissionCount({ submitted: 0, total: 0 });
      setCurrentWrongAnswer(null); setWrongAnswersComplete(false);
      setGame3VoteEmojis(shuffleArray(GAME_3_VOTE_EMOJIS));
      setView('game3_submission');
    });
    socket.on('wrong-answers-starting', () => { setView('game3_presentation'); });
    socket.on('update-wrong-answer', (submission) => { setCurrentWrongAnswer(submission); setMyVote({}); });
    socket.on('wrong-answers-finished', () => { setWrongAnswersComplete(true); setCurrentWrongAnswer(null); });
    socket.on('show-results-game3', (resultsData) => { setResults(resultsData); setView('game3_results'); });

    // --- Game 4 Listeners ---
    socket.on('game-4-starting', (data) => {
      setGameData(data);
      setView('game4');
      setGame4State('submission');
      setMyMugContents('');
      setHasSubmitted(false);
      setSubmissionCount({ submitted: 0, total: 0 });
    });
    socket.on('update-mug-holder', ({ holder, emojis }) => {
      setCurrentMugHolder(holder);
      setGame4VoteEmojis(emojis);
      setView('game4');
      setGame4State('pitching');
      setHasSubmitted(false);
      setAllGuesses({});
      setCorrectGuessers([]);
      setMyVote({});
      const isHolder = holder.id === socket.id;
      setSubmissionCount({ submitted: 0, total: isHolder ? 0 : players.length - 1 });
    });
    socket.on('show-all-guesses', ({ guesses, actualContents }) => {
      setAllGuesses(guesses);
      setGame4ActualContents(actualContents);
      setGame4State('voting');
    });
    socket.on('update-all-guesses', ({ guesses }) => {
      setAllGuesses(guesses);
    });
    socket.on('update-correct-guessers', (guesserIds) => {
      setCorrectGuessers(guesserIds);
    });
    socket.on('show-game4-round-results', (resultsData) => {
      setResults(resultsData);
      setGame4State('results');
    });
    socket.on('show-final-results', ({ results }) => {
      setResults(results);
      setView('final_results');
    });

    socket.on('update-submission-count', (count) => { setSubmissionCount(count); });

    return () => {
      socket.off('update-players'); socket.off('game-created'); socket.off('join-successful'); socket.off('game-starting'); socket.off('join-error'); socket.off('timer-tick'); socket.off('timer-finished'); socket.off('update-pitcher'); socket.off('pitching-finished'); socket.off('pitch-timer-tick'); socket.off('pitch-timer-finished'); socket.off('show-results'); socket.off('game-2-starting'); socket.off('submission-received'); socket.off('presentation-starting'); socket.off('update-submission'); socket.off('submission-finished'); socket.off('show-results-game2'); socket.off('game-3-starting');
      socket.off('update-submission-count'); socket.off('wrong-answers-starting'); socket.off('update-wrong-answer'); socket.off('wrong-answers-finished'); socket.off('show-results-game3');
      socket.off('game-4-starting'); socket.off('update-mug-holder'); socket.off('show-all-guesses'); socket.off('update-all-guesses'); socket.off('update-correct-guessers'); socket.off('show-game4-round-results'); socket.off('show-final-results');
    };
  }, [view, players.length]);

  // --- Event Handlers ---
  const handleCreateGame = () => { if (!name) { alert('Please enter your name'); return; } socket.emit('create-game', name); };
  const handleJoinGame = () => { if (!name || !joinCode) { alert('Please enter your name and a game code'); return; } socket.emit('join-game', { gameCode: joinCode.toUpperCase(), playerName: name }); };
  const handleNominate = (playerId) => { socket.emit('nominate-goh', { gameCode, playerId }); };
  const handleTransferTaskmaster = (newMasterId) => { socket.emit('transfer-taskmaster', { gameCode, newMasterId }); setShowSettingsModal(false); };
  const handleSetCelebrationType = (e) => { socket.emit('set-celebration-type', { gameCode, type: e.target.value }); };
  
  // Game 1
  const handleStartGame = () => { socket.emit('start-game', gameCode); };
  const handleStartTimer = () => { socket.emit('start-timer', gameCode); };
  const handleNextPitcher = () => { socket.emit('next-pitcher', gameCode); };
  const handleStartPitchTimer = () => { socket.emit('start-pitch-timer', gameCode); };
  const handleVote = (emoji) => { setMyVote({0: emoji}); socket.emit('cast-vote', { gameCode, emoji }); };
  const handleTallyVotes = () => { socket.emit('tally-votes', gameCode); };

  // Game 2
  const handleStartGame2 = () => { socket.emit('start-game-2', gameCode); };
  const handleSubmitEmoji = () => { if (!emojiSubmission) { alert('Please enter some emojis!'); return; } socket.emit('submit-emoji', { gameCode, submission: emojiSubmission }); };
  const onEmojiClick = (emojiObject) => { setEmojiSubmission((prev) => prev + emojiObject.emoji); };
  const handleShowSubmissions = () => { socket.emit('show-submissions', gameCode); };
  const handleNextSubmission = () => { socket.emit('next-submission', gameCode); };
  const handleVoteGame2 = (emoji) => { setMyVote({0: emoji}); socket.emit('cast-vote-game2', { gameCode, emoji }); };
  const handleTallyVotesGame2 = () => { socket.emit('tally-votes-game2', gameCode); };

  // Game 3
  const handleStartGame3 = () => { socket.emit('start-game-3', gameCode); };
  const handleWrongAnswerChange = (index, value) => { const newAnswers = [...wrongAnswers]; newAnswers[index] = value; setWrongAnswers(newAnswers); };
  const handleSubmitWrongAnswers = () => { if (wrongAnswers.some(a => !a.trim())) { alert('Please fill in all three answers!'); return; } socket.emit('submit-wrong-answers', { gameCode, answers: wrongAnswers }); };
  const handleShowWrongAnswers = () => { socket.emit('show-wrong-answers', gameCode); };
  const handleNextWrongAnswer = () => { socket.emit('next-wrong-answer', gameCode); };
  const handleVoteGame3 = (emoji) => { setMyVote({0: emoji}); socket.emit('cast-vote-game3', { gameCode, emoji }); };
  const handleTallyVotesGame3 = () => { socket.emit('tally-votes-game3', gameCode); };

  // --- Game 4 Handlers ---
  const handleStartGame4 = () => { socket.emit('start-game-4', gameCode); };
  const handleNextMugHolder = () => { socket.emit('next-mug-holder', gameCode); };
  const handleSubmitMyMug = () => { if (!myMugContents.trim()) { alert('Please enter what is in your mug!'); return; } socket.emit('submit-my-mug', { gameCode, contents: myMugContents }); };
  const handleStartPitchTimerGame4 = () => { socket.emit('start-pitch-timer-game4', gameCode); };
  const handleSubmitMugGuess = () => { if (!mugGuess.trim()) { alert('Please enter a guess!'); return; } setMugGuess(''); socket.emit('submit-mug-guess', { gameCode, guess: mugGuess }); };
  const handleRevealAllGuesses = () => { socket.emit('reveal-all-guesses', { gameCode }); };
  const handleMarkCorrect = (guesserId) => { socket.emit('mark-guess-correct', { gameCode, guesserId }); };
  const handleVoteGame4 = (guesserId, emoji) => {
    setMyVote(prevVotes => {
      const newVotes = {...prevVotes};
      if (newVotes[guesserId] === emoji) {
        delete newVotes[guesserId];
      } else {
        newVotes[guesserId] = emoji;
      }
      socket.emit('cast-vote-game4', { gameCode, guesserId, emoji: newVotes[guesserId] || null });
      return newVotes;
    });
  };
  const handleTallyVotesGame4 = () => { socket.emit('tally-votes-game4', gameCode); };


  const isTaskmaster = socket.id === taskmasterId;

  // --- Render Logic ---
  const renderView = () => {
    switch (view) {
      case 'welcome':
        return (
          <div className="action-box">
            <h1 className="app-title">Your ridiculously fun virtual celebration</h1>
            <p className="subtitle">How would you like to start?</p>
            <button className="button button-primary" onClick={() => setView('create')}>Create a celebration</button>
            <button className="button button-secondary" onClick={() => setView('join')}>Join with a code</button>
          </div>
        );
      case 'create':
        return (
          <div className="action-box">
            <h1 className="app-title">Create a celebration</h1>
            <input type="text" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} className="input-field" />
            <button className="button button-primary" onClick={handleCreateGame}>Let's go!</button>
            <button className="button-link" onClick={() => setView('welcome')}>Back</button>
          </div>
        );
      case 'join':
        return (
          <div className="action-box">
            <h1 className="app-title">Join a celebration</h1>
            <input type="text" placeholder="Enter your name" value={name} onChange={(e) => setName(e.target.value)} className="input-field" />
            <input type="text" placeholder="Enter game code" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} className="input-field" maxLength="5" />
            <button className="button button-secondary" onClick={handleJoinGame}>Join game</button>
            <button className="button-link" onClick={() => setView('welcome')}>Back</button>
          </div>
        );
      case 'lobby':
        return (
          <div className="action-box">
            <h1 className="app-title">Lobby is ready!</h1>
            <p>Share this game code:</p>
            <div className="game-code-box"><h2>{gameCode}</h2></div>
            {isTaskmaster && (
              <div className="taskmaster-controls">
                <label htmlFor="celebration-type">Type of Celebration:</label>
                <select id="celebration-type" className="celebration-type-selector" value={celebrationType} onChange={handleSetCelebrationType}>
                  <option value="farewell">Farewell</option>
                  <option value="birthday">Birthday</option>
                  <option value="team-fun">Team Fun</option>
                </select>
                <p className="taskmaster-prompt">You can nominate up to two guests of honour by clicking the crown icon. This is optional.</p>
              </div>
            )}
            <h3>Participants ({players.length}):</h3>
            <ul className="player-list">
              {players.map((player) => {
                const isGoH = guestOfHonourIds.includes(player.id);
                const canNominate = isTaskmaster && player.id !== taskmasterId;
                const nominationDisabled = guestOfHonourIds.length >= 2 && !isGoH;
                return (
                  <li key={player.id}>
                    {player.id === taskmasterId && <span className="player-icon">♛</span>}
                    {isGoH && <span className="player-icon">👑</span>}
                    {player.name}
                    {canNominate && (
                      <button className={`nominate-button ${isGoH ? 'nominated' : ''}`} onClick={() => handleNominate(player.id)} disabled={nominationDisabled} title={isGoH ? 'De-select as Guest of Honour' : 'Nominate as Guest of Honour'}>👑</button>
                    )}
                  </li>
                );
              })}
            </ul>
            {isTaskmaster ? <button className="button button-primary" onClick={handleStartGame}>Start game for everyone</button> : <p>Waiting for the taskmaster to start the game...</p>}
          </div>
        );
      case 'game1':
        return (
          <div className="action-box">
            <h1 className="app-title">{gameData.title}</h1>
            <p className="instructions">{gameData.instructions}</p>
            {isTimerRunning ? <div className="timer-display">{timer}</div> : (isTaskmaster ? <button className="button button-primary" onClick={handleStartTimer}>Start 30s timer</button> : <div className="button-placeholder">Waiting for taskmaster to start timer...</div>)}
          </div>
        );
      case 'game1_pitching':
        return (
          <div className="action-box">
            {!currentPitcher && !pitchingComplete && (<>
              <h1 className="app-title">Time's up!</h1>
              <p className="instructions">Get ready to present your impressive objects!</p>
              {isTaskmaster && <button className="button button-primary" onClick={handleNextPitcher}>Begin pitching round</button>}
            </>)}
            {currentPitcher && (<>
              <h1 className="app-title">Up next: {currentPitcher.name}</h1>
              {isPitchTimerRunning ? (<>
                <div className="timer-display">{pitchTimer}</div>
                <div className="live-voting">{VOTE_EMOJIS.map(emoji => (<button key={emoji} className={`emoji-button ${myVote[0] === emoji ? 'selected' : ''}`} onClick={() => handleVote(emoji)} disabled={currentPitcher.id === socket.id}>{emoji}</button>))}</div>
              </>) : (isTaskmaster ? <button className="button button-primary" onClick={handleStartPitchTimer}>Start 20s Pitch</button> : <div className="button-placeholder">Waiting for taskmaster...</div>)}
              {isTaskmaster && !isPitchTimerRunning && <button className="button button-secondary" onClick={handleNextPitcher}>Next pitcher</button>}
            </>)}
            {pitchingComplete && (<>
              <h1 className="app-title">Great pitches, everyone!</h1>
              {isTaskmaster && <button className="button button-primary" onClick={handleTallyVotes}>Tally votes & see results</button>}
            </>)}
          </div>
        );
      case 'game1_results':
        return (
          <div className="action-box">
            <h1 className="app-title">Round 1 results!</h1>
            <ul className="results-list">{results.map((player, index) => (<li key={player.id}><span className="rank">{index + 1}</span><span className="player-name">{player.name}</span><span className="score">{player.score} pts</span></li>))}</ul>
            {isTaskmaster && <button className="button button-primary" onClick={handleStartGame2}>Start Game 2</button>}
          </div>
        );
      case 'game2_submission':
        if (!game2Target) {
          return (
            <div className="action-box">
              <h1 className="app-title">Take a breather, Guest of Honour!</h1>
              <p className="instructions">Everyone else is currently creating an emoji masterpiece in your honour. Sit back and relax!</p>
            </div>
          );
        }
        return (
          <div className="action-box">
            <h1 className="app-title">{gameData.title}</h1>
            <p className="instructions">{gameData.instructions.replace('the person below', `...${game2Target.name}!`)}</p>
            <div className="emoji-submission-area">
              <div className="emoji-display">{emojiSubmission || "Your emojis will appear here"}</div>
              <button className="button-link" onClick={() => setEmojiSubmission('')} disabled={hasSubmitted}>Clear</button>
            </div>
            <div className="emoji-picker-container">{!hasSubmitted && <EmojiPicker onEmojiClick={onEmojiClick} height={300} width="100%" />}</div>
            {hasSubmitted ? <div className="submission-confirmation">Submitted! Waiting for others...</div> : <button className="button button-primary" onClick={handleSubmitEmoji}>Submit masterpiece</button>}
            {isTaskmaster && (
              <button className="button button-secondary" onClick={handleShowSubmissions}>
                Everyone is in! ({submissionCount.submitted}/{submissionCount.total})
              </button>
            )}
          </div>
        );
      case 'game2_presentation':
        return (
          <div className="action-box">
            {!currentSubmission && !submissionComplete && (<>
              <h1 className="app-title">Let's see the masterpieces!</h1>
              {isTaskmaster && <button className="button button-primary" onClick={handleNextSubmission}>Show first submission</button>}
            </>)}
            {currentSubmission && (<>
              <h1 className="app-title">{currentSubmission.author.name}'s creation:</h1>
              <div className="emoji-submission-display">{currentSubmission.emojis}</div>
              <div className="live-voting">{VOTE_EMOJIS.map(emoji => (<button key={emoji} className={`emoji-button ${myVote[0] === emoji ? 'selected' : ''}`} onClick={() => handleVoteGame2(emoji)} disabled={currentSubmission.author.id === socket.id}>{emoji}</button>))}</div>
              {isTaskmaster && <button className="button button-secondary" onClick={handleNextSubmission}>Next submission</button>}
            </>)}
            {submissionComplete && (<>
              <h1 className="app-title">That's everyone!</h1>
              {isTaskmaster && <button className="button button-primary" onClick={handleTallyVotesGame2}>Tally votes & see results</button>}
            </>)}
          </div>
        );
      case 'game2_results':
        return (
          <div className="action-box">
            <h1 className="app-title">Round 2 results!</h1>
            <p>Scores are cumulative.</p>
            <ul className="results-list">{results.map((player, index) => (<li key={player.id}><span className="rank">{index + 1}</span><span className="player-name">{player.name}</span><span className="score">{player.score} pts</span></li>))}</ul>
            {isTaskmaster && <button className="button button-primary" onClick={handleStartGame3}>Start Game 3</button>}
          </div>
        );
      case 'game3_submission':
        if (!game3Target) {
          return (
            <div className="action-box">
              <h1 className="app-title">Take a breather, Guest of Honour!</h1>
              <p className="instructions">Everyone else is currently writing hilarious and wildly inaccurate things about you. Sit back and relax!</p>
            </div>
          );
        }
        return (
          <div className="action-box">
            <h1 className="app-title">{gameData.title}</h1>
            <p className="instructions">{gameData.instructions.replace('the person below', `...${game3Target.name}!`)}</p>
            <div className="wrong-answers-form">
              {gameData.questions && gameData.questions.map((q, index) => (
                <div key={index} className="question-group">
                  <label>{q}</label>
                  <input type="text" className="input-field" value={wrongAnswers[index]} onChange={(e) => handleWrongAnswerChange(index, e.target.value)} disabled={hasSubmitted} />
                </div>
              ))}
            </div>
            {hasSubmitted ? (
              <div className="submission-confirmation">Answers submitted! Waiting for others...</div>
            ) : (
              <button className="button button-primary" onClick={handleSubmitWrongAnswers}>Submit answers</button>
            )}
            {isTaskmaster && (
              <button className="button button-secondary" onClick={handleShowWrongAnswers}>
                Everyone is in! ({submissionCount.submitted}/{submissionCount.total})
              </button>
            )}
          </div>
        );
      case 'game3_presentation':
        return (
          <div className="action-box">
            {!currentWrongAnswer && !wrongAnswersComplete && (
              <>
                <h1 className="app-title">Let's hear the wrong answers!</h1>
                {isTaskmaster && <button className="button button-primary" onClick={handleNextWrongAnswer}>Reveal first answers</button>}
              </>
            )}
            {currentWrongAnswer && (
              <>
                <h1 className="app-title">{currentWrongAnswer.author.name}'s answers about {currentWrongAnswer.target.name}:</h1>
                <div className="wrong-answers-display">
                  {currentWrongAnswer.questions.map((q, i) => (
                    <div key={i} className="qa-pair">
                      <p className="question">{q}</p>
                      <p className="answer">{currentWrongAnswer.answers[i]}</p>
                    </div>
                  ))}
                </div>
                <div className="live-voting">
                  {game3VoteEmojis.map(emoji => (
                    <button key={emoji} className={`emoji-button ${myVote[0] === emoji ? 'selected' : ''}`} onClick={() => handleVoteGame3(emoji)} disabled={currentWrongAnswer.author.id === socket.id}>{emoji}</button>
                  ))}
                </div>
                {isTaskmaster && <button className="button button-secondary" onClick={handleNextWrongAnswer}>Next answers</button>}
              </>
            )}
            {wrongAnswersComplete && (
              <>
                <h1 className="app-title">That's everyone!</h1>
                {isTaskmaster && <button className="button button-primary" onClick={handleTallyVotesGame3}>Tally votes & see results</button>}
              </>
            )}
          </div>
        );
      case 'game3_results':
        return (
          <div className="action-box">
            <h1 className="app-title">Round 3 results!</h1>
            <p>Scores are cumulative.</p>
            <ul className="results-list">{results.map((player, index) => (<li key={player.id}><span className="rank">{index + 1}</span><span className="player-name">{player.name}</span><span className="score">{player.score} pts</span></li>))}</ul>
            {isTaskmaster && <button className="button button-primary" onClick={handleStartGame4}>Start Game 4</button>}
          </div>
        );
      case 'game4':
        const isMugHolder = currentMugHolder && currentMugHolder.id === socket.id;
        
        if (game4State === 'submission') {
          return (
            <div className="action-box">
              <h1 className="app-title">{gameData.title}</h1>
              <p className="instructions">
                First, everyone secretly submit what's <strong>actually</strong> in your mug.
                <br/><br/>
                Then, one by one, a person will be chosen. They will have 10 seconds to pitch what's in their mug (you can bluff!). Everyone else will guess what's inside. Let's see who can fool the room!
              </p>
              {hasSubmitted ? (
                 <div className="submission-confirmation">Submitted! Waiting for others... ({submissionCount.submitted}/{players.length})</div>
              ) : (
                <>
                  <input type="text" placeholder="What's actually in your mug?" value={myMugContents} onChange={(e) => setMyMugContents(e.target.value)} className="input-field" />
                  <button className="button button-primary" onClick={handleSubmitMyMug}>Submit Secretly</button>
                </>
              )}
               {isTaskmaster && 
                <button className="button button-secondary" onClick={handleNextMugHolder}>
                  Start Round 1 ({submissionCount.submitted}/{players.length} submitted)
                </button>
              }
            </div>
          );
        }

        if (game4State === 'pitching') {
            return (
                <div className="action-box">
                    <h1 className="app-title">Up next: {currentMugHolder?.name}'s Mug!</h1>
                    {isMugHolder ? <p className="instructions">It's your turn! Hold up your mug and get ready to pitch your truth (or lies!).</p> : <p>Get ready to listen to their pitch and make a guess!</p>}
                    {isPitchTimerRunning ? (
                        <div className="timer-display">{pitchTimer}</div>
                    ) : (
                        isTaskmaster && <button className="button button-primary" onClick={handleStartPitchTimerGame4}>Start 10s Pitch</button>
                    )}
                    {!isTaskmaster && !isPitchTimerRunning && <div className="button-placeholder">Waiting for taskmaster...</div>}
                </div>
            )
        }
        
        if (game4State === 'guessing') {
            return (
                <div className="action-box">
                    <h1 className="app-title">What is in {currentMugHolder?.name}'s Mug?</h1>
                     {isMugHolder ? (
                        <div className="submission-confirmation">Everyone is now guessing what's in your mug. Maintain that poker face!</div>
                     ) : (
                        hasSubmitted ? (
                             <div className="submission-confirmation">Guess submitted! Waiting for others... ({submissionCount.submitted}/{submissionCount.total})</div>
                        ) : (
                            <>
                                <input type="text" placeholder="Your guess..." value={mugGuess} onChange={(e) => setMugGuess(e.target.value)} className="input-field" />
                                <button className="button button-primary" onClick={handleSubmitMugGuess}>Submit guess</button>
                            </>
                        )
                     )}
                     {isTaskmaster &&
                      <button className="button button-secondary" onClick={handleRevealAllGuesses}>
                        Reveal Guesses ({submissionCount.submitted}/{submissionCount.total} guessed)
                      </button>
                    }
                </div>
            )
        }

        if (game4State === 'voting') {
            return (
                <div className="action-box wide">
                    <h1 className="app-title">It was... {game4ActualContents}!</h1>
                    <p className="instructions">Now, vote for your favourite guess. {isMugHolder && <strong>You can click the '👑' on the correct guess(es).</strong>}</p>
                    <div className="table-container">
                      <table className="voting-table">
                        <thead>
                          <tr>
                            <th>Anonymous Guess</th>
                            <th>Votes Received</th>
                            <th>Your Vote</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(allGuesses).map(([guesserId, guessData]) => (
                            <tr key={guesserId} className={correctGuessers.includes(guesserId) ? 'correct' : ''}>
                              <td className="guess-text-cell">{guessData.guess}</td>
                              <td className="votes-received-cell">{Object.values(guessData.votes).join(' ')}</td>
                              <td className="vote-cell">
                                {!isMugHolder && game4VoteEmojis.map(emoji => (
                                  <button
                                    key={emoji}
                                    onClick={() => handleVoteGame4(guesserId, emoji)}
                                    className={`emoji-button small ${myVote[guesserId] === emoji ? 'selected' : ''}`}
                                  >
                                    {emoji}
                                  </button>
                                ))}
                                {isMugHolder && (
                                  <button className="nominate-button correct-button" onClick={() => handleMarkCorrect(guesserId)}>
                                    👑
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {isTaskmaster && <button className="button button-primary" onClick={handleTallyVotesGame4}>Tally Votes & See Scores</button>}
                </div>
            )
        }

        if (game4State === 'results') {
            return (
                <div className="action-box">
                     <h1 className="app-title">Round Results</h1>
                     {results.correctGuessers.length === 0 && <p><strong>{results.mugHolder.name}</strong> gets {results.pokerFaceBonus} points for a great poker face!</p>}
                     {results.correctGuessers.length > 0 && <p><strong>{results.correctGuessers.join(', ')}</strong> get {CORRECT_GUESS_BONUS} points each for guessing correctly!</p>}
                     <p>Points from votes have also been awarded.</p>
                     {isTaskmaster && <button className="button button-primary" onClick={handleNextMugHolder}>Next Mug</button>}
                </div>
            )
        }
        
        return <div>Loading Game 4...</div>;
      
      case 'final_results':
        let finalButtonText = "End Game";
        if (celebrationType === 'farewell') {
          finalButtonText = "Go to Farewell";
        } else if (celebrationType === 'birthday') {
          finalButtonText = "Go to Birthday Toast";
        }
        return (
            <div className="action-box">
            <h1 className="app-title">Final Scores!</h1>
            <ul className="results-list">{results.map((player, index) => (<li key={player.id}><span className="rank">{index + 1}</span><span className="player-name">{player.name}</span><span className="score">{player.score} pts</span></li>))}</ul>
            {isTaskmaster && <button className="button button-primary" onClick={() => setView('farewell')}>{finalButtonText}</button>}
          </div>
        )
      case 'farewell':
        let farewellTitle = "Raise your mugs! ☕🥂";
        let farewellMessage = "Thanks for playing — you’ve all been brilliantly useless!";
        let farewellSubMessage = "What a great game!";

        if (celebrationType === 'farewell') {
          const gohNames = players.filter(p => guestOfHonourIds.includes(p.id)).map(p => p.name).join(' & ');
          farewellTitle = `Goodbye and good luck, ${gohNames || 'friend'}!`;
          farewellMessage = `${gohNames ? 'You' : 'They'} will be missed.`;
          farewellSubMessage = "From your slightly unhinged, emoji-literate, mug-holding colleagues.";
        } else if (celebrationType === 'birthday') {
          const gohNames = players.filter(p => guestOfHonourIds.includes(p.id)).map(p => p.name).join(' & ');
          farewellTitle = `Happy Birthday, ${gohNames || 'you'}! 🎂🎉`;
          farewellMessage = "Hope you have a fantastic day and a great year ahead!";
          farewellSubMessage = "Thanks for celebrating with us!";
        }

         return (
            <div className="action-box">
                <h1 className="app-title">{farewellTitle}</h1>
                <p className="instructions">{farewellMessage}</p>
                <p>{farewellSubMessage}</p>
            </div>
         )
      default:
        return <div>Loading...</div>;
    }
  };

  return (
    <div className="App">
      {isTaskmaster && <TaskmasterHeader gameCode={gameCode} onSettingsClick={() => setShowSettingsModal(true)} />}
      <TransferTaskmasterModal 
        show={showSettingsModal} 
        onClose={() => setShowSettingsModal(false)}
        players={players.filter(p => p.id !== socket.id)}
        onTransfer={handleTransferTaskmaster}
      />
      {showAttribution && <AttributionModal onClose={() => setShowAttribution(false)} />}
      
      {renderView()}

      {view === 'welcome' && <button className="button-link attribution-link" onClick={() => setShowAttribution(true)}>Sound Attributions</button>}
    </div>
  );
}

export default App;
