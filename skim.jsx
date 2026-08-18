import { useState, useEffect, useMemo, useRef } from "react";
import { Sparkles, RotateCcw, Layers, Trophy, ScissorsLineDashed } from "lucide-react";

/* ---------- constants ---------- */
const RANKS = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
const SUITS = ["S","H","D","C"];
const SUIT_CHAR = { S: "♠", H: "♥", D: "♦", C: "♣" };
const RANK_VALUE = { J: 11, Q: 12, K: 13, A: 14 };
const rv = (r) => RANK_VALUE[r] || parseInt(r, 10);

const HAND_NAMES = [
  "High Card","One Pair","Two Pair","Three of a Kind","Straight",
  "Flush","Full House","Four of a Kind","Straight Flush","Five of a Kind"
];

function buildDeck() {
  let id = 0, deck = [];
  for (const r of RANKS) for (const s of SUITS) {
    // 2♥ and 2♣ are swapped out for the two Jokers
    if (r === "2" && (s === "H" || s === "C")) continue;
    deck.push({ id: id++, rank: r, suit: s, isJoker: false });
  }
  deck.push({ id: id++, isJoker: true, jokerType: "Big" });
  deck.push({ id: id++, isJoker: true, jokerType: "Little" });
  return deck;
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------- hand evaluation ---------- */
function evaluateConcrete(cards) {
  // cards: [{rank:number, suit:string}] length 5
  const counts = {};
  cards.forEach((c) => (counts[c.rank] = (counts[c.rank] || 0) + 1));
  const groups = Object.entries(counts)
    .map(([r, c]) => ({ rank: +r, count: c }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);
  const countPattern = groups.map((g) => g.count);
  const isFlush = cards.every((c) => c.suit === cards[0].suit);
  const uniq = [...new Set(cards.map((c) => c.rank))].sort((a, b) => b - a);
  let isStraight = false, high = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) { isStraight = true; high = uniq[0]; }
    else if (uniq[0] === 14 && uniq[1] === 5 && uniq[4] === 2) { isStraight = true; high = 5; }
  }
  const kick = (n) => groups.slice(n).map((g) => g.rank).sort((a, b) => b - a);

  if (countPattern[0] === 5) return { category: 9, tiebreak: [groups[0].rank] };
  if (isStraight && isFlush) return { category: 8, tiebreak: [high] };
  if (countPattern[0] === 4) return { category: 7, tiebreak: [groups[0].rank, groups[1].rank] };
  if (countPattern[0] === 3 && countPattern[1] === 2) return { category: 6, tiebreak: [groups[0].rank, groups[1].rank] };
  if (isFlush) return { category: 5, tiebreak: cards.map((c) => c.rank).sort((a, b) => b - a) };
  if (isStraight) return { category: 4, tiebreak: [high] };
  if (countPattern[0] === 3) return { category: 3, tiebreak: [groups[0].rank, ...kick(1)] };
  if (countPattern[0] === 2 && countPattern[1] === 2)
    return { category: 2, tiebreak: [Math.max(groups[0].rank, groups[1].rank), Math.min(groups[0].rank, groups[1].rank), groups[2].rank] };
  if (countPattern[0] === 2) return { category: 1, tiebreak: [groups[0].rank, ...kick(1)] };
  return { category: 0, tiebreak: cards.map((c) => c.rank).sort((a, b) => b - a) };
}
function compareHand(a, b) {
  if (a.category !== b.category) return a.category - b.category;
  for (let i = 0; i < Math.max(a.tiebreak.length, b.tiebreak.length); i++) {
    const av = a.tiebreak[i] || 0, bv = b.tiebreak[i] || 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}
function bestHand(column) {
  if (column.length !== 5) return null;
  const jokerIdx = column.map((c, i) => (c.isJoker ? i : -1)).filter((i) => i >= 0);
  const base = column.map((c) => (c.isJoker ? null : { rank: rv(c.rank), suit: c.suit }));
  if (jokerIdx.length === 0) return evaluateConcrete(base);
  let best = null;
  const trial = (subs) => {
    const test = base.map((c, i) => (c === null ? subs[jokerIdx.indexOf(i)] : c));
    const res = evaluateConcrete(test);
    if (!best || compareHand(res, best) > 0) best = res;
  };
  const opts = [];
  for (const r of [2,3,4,5,6,7,8,9,10,11,12,13,14]) for (const s of SUITS) opts.push({ rank: r, suit: s });
  if (jokerIdx.length === 1) { for (const o of opts) trial([o]); }
  else { for (const o1 of opts) for (const o2 of opts) trial([o1, o2]); }
  return best;
}

/* ---------- computer AI ---------- */
function computerMove(card, grid, skipUsed, dealtCount) {
  const open = grid.map((c, i) => ({ i, len: c.length })).filter((c) => c.len < 5);
  if (!skipUsed && !card.isJoker && rv(card.rank) <= 5 && dealtCount < 16 && Math.random() < 0.55) {
    return { action: "skip" };
  }
  let best = -Infinity, choice = open[0].i;
  for (const { i } of open) {
    const col = grid[i];
    let score;
    if (card.isJoker) {
      const rc = {}; col.forEach((c) => { if (!c.isJoker) rc[c.rank] = (rc[c.rank] || 0) + 1; });
      const sc = {}; col.forEach((c) => { if (!c.isJoker) sc[c.suit] = (sc[c.suit] || 0) + 1; });
      const maxR = Math.max(0, ...Object.values(rc)), maxS = Math.max(0, ...Object.values(sc));
      const jk = col.filter((c) => c.isJoker).length;
      score = maxR * 12 + maxS * 4 + jk * 6 - col.length * 0.5;
    } else {
      const rMatch = col.filter((c) => !c.isJoker && c.rank === card.rank).length;
      const sMatch = col.filter((c) => !c.isJoker && c.suit === card.suit).length;
      const jk = col.filter((c) => c.isJoker).length;
      score = rMatch * 10 + sMatch * 3 + jk * 4 - col.length * 0.8 + (col.length === 0 ? 1 : 0);
    }
    score += Math.random() * 0.5;
    if (score > best) { best = score; choice = i; }
  }
  return { action: "place", column: choice };
}

/* ---------- UI subcomponents ---------- */
function MiniCard({ card }) {
  if (!card) return <div className="mc mc-empty" />;
  if (card.isJoker) return (
    <div className="mc mc-joker">
      <Sparkles size={13} strokeWidth={2.5} />
      <span>{card.jokerType?.toUpperCase()} JOKER</span>
    </div>
  );
  const red = card.suit === "H" || card.suit === "D";
  return (
    <div className={`mc ${red ? "mc-red" : "mc-black"}`}>
      <span className="mc-rank">{card.rank}</span>
      <span className="mc-suit">{SUIT_CHAR[card.suit]}</span>
    </div>
  );
}

function BigCard({ card }) {
  if (!card) return null;
  if (card.isJoker) {
    return (
      <div className="bigcard bigcard-joker">
        <Sparkles size={30} />
        <div className="bigcard-label">{card.jokerType?.toUpperCase()} JOKER</div>
        <div className="bigcard-sub">wild</div>
      </div>
    );
  }
  const red = card.suit === "H" || card.suit === "D";
  return (
    <div className={`bigcard ${red ? "bc-red" : "bc-black"}`}>
      <div className="bigcard-corner tl">{card.rank}<br/>{SUIT_CHAR[card.suit]}</div>
      <div className="bigcard-center">{SUIT_CHAR[card.suit]}</div>
      <div className="bigcard-corner br">{card.rank}<br/>{SUIT_CHAR[card.suit]}</div>
    </div>
  );
}

function Column({ label, cards, result, isYou }) {
  const filled = cards.length === 5;
  const hand = filled ? bestHand(cards) : null;
  let cls = "column";
  if (result === "win") cls += " col-win";
  if (result === "lose") cls += " col-lose";
  return (
    <div className={cls}>
      <div className="col-head">{label}</div>
      <div className="col-body">
        {[0,1,2,3,4].map((i) => <MiniCard key={i} card={cards[i]} />)}
      </div>
      <div className="col-foot">
        {hand ? (
          <span>{HAND_NAMES[hand.category]}</span>
        ) : (
          <span className="col-foot-dim">{cards.length}/5</span>
        )}
        {result === "win" && <Trophy size={13} className="trophy" />}
      </div>
    </div>
  );
}

/* ---------- main ---------- */
export default function Skim() {
  const [deck, setDeck] = useState([]);
  const [playerGrid, setPlayerGrid] = useState([[],[],[],[],[]]);
  const [compGrid, setCompGrid] = useState([[],[],[],[],[]]);
  const [playerSkipUsed, setPlayerSkipUsed] = useState(false);
  const [compSkipUsed, setCompSkipUsed] = useState(false);
  const [turn, setTurn] = useState("player");
  const [currentCard, setCurrentCard] = useState(null);
  const [phase, setPhase] = useState("idle"); // idle | dealing | done
  const compTimer = useRef(null);
  const [lastMove, setLastMove] = useState("");

  const playerPlaced = playerGrid.reduce((s, c) => s + c.length, 0);
  const compPlaced = compGrid.reduce((s, c) => s + c.length, 0);
  const playerFull = playerPlaced === 25;
  const compFull = compPlaced === 25;

  function startGame() {
    if (compTimer.current) { clearTimeout(compTimer.current); compTimer.current = null; }
    setDeck(shuffle(buildDeck()));
    setPlayerGrid([[],[],[],[],[]]);
    setCompGrid([[],[],[],[],[]]);
    setPlayerSkipUsed(false);
    setCompSkipUsed(false);
    setTurn("player");
    setCurrentCard(null);
    setLastMove("The shoe is shuffled. You're up first.");
    setPhase("dealing");
  }

  useEffect(() => {
    if (phase !== "dealing") return;
    if (playerFull && compFull) { setPhase("done"); return; }

    if (turn === "player") {
      if (playerFull) { setTurn("computer"); return; }
      if (currentCard) return;
      if (deck.length === 0) { setTurn("computer"); return; }
      const card = deck[deck.length - 1];
      setDeck((d) => d.slice(0, -1));
      setCurrentCard(card);
    } else {
      if (compFull) { setTurn("player"); return; }
      if (deck.length === 0) { setTurn("player"); return; }
      if (compTimer.current) return;
      compTimer.current = setTimeout(() => {
        compTimer.current = null;
        setDeck((d) => {
          if (d.length === 0) { setTurn("player"); return d; }
          const card = d[d.length - 1];
          const dealt = 52 - d.length + 1;
          const move = computerMove(card, compGrid, compSkipUsed, dealt);
          if (move.action === "skip") {
            setCompSkipUsed(true);
            setLastMove("The dealer's opponent slid a card face-down into the discard.");
          } else {
            setCompGrid((g) => g.map((col, i) => (i === move.column ? [...col, card] : col)));
            setLastMove(`Computer placed a card into their Column ${move.column + 1}.`);
          }
          setTurn("player");
          return d.slice(0, -1);
        });
      }, 3000);
    }
  }, [phase, turn, currentCard, deck, playerFull, compFull, compGrid, compSkipUsed]);

  function placeCard(colIdx) {
    if (!currentCard || playerGrid[colIdx].length >= 5) return;
    const c = currentCard;
    setPlayerGrid((g) => g.map((col, i) => (i === colIdx ? [...col, c] : col)));
    setLastMove(`You placed ${c.isJoker ? "the Joker" : c.rank + SUIT_CHAR[c.suit]} into your Column ${colIdx + 1}.`);
    setCurrentCard(null);
    setTurn("computer");
  }
  function skipCard() {
    if (!currentCard || playerSkipUsed) return;
    setPlayerSkipUsed(true);
    setLastMove("You slid your card face-down into the discard.");
    setCurrentCard(null);
    setTurn("computer");
  }

  const results = useMemo(() => {
    if (phase !== "done") return null;
    let pWins = 0, cWins = 0;
    const rows = [0,1,2,3,4].map((i) => {
      const ph = bestHand(playerGrid[i]), ch = bestHand(compGrid[i]);
      if (!ph || !ch) return { winner: null };
      const cmp = compareHand(ph, ch);
      if (cmp > 0) { pWins++; return { winner: "player", ph, ch }; }
      cWins++; return { winner: "computer", ph, ch };
    });
    return { rows, pWins, cWins };
  }, [phase, playerGrid, compGrid]);

  return (
    <div className="skim-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Inter:wght@400;500;600;700&display=swap');

        .skim-root {
          --felt-1: #0d3327;
          --felt-2: #0a2620;
          --brass: #c6a15b;
          --brass-dim: #8a7345;
          --cream: #faf6ec;
          --ink: #201d18;
          --red: #a7323f;
          --violet: #6f4f95;
          font-family: 'Inter', sans-serif;
          color: var(--cream);
          min-height: 100%;
          padding: 28px 18px 40px;
          background:
            radial-gradient(ellipse at 50% -10%, #1a4c3a 0%, var(--felt-1) 45%, var(--felt-2) 100%);
          background-attachment: fixed;
        }
        .skim-root * { box-sizing: border-box; }

        .header { max-width: 980px; margin: 0 auto 22px; display:flex; align-items:flex-end; justify-content:space-between; flex-wrap:wrap; gap:12px; }
        .title { font-family:'Fraunces', serif; font-weight:700; font-size:34px; letter-spacing:0.5px; color: var(--cream); margin:0; }
        .title .accent { color: var(--brass); }
        .subtitle { font-size:13px; color:#bcd6c8; margin-top:4px; max-width:480px; line-height:1.5; }
        .newgame-btn {
          font-family:'Inter'; font-weight:600; font-size:13px; letter-spacing:0.3px;
          background: linear-gradient(180deg, #d8b876, var(--brass) 60%, var(--brass-dim));
          color:#25200f; border:none; padding:10px 18px; border-radius:8px; cursor:pointer;
          display:flex; align-items:center; gap:7px; box-shadow:0 2px 0 rgba(0,0,0,0.35);
        }
        .newgame-btn:hover { filter: brightness(1.06); }

        .board { max-width: 980px; margin: 0 auto; display:flex; flex-direction:column; gap:14px; }

        .row-label { font-family:'Fraunces', serif; font-size:14px; color:var(--brass); letter-spacing:1.5px; text-transform:uppercase; margin: 2px 4px; display:flex; align-items:center; gap:8px; }
        .row-label .pip { width:7px; height:7px; border-radius:50%; background:var(--brass); opacity:0.5; }
        .row-label.active .pip { opacity:1; box-shadow:0 0 8px var(--brass); }

        .grid-row { display:flex; gap:10px; overflow-x:auto; padding-bottom:4px; }

        .column {
          background: var(--cream); border-radius:10px; padding:10px 8px 8px;
          min-width:96px; flex:1; box-shadow: 0 6px 14px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.4) inset;
          display:flex; flex-direction:column; gap:5px; transition: opacity .3s, transform .3s;
        }
        .col-head { font-family:'Fraunces', serif; font-size:11px; font-weight:600; color:#6b6252; text-align:center; letter-spacing:0.5px; }
        .col-body { display:flex; flex-direction:column; gap:3px; min-height:118px; }
        .col-foot { font-size:10.5px; color:#5c5648; text-align:center; border-top:1px dashed #d9d2bf; padding-top:5px; font-weight:600; display:flex; align-items:center; justify-content:center; gap:4px; min-height:16px; }
        .col-foot-dim { color:#9c9484; font-weight:500; }
        .trophy { color:#b8871f; }
        .col-win { box-shadow: 0 0 0 2px var(--brass), 0 6px 16px rgba(198,161,91,0.45); }
        .col-lose { opacity:0.55; }

        .mc { border-radius:5px; padding:3px 6px; font-size:12px; font-weight:700; display:flex; align-items:center; justify-content:space-between; animation: pop .25s ease; }
        .mc-empty { background:repeating-linear-gradient(45deg, #efe9d8, #efe9d8 4px, #e6dfc9 4px, #e6dfc9 8px); height:19px; border-radius:5px; opacity:0.6; }
        .mc-red { background:#f4e9e6; color:var(--red); }
        .mc-black { background:#eceae3; color:#242018; }
        .mc-joker { background:#ece3f2; color:var(--violet); font-size:10px; gap:4px; }
        @keyframes pop { from { transform: scale(0.7); opacity:0; } to { transform:scale(1); opacity:1; } }

        .center-panel {
          background: rgba(0,0,0,0.22); border:1px solid rgba(198,161,91,0.25);
          border-radius:14px; padding:18px 20px; margin:6px 0;
          display:flex; align-items:center; gap:22px; flex-wrap:wrap; justify-content:space-between;
        }
        .center-left { display:flex; align-items:center; gap:18px; flex-wrap:wrap; }
        .bigcard { width:70px; height:96px; border-radius:9px; background:var(--cream); position:relative; box-shadow:0 8px 18px rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center; }
        .bc-red { color:var(--red); } .bc-black { color:#201d18; }
        .bigcard-corner { position:absolute; font-size:12px; font-weight:800; line-height:1.05; text-align:center; }
        .tl { top:6px; left:6px; } .br { bottom:6px; right:6px; transform:rotate(180deg); }
        .bigcard-center { font-size:30px; }
        .bigcard-joker { background:#ece3f2; color:var(--violet); flex-direction:column; gap:2px; }
        .bigcard-label { font-size:11px; font-weight:800; letter-spacing:1px; }
        .bigcard-sub { font-size:9px; opacity:0.7; }

        .action-text { font-size:13.5px; color:#e7dfc9; max-width:280px; line-height:1.5; }
        .action-buttons { display:flex; gap:8px; flex-wrap:wrap; }
        .col-btn {
          background:rgba(250,246,236,0.08); border:1px solid rgba(198,161,91,0.5); color:var(--cream);
          font-family:'Inter'; font-weight:600; font-size:12.5px; padding:8px 12px; border-radius:7px; cursor:pointer;
          transition: background .15s, transform .1s;
        }
        .col-btn:hover:not(:disabled) { background:rgba(198,161,91,0.28); transform:translateY(-1px); }
        .col-btn:disabled { opacity:0.3; cursor:not-allowed; }
        .skip-btn {
          background:rgba(111,79,149,0.25); border:1px solid rgba(111,79,149,0.6); color:#d9c9ec;
          font-family:'Inter'; font-weight:600; font-size:12.5px; padding:8px 12px; border-radius:7px; cursor:pointer;
          display:flex; align-items:center; gap:6px;
        }
        .skip-btn:hover:not(:disabled) { background:rgba(111,79,149,0.4); }
        .skip-btn:disabled { opacity:0.3; cursor:not-allowed; }

        .deck-stat { display:flex; flex-direction:column; align-items:center; gap:4px; color:#bcd6c8; font-size:11.5px; min-width:80px; }
        .deck-icon-wrap { display:flex; align-items:center; gap:6px; font-weight:700; color:var(--brass); font-size:15px; }

        .status-line { max-width:980px; margin: 10px auto 0; text-align:center; font-size:12px; color:#9fbcac; min-height:16px; }

        .idle-panel { text-align:center; padding:50px 20px; }
        .idle-panel p { max-width:520px; margin:12px auto 22px; color:#cfe3d7; font-size:14px; line-height:1.6; }
        .start-btn {
          font-family:'Fraunces'; font-weight:700; font-size:16px;
          background: linear-gradient(180deg, #d8b876, var(--brass) 60%, var(--brass-dim));
          color:#25200f; border:none; padding:14px 30px; border-radius:9px; cursor:pointer;
          box-shadow:0 4px 0 rgba(0,0,0,0.35);
        }
        .start-btn:hover { filter:brightness(1.05); }

        .result-banner { text-align:center; padding:16px; margin-bottom:6px; }
        .result-banner h2 { font-family:'Fraunces'; font-size:26px; color:var(--brass); margin:0 0 4px; }
        .result-banner p { color:#cfe3d7; font-size:13px; margin:0; }

        @media (max-width:640px) {
          .column { min-width:78px; }
          .bigcard { width:58px; height:80px; }
          .title { font-size:26px; }
        }
      `}</style>

      <div className="header">
        <div>
          <h1 className="title">SK<span className="accent">I</span>M</h1>
          <div className="subtitle">Two grids, one shoe. Every card must be placed the instant it's dealt &mdash; unless you spend your single, secret skim.</div>
        </div>
        {phase !== "idle" && (
          <button className="newgame-btn" onClick={startGame}><RotateCcw size={14}/> New Game</button>
        )}
      </div>

      {phase === "idle" && (
        <div className="idle-panel">
          <Layers size={34} color="#c6a15b" />
          <p>
            52 cards &mdash; a standard deck with the 2&hearts; and 2&clubs; swapped out for the Big and Little Joker &mdash; are dealt one at a time, alternating between you and the computer.
            Each card must go face-up into one of your five columns immediately. Once per game, each side may instead skim
            a card face-down into the discard, unseen. When both grids of 25 are complete, matching columns face off as
            five-card poker hands &mdash; Jokers wild &mdash; and whoever wins more columns wins the game.
          </p>
          <button className="start-btn" onClick={startGame}>Shuffle &amp; Deal</button>
        </div>
      )}

      {phase !== "idle" && (
        <div className="board">
          <div className={`row-label ${turn === "computer" && phase === "dealing" ? "active" : ""}`}>
            <span className="pip" /> Computer &middot; {compPlaced}/25 placed {compSkipUsed && "· skim used"}
          </div>
          <div className="grid-row">
            {compGrid.map((col, i) => (
              <Column key={i} label={`Column ${i + 1}`} cards={col}
                result={results ? results.rows[i].winner === "computer" ? "win" : "lose" : null} />
            ))}
          </div>

          <div className="center-panel">
            <div className="center-left">
              {phase === "dealing" && turn === "player" && currentCard && <BigCard card={currentCard} />}
              {phase === "dealing" && turn === "computer" && (
                <div className="bigcard" style={{background:"repeating-linear-gradient(45deg,#123a2c,#123a2c 5px,#0d3327 5px,#0d3327 10px)"}} />
              )}
              <div>
                {phase === "dealing" && turn === "player" && currentCard && (
                  <>
                    <div className="action-text">Place this card in one of your columns, or skim it if you haven't yet.</div>
                    <div className="action-buttons" style={{marginTop:8}}>
                      {[0,1,2,3,4].map((i) => (
                        <button key={i} className="col-btn" disabled={playerGrid[i].length >= 5}
                          onClick={() => placeCard(i)}>Col {i + 1}</button>
                      ))}
                      <button className="skip-btn" disabled={playerSkipUsed} onClick={skipCard}>
                        <ScissorsLineDashed size={13}/> Skim
                      </button>
                    </div>
                  </>
                )}
                {phase === "dealing" && turn === "computer" && (
                  <div className="action-text">Computer is deciding&hellip;</div>
                )}
                {phase === "done" && (
                  <div className="action-text">All columns are set. Results below.</div>
                )}
              </div>
            </div>
            <div className="deck-stat">
              <div className="deck-icon-wrap"><Layers size={16}/> {deck.length}</div>
              cards left in shoe
            </div>
          </div>

          <div className={`row-label ${turn === "player" && phase === "dealing" ? "active" : ""}`}>
            <span className="pip" /> You &middot; {playerPlaced}/25 placed {playerSkipUsed && "· skim used"}
          </div>
          <div className="grid-row">
            {playerGrid.map((col, i) => (
              <Column key={i} label={`Column ${i + 1}`} cards={col}
                result={results ? results.rows[i].winner === "player" ? "win" : "lose" : null} />
            ))}
          </div>

          <div className="status-line">{lastMove}</div>

          {phase === "done" && results && (
            <div className="result-banner">
              <h2>
                {results.pWins > results.cWins ? "You win the table" :
                 results.cWins > results.pWins ? "Computer wins the table" : "It's a wash"}
              </h2>
              <p>You took {results.pWins} column{results.pWins===1?"":"s"} &middot; Computer took {results.cWins}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
