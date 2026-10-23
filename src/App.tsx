import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Award,
  BookOpen,
  ChevronRight,
  Flame,
  Home,
  Lightbulb,
  Mic,
  RotateCcw,
  Sparkles,
  Star,
  Swords,
  Target,
  Trophy,
  UserRound,
  Volume2,
} from 'lucide-react'
import './App.css'
import { LinxiVoiceClient, type LinxiState } from './linxi'
import { applyMove, isLevelMove, levels, parseVoiceMove, sameSquare, type Level, type Piece, type Square } from './chess'
import { battlePieces, battleStatus, chooseAiMove, createBattle, describeBattleTurn, findVoiceMove, legalTargets as battleLegalTargets, makeBattleMove, VoiceMoveAuthorization } from './battle'
import type { Chess, Move } from '@weshell/xiangqi.js'
import { getPikafishMove, getPikafishStatus, type EngineLevel } from './pikafish'

type Page = 'home' | 'lesson' | 'battle' | 'progress' | 'profile'

function App() {
  const [page, setPage] = useState<Page>('home')
  const [levelIndex, setLevelIndex] = useState(0)
  const level = levels[levelIndex]
  const [pieces, setPieces] = useState<Piece[]>(() => level.pieces.map((piece) => ({ ...piece })))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hintLevel, setHintLevel] = useState(0)
  const [voiceState, setVoiceState] = useState<LinxiState>('idle')
  const [voiceText, setVoiceText] = useState('')
  const [completed, setCompleted] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const voiceClient = useRef<LinxiVoiceClient | null>(null)
  const voiceStateRef = useRef<LinxiState>('idle')

  const selectedPiece = pieces.find((piece) => piece.id === selectedId)
  const legalTargets = selectedId === level.move.pieceId ? [level.move.to] : []

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2400)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => () => voiceClient.current?.disconnect(), [])

  const updateVoiceState = (state: LinxiState) => {
    voiceStateRef.current = state
    setVoiceState(state)
  }

  const loadLevel = (index: number) => {
    const nextLevel = levels[index]
    voiceClient.current?.disconnect()
    setLevelIndex(index)
    setPieces(nextLevel.pieces.map((piece) => ({ ...piece })))
    setSelectedId(null)
    setHintLevel(0)
    setVoiceText('')
    setCompleted(false)
    updateVoiceState('idle')
  }

  const resetLesson = () => loadLevel(levelIndex)

  const openLesson = (index = 0) => {
    loadLevel(index)
    setPage('lesson')
  }

  const makeWinningMove = () => {
    setPieces((current) => applyMove(current, level.move))
    setSelectedId(null)
    setCompleted(true)
    setVoiceText(`${level.answer}，${level.successText}`)
  }

  const handleSquare = (square: Square) => {
    if (completed) return
    const piece = pieces.find((item) => sameSquare(item, square))

    if (selectedPiece && isLevelMove(level, selectedPiece.id, square)) {
      makeWinningMove()
      return
    }

    if (piece?.side === 'red') {
      setSelectedId(piece.id)
      setVoiceText(piece.id === level.move.pieceId ? `选中了红${piece.text}，想想它应该走到哪里。` : `选中了红${piece.text}，再看看有没有更合适的棋子。`)
      return
    }

    setSelectedId(null)
    const targetPiece = pieces.find((item) => item.id === level.move.pieceId)
    setToast(`试试先选中红色的${targetPiece?.text ?? '棋子'}`)
  }

  const handleTranscript = (text: string) => {
    setVoiceText(`听到“${text}”`)
    const result = parseVoiceMove(text, level)
    if (result.matched) {
      setVoiceText(`听到“${text}”，识别为“${result.notation}”。`)
      window.setTimeout(makeWinningMove, 450)
      return
    }
    setToast(`这步还没有匹配成功，可以说“${level.answer}”`)
  }

  const createVoiceClient = () => {
    const client = new LinxiVoiceClient((event) => {
      if (event.type === 'state' && event.state) updateVoiceState(event.state)
      if (event.type === 'transcript' && event.text) handleTranscript(event.text)
      if (event.type === 'reply' && event.text) setVoiceText(event.text)
      if (event.type === 'error' && event.text) {
        updateVoiceState('error')
        setVoiceText(event.text)
        setToast(event.text)
      }
    })
    voiceClient.current = client
    return client
  }

  const startVoice = async () => {
    if (completed) return
    if (voiceStateRef.current === 'listening') {
      await voiceClient.current?.stop()
      return
    }

    voiceClient.current?.disconnect()
    const client = createVoiceClient()
    setVoiceText('正在连接零七教练…')
    try {
      await client.start()
      setVoiceText('我在听，请说出你的走法…说完后再按一次。')
    } catch (error) {
      client.disconnect()
      updateVoiceState('error')
      const message = error instanceof Error ? error.message : '灵矽连接失败'
      setVoiceText(message)
      setToast(message)
    }
  }

  const requestHint = async () => {
    const nextLevel = Math.min(3, hintLevel + 1)
    setHintLevel(nextLevel)
    const hintText = level.hints[nextLevel - 1]
    setVoiceText(hintText)
    try {
      let client = voiceClient.current
      if (!client || client.currentState === 'error' || client.currentState === 'idle') {
        client?.disconnect()
        client = createVoiceClient()
      }
      await client.speakText(hintText)
    } catch (error) {
      const message = error instanceof Error ? error.message : '语音提示播放失败'
      setToast(message)
    }
  }

  const hint = useMemo(() => {
    if (hintLevel === 0) return '需要帮助时，我会一点点提示你。'
    return level.hints[hintLevel - 1]
  }, [hintLevel, level])

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setPage('home')} aria-label="返回首页">
          <span className="brand-mark"><span>象</span></span>
          <span className="brand-name">零七 <small>ZERO7</small></span>
        </button>
        <nav className="desktop-nav" aria-label="主导航">
          <NavButton active={page === 'home'} icon={<Home />} label="首页" onClick={() => setPage('home')} />
          <NavButton active={page === 'progress'} icon={<Trophy />} label="成长" onClick={() => setPage('progress')} />
          <NavButton active={page === 'profile'} icon={<UserRound />} label="我的" onClick={() => setPage('profile')} />
        </nav>
        <div className="streak"><Flame /> 连续学习 <strong>3</strong> 天</div>
      </header>

      <main>
        {page === 'home' && <HomePage onStart={openLesson} onBattle={() => setPage('battle')} completedCount={levelIndex} />}
        {page === 'lesson' && (
          <LessonPage
            pieces={pieces}
            selectedId={selectedId}
            legalTargets={legalTargets}
            level={level}
            levelIndex={levelIndex}
            completed={completed}
            voiceState={voiceState}
            voiceText={voiceText}
            hint={hint}
            hintLevel={hintLevel}
            onSquare={handleSquare}
            onBack={() => setPage('home')}
            onVoice={startVoice}
            onHint={() => void requestHint()}
            onReset={resetLesson}
            onContinue={() => levelIndex < levels.length - 1 ? loadLevel(levelIndex + 1) : setPage('progress')}
          />
        )}
        {page === 'battle' && <BattlePage onBack={() => setPage('home')} />}
        {page === 'progress' && <ProgressPage onLesson={openLesson} />}
        {page === 'profile' && <ProfilePage />}
      </main>

      {toast && <div className="toast" role="status"><Volume2 /> {toast}</div>}

      <nav className="mobile-nav" aria-label="移动端主导航">
        <NavButton active={page === 'home'} icon={<Home />} label="首页" onClick={() => setPage('home')} />
        <NavButton active={page === 'progress'} icon={<Trophy />} label="成长" onClick={() => setPage('progress')} />
        <NavButton active={page === 'profile'} icon={<UserRound />} label="我的" onClick={() => setPage('profile')} />
      </nav>
    </div>
  )
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button className={active ? 'nav-button active' : 'nav-button'} onClick={onClick}>{icon}<span>{label}</span></button>
}

function HomePage({ onStart, onBattle, completedCount }: { onStart: (index?: number) => void; onBattle: () => void; completedCount: number }) {
  return (
    <div className="home-page page-wrap">
      <section className="hero-card">
        <div className="hero-copy">
          <span className="eyebrow"><Sparkles /> 训练 · 对弈 · 复盘</span>
          <h1>你好，棋友！<br /><em>今天想练哪一步？</em></h1>
          <p>和零七一起训练、对弈、复盘，轻松读懂每一步棋。</p>
          <div className="hero-actions"><button className="primary-button" onClick={onBattle}><Swords /> 开始人机对战</button><button className="secondary-button" onClick={() => onStart(0)}>进入训练 <ChevronRight /></button></div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="sun sun-a" /><div className="sun sun-b" />
          <div className="mascot">
            <div className="ear left" /><div className="ear right" />
            <div className="face"><span className="eye left" /><span className="eye right" /><span className="trunk">J</span></div>
            <div className="body">象</div>
          </div>
          <span className="float-piece piece-one">炮</span>
          <span className="float-piece piece-two">马</span>
          <span className="float-star">★</span>
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading"><div><span className="section-kicker">TODAY</span><h2>今日三小关</h2></div><span className="progress-copy">已完成 {completedCount} / 3</span></div>
        <div className="lesson-grid">
          <LessonCard number="01" color="coral" icon={<Target />} title="隔山打牛" text="找到炮架，吃掉闯进中路的黑车。" tags={['观察力', '2 分钟']} onClick={() => onStart(0)} />
          <LessonCard number="02" color="gold" icon={<Lightbulb />} title="一步解围" text="移动红车，挡住中路的将军。" tags={['救将', '3 分钟']} onClick={() => onStart(1)} />
          <LessonCard number="03" color="blue" icon={<Award />} title="马到成功" text="找到一步漂亮的马将军！" tags={['进攻', '3 分钟']} onClick={() => onStart(2)} />
        </div>
      </section>

      <section className="encourage-card">
        <div className="coach-avatar">象</div>
        <div><span>零七教练说</span><p>“下棋不用急，先看看对方下一步想做什么。”</p></div>
        <div className="weekly"><strong>3</strong><span>本周完成</span></div>
      </section>
    </div>
  )
}

function LessonCard({ number, color, icon, title, text, tags, onClick }: { number: string; color: string; icon: React.ReactNode; title: string; text: string; tags: string[]; onClick: () => void }) {
  return (
    <button className={`lesson-card ${color}`} onClick={onClick}>
      <span className="lesson-number">{number}</span>
      <span className="lesson-icon">{icon}</span>
      <span className="lesson-title">{title}</span>
      <span className="lesson-text">{text}</span>
      <span className="tag-row">{tags.map((tag) => <span key={tag}>{tag}</span>)}</span>
      <span className="lesson-arrow"><ChevronRight /></span>
    </button>
  )
}

function LessonPage(props: {
  pieces: Piece[]; selectedId: string | null; legalTargets: Square[]; level: Level; levelIndex: number; completed: boolean; voiceState: LinxiState;
  voiceText: string; hint: string; hintLevel: number; onSquare: (square: Square) => void; onBack: () => void;
  onVoice: () => void; onHint: () => void; onReset: () => void; onContinue: () => void
}) {
  return (
    <div className="lesson-page page-wrap">
      <div className="lesson-topline">
        <button className="back-button" onClick={props.onBack}><ArrowLeft /> 返回</button>
        <div className="step-progress"><span style={{ width: `${props.completed ? ((props.levelIndex + 1) / levels.length) * 100 : (props.levelIndex / levels.length) * 100 + 12}%` }} /><small>今日第 {props.levelIndex + 1} 关 / 共 {levels.length} 关</small></div>
        <button className="icon-button" onClick={props.onReset} aria-label="重新开始"><RotateCcw /></button>
      </div>

      <section className="challenge-layout">
        <div className="board-panel">
          <div className="challenge-title"><span className="mini-badge">{props.level.category}</span><h1>{props.level.title.split('\n').map((line, index) => <span key={line}>{index > 0 && <br />}{line}</span>)}</h1><p>{props.level.description}</p></div>
          <ChessBoard pieces={props.pieces} selectedId={props.selectedId} legalTargets={props.legalTargets} instruction={props.level.instruction} onSquare={props.onSquare} />
        </div>

        <aside className="coach-panel">
          <div className="coach-head"><div className="coach-avatar small">象</div><div><strong>零七教练</strong><span>{voiceStateLabel(props.voiceState)}</span></div><span className={`connection-dot ${props.voiceState}`} aria-label={`灵矽状态：${voiceStateLabel(props.voiceState)}`} /></div>
          <div className="speech-bubble">
            {props.completed ? <><strong>太棒了！</strong><br />{props.level.successText}</> : (props.voiceText || `先别急着走。${props.level.hints[0]}`)}
          </div>

          {!props.completed && (
            <>
              <button className={props.voiceState === 'listening' ? 'voice-button listening' : 'voice-button'} onClick={props.onVoice} disabled={props.voiceState === 'connecting' || props.voiceState === 'thinking'}>
                <span><Mic /></span><strong>{voiceButtonLabel(props.voiceState)}</strong><small>{props.voiceState === 'listening' ? '说完后再按一次' : `例如：“${props.level.answer}”`}</small>
              </button>
              <div className="hint-card"><div><Lightbulb /><strong>分级提示</strong><span>{props.hintLevel}/3</span></div><p>{props.hint}</p><button onClick={props.onHint} disabled={props.hintLevel >= 3}>{props.hintLevel >= 3 ? '已显示完整提示' : '再给我一点提示'}</button></div>
            </>
          )}

          {props.completed && (
            <div className="success-card">
              <div className="stars"><Star /><Star /><Star /></div>
              <h2>{props.level.successTitle}</h2><p>{props.level.successText}</p>
              <div className="reward"><Sparkles /> 获得 {props.level.reward} 颗智慧星</div>
              <button className="primary-button full" onClick={props.onContinue}>{props.levelIndex < levels.length - 1 ? '挑战下一关' : '查看今日成长'} <ChevronRight /></button>
            </div>
          )}
        </aside>
      </section>
    </div>
  )
}

function BattlePage({ onBack }: { onBack: () => void }) {
  const initialGame = useMemo(() => createBattle(), [])
  const game = useRef<Chess>(initialGame)
  const [pieces, setPieces] = useState(() => battlePieces(initialGame))
  const [selected, setSelected] = useState<Square | null>(null)
  const [targets, setTargets] = useState<Square[]>([])
  const [history, setHistory] = useState<string[]>([])
  const [status, setStatus] = useState('轮到红方走棋')
  const [difficulty, setDifficulty] = useState<EngineLevel>('初级')
  const [thinking, setThinking] = useState(false)
  const [engineStatus, setEngineStatus] = useState<'checking' | 'pikafish' | 'fallback'>('checking')
  const [engineName, setEngineName] = useState('正在检查 Pikafish…')
  const [voiceState, setVoiceState] = useState<LinxiState>('idle')
  const [voiceText, setVoiceText] = useState('按下麦克风，说出“炮二平五”这样的中文棋谱。')
  const battleVoiceClient = useRef<LinxiVoiceClient | null>(null)
  const battleVoiceState = useRef<LinxiState>('idle')
  const voiceMoveAuthorization = useRef(new VoiceMoveAuthorization())
  const aiRequestId = useRef(0)

  const updateBattleVoiceState = (nextState: LinxiState) => {
    battleVoiceState.current = nextState
    setVoiceState(nextState)
  }

  useEffect(() => {
    const authorization = voiceMoveAuthorization.current
    void getPikafishStatus().then((result) => {
      setEngineStatus(result.available ? 'pikafish' : 'fallback')
      setEngineName(result.available ? (result.name || 'Pikafish') : '基础 AI（Pikafish 未安装）')
    }).catch(() => {
      setEngineStatus('fallback')
      setEngineName('基础 AI（Pikafish 连接失败）')
    })
    return () => {
      aiRequestId.current += 1
      authorization.cancel()
      battleVoiceClient.current?.disconnect()
    }
  }, [])

  const refresh = (lastMove?: Move) => {
    setPieces(battlePieces(game.current))
    setHistory((game.current.history({ verbose: true }) as Move[]).map((move) => move.zh))
    setStatus(lastMove?.isCheckmate ? battleStatus(game.current) : battleStatus(game.current))
  }

  const speakBattleText = async (text: string) => {
    setVoiceText(text)
    try {
      let client = battleVoiceClient.current
      if (!client || client.currentState === 'idle' || client.currentState === 'error') {
        client?.disconnect()
        client = createBattleVoiceClient()
      }
      await client.speakText(text)
    } catch {
      updateBattleVoiceState('error')
    }
  }

  const aiTurn = async (playerMove: Move) => {
    if (game.current.isGameOver()) {
      void speakBattleText(describeBattleTurn(playerMove))
      return
    }
    const requestId = ++aiRequestId.current
    setThinking(true)
    setStatus(engineStatus === 'pikafish' ? 'Pikafish 正在思考…' : 'ZERO7 基础 AI 正在思考…')
    let aiMove: Move | null = null
    try {
      if (engineStatus === 'pikafish') {
        const fen = game.current.fen()
        const result = await getPikafishMove(fen, difficulty)
        if (requestId !== aiRequestId.current || game.current.fen() !== fen || game.current.turn() !== 'b') return
        aiMove = game.current.move(result.move)
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 520))
        if (requestId !== aiRequestId.current || game.current.turn() !== 'b') return
        const choice = chooseAiMove(game.current, difficulty)
        if (choice) aiMove = game.current.move({ from: choice.from, to: choice.to })
      }
    } catch {
      if (requestId !== aiRequestId.current || game.current.turn() !== 'b') return
      setEngineStatus('fallback')
      setEngineName('基础 AI（Pikafish 暂不可用）')
      const choice = chooseAiMove(game.current, difficulty)
      if (choice) aiMove = game.current.move({ from: choice.from, to: choice.to })
    } finally {
      if (requestId === aiRequestId.current) {
        if (aiMove) refresh(aiMove)
        setThinking(false)
        void speakBattleText(describeBattleTurn(playerMove, aiMove))
      }
    }
  }

  const playBattleMove = (move: Move) => {
    setSelected(null)
    setTargets([])
    refresh(move)
    setVoiceText(`已识别为“${move.zh}”，零七正在思考。`)
    void aiTurn(move)
  }

  const handleBattleTranscript = (text: string) => {
    if (!voiceMoveAuthorization.current.consume()) return
    if (thinking || game.current.isGameOver() || game.current.turn() !== 'w') return
    const move = findVoiceMove(game.current, text)
    if (!move) {
      setVoiceText(`听到“${text}”，没有匹配到当前合法走法，请再说一次。`)
      setStatus('语音走法无法匹配，请使用“炮二平五”这样的中文棋谱。')
      return
    }
    playBattleMove(game.current.move({ from: move.from, to: move.to }))
  }

  function createBattleVoiceClient() {
    const client = new LinxiVoiceClient((event) => {
      if (event.type === 'state' && event.state) updateBattleVoiceState(event.state)
      if (event.type === 'transcript' && event.text) handleBattleTranscript(event.text)
      if (event.type === 'reply' && event.text) setVoiceText(event.text)
      if (event.type === 'error' && event.text) {
        updateBattleVoiceState('error')
        setVoiceText(event.text)
      }
    })
    battleVoiceClient.current = client
    return client
  }

  const startBattleVoice = async () => {
    if (thinking || game.current.isGameOver() || game.current.turn() !== 'w') return
    if (battleVoiceState.current === 'listening') {
      await battleVoiceClient.current?.stop()
      return
    }
    battleVoiceClient.current?.disconnect()
    voiceMoveAuthorization.current.cancel()
    const client = createBattleVoiceClient()
    setVoiceText('正在连接零七，请准备说出走法…')
    try {
      await client.start()
      voiceMoveAuthorization.current.arm()
      setVoiceText('我在听，请说出中文棋谱，说完后再按一次。')
    } catch (error) {
      voiceMoveAuthorization.current.cancel()
      client.disconnect()
      updateBattleVoiceState('error')
      setVoiceText(error instanceof Error ? error.message : '灵矽连接失败')
    }
  }

  const handleSquare = (square: Square) => {
    if (thinking || game.current.isGameOver() || game.current.turn() !== 'w') return
    voiceMoveAuthorization.current.cancel()
    if (battleVoiceState.current === 'listening' || battleVoiceState.current === 'thinking') battleVoiceClient.current?.disconnect()
    const piece = pieces.find((item) => sameSquare(item, square))
    if (!selected) {
      if (piece?.side === 'red') {
        setSelected(square)
        setTargets(battleLegalTargets(game.current, square))
      }
      return
    }
    if (piece?.side === 'red') {
      setSelected(square)
      setTargets(battleLegalTargets(game.current, square))
      return
    }
    const move = makeBattleMove(game.current, selected, square)
    setSelected(null)
    setTargets([])
    if (!move) {
      setStatus('这步棋现在不能走，请换一步。')
      return
    }
    playBattleMove(move)
  }

  const restart = () => {
    aiRequestId.current += 1
    game.current = createBattle()
    setPieces(battlePieces(game.current))
    setHistory([])
    setSelected(null)
    setTargets([])
    setStatus('轮到红方走棋')
    setThinking(false)
    voiceMoveAuthorization.current.cancel()
    battleVoiceClient.current?.disconnect()
    updateBattleVoiceState('idle')
    setVoiceText('按下麦克风，说出“炮二平五”这样的中文棋谱。')
  }

  const undo = () => {
    if (thinking || history.length === 0) return
    game.current.undo()
    if (game.current.turn() === 'b') game.current.undo()
    setSelected(null)
    setTargets([])
    refresh()
  }

  const selectedPiece = selected ? pieces.find((item) => sameSquare(item, selected)) : undefined
  return (
    <div className="battle-page page-wrap">
      <div className="lesson-topline"><button className="back-button" onClick={onBack}><ArrowLeft /> 返回首页</button><div className="battle-heading"><Swords /> 人机对战</div><button className="secondary-button battle-restart-button" onClick={restart}><RotateCcw /> 重开一局</button></div>
      <section className="battle-layout">
        <div className="board-panel battle-board-panel">
          <div className="battle-status"><span className={thinking ? 'thinking-dot active' : 'thinking-dot'} />{status}</div>
          <ChessBoard pieces={pieces} selectedId={selectedPiece?.id ?? null} legalTargets={targets} instruction="你执红方 · ZERO7 执黑方" onSquare={handleSquare} />
        </div>
        <aside className="battle-sidebar">
          <div className="battle-card"><div className="engine-badge"><span className={`engine-light ${engineStatus}`} />{engineName}</div><span className="section-kicker">DIFFICULTY</span><h2>选择棋力</h2><div className="difficulty-row">{(['入门', '初级', '中级'] as const).map((item) => <button key={item} className={difficulty === item ? 'active' : ''} onClick={() => setDifficulty(item)}>{item}</button>)}</div><p className="engine-note">入门约 1280 Elo，初级约 1500 Elo，中级约 1900 Elo。</p></div>
          <div className="battle-card battle-voice-card">
            <div className="coach-head compact"><div className="coach-avatar small">象</div><div><strong>语音走棋与讲解</strong><span>{voiceStateLabel(voiceState)}</span></div><span className={`connection-dot ${voiceState}`} /></div>
            <p>{voiceText}</p>
            <button className={voiceState === 'listening' ? 'voice-button listening' : 'voice-button'} onClick={() => void startBattleVoice()} disabled={thinking || voiceState === 'connecting' || voiceState === 'thinking' || game.current.turn() !== 'w'}><span><Mic /></span><strong>{voiceButtonLabel(voiceState)}</strong><small>{voiceState === 'listening' ? '说完后再按一次' : '例如：“炮二平五”'}</small></button>
          </div>
          <div className="battle-card move-list"><span className="section-kicker">MOVES</span><h2>对局棋谱</h2>{history.length === 0 ? <p>走出第一步后，棋谱会显示在这里。</p> : <ol>{Array.from({ length: Math.ceil(history.length / 2) }, (_, index) => <li key={index}><span>{history[index * 2]}</span><span>{history[index * 2 + 1] ?? '…'}</span></li>)}</ol>}</div>
          <div className="battle-actions"><button className="secondary-button" onClick={undo} disabled={thinking || history.length === 0}><RotateCcw /> 悔棋</button><button className="secondary-button" onClick={() => setStatus('你已认输，本局由 ZERO7 获胜。')}>认输</button></div>
        </aside>
      </section>
    </div>
  )
}

function voiceStateLabel(state: LinxiState) {
  const labels: Record<LinxiState, string> = {
    idle: '语音待命', connecting: '正在连接灵矽…', ready: '灵矽已连接', listening: '正在认真听…',
    thinking: '正在识别走法…', speaking: '正在讲解…', error: '语音暂不可用',
  }
  return labels[state]
}

function voiceButtonLabel(state: LinxiState) {
  if (state === 'connecting') return '正在连接…'
  if (state === 'listening') return '说完了'
  if (state === 'thinking') return '正在识别…'
  if (state === 'error') return '重新连接语音'
  return '按下说走法'
}

function ChessBoard({ pieces, selectedId, legalTargets, instruction, onSquare }: { pieces: Piece[]; selectedId: string | null; legalTargets: Square[]; instruction: string; onSquare: (square: Square) => void }) {
  const squares = Array.from({ length: 90 }, (_, index) => ({ row: Math.floor(index / 9), col: index % 9 }))
  return (
    <div className="board-wrap">
      <div className="chess-board" aria-label="中国象棋棋盘">
        <div className="board-coordinates black-files" aria-label="黑方纵线编号">{['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((file) => <span key={file}>{file}</span>)}</div>
        <svg className="board-grid" viewBox="0 0 8 9" preserveAspectRatio="none" aria-hidden="true">
          {Array.from({ length: 10 }, (_, row) => <line key={`row-${row}`} x1="0" y1={row} x2="8" y2={row} />)}
          <line x1="0" y1="0" x2="0" y2="9" /><line x1="8" y1="0" x2="8" y2="9" />
          {Array.from({ length: 7 }, (_, index) => index + 1).flatMap((col) => [
            <line key={`top-${col}`} x1={col} y1="0" x2={col} y2="4" />,
            <line key={`bottom-${col}`} x1={col} y1="5" x2={col} y2="9" />,
          ])}
          <line x1="3" y1="0" x2="5" y2="2" /><line x1="5" y1="0" x2="3" y2="2" />
          <line x1="3" y1="7" x2="5" y2="9" /><line x1="5" y1="7" x2="3" y2="9" />
        </svg>
        <div className="river"><span>楚 河</span><span>汉 界</span></div>
        {squares.map((square) => {
          const piece = pieces.find((item) => sameSquare(item, square))
          const target = legalTargets.some((item) => sameSquare(item, square))
          return (
            <button
              key={`${square.row}-${square.col}`}
              className={target ? 'board-square target' : 'board-square'}
              style={{ '--board-col': square.col, '--board-row': square.row } as React.CSSProperties}
              onClick={() => onSquare(square)}
              aria-label={piece ? `${piece.side === 'red' ? '红' : '黑'}${piece.text}` : `${square.row}-${square.col}`}
            >
              {piece && <span className={`chess-piece ${piece.side} ${selectedId === piece.id ? 'selected' : ''}`}>{piece.text}</span>}
            </button>
          )
        })}
        <div className="board-coordinates red-files" aria-label="红方纵线编号">{['九', '八', '七', '六', '五', '四', '三', '二', '一'].map((file) => <span key={file}>{file}</span>)}</div>
      </div>
      <div className="board-tip"><span className="red-dot" /> {instruction}</div>
    </div>
  )
}

function ProgressPage({ onLesson }: { onLesson: (index?: number) => void }) {
  return (
    <div className="simple-page page-wrap">
      <span className="eyebrow"><Trophy /> MY JOURNEY</span><h1>我的象棋成长</h1><p className="lead">每一次认真思考，都让你的判断更稳一步。</p>
      <div className="stats-grid"><Stat value="3" label="连续学习天数" color="coral" /><Stat value="28" label="收集智慧星" color="gold" /><Stat value="5" label="完成小关卡" color="blue" /></div>
      <section className="journey-card"><div><span className="section-kicker">本周目标</span><h2>完成 3 次象棋练习</h2><p>再完成今天的三小关，就能点亮“小小观察家”徽章。</p><div className="journey-bar"><span /></div><small>2 / 3 次</small></div><div className="badge-art"><Award /></div></section>
      <button className="primary-button" onClick={() => onLesson(0)}>继续今日挑战 <ChevronRight /></button>
    </div>
  )
}

function Stat({ value, label, color }: { value: string; label: string; color: string }) {
  return <div className={`stat-card ${color}`}><strong>{value}</strong><span>{label}</span></div>
}

function ProfilePage() {
  return (
    <div className="simple-page page-wrap">
      <span className="eyebrow"><UserRound /> MY PROFILE</span><h1>你好，棋友！</h1><p className="lead">这里保存着你的训练偏好和对局成长。</p>
      <section className="profile-card"><div className="profile-avatar">棋<br />友</div><div><h2>ZERO7 棋友</h2><p>当前等级：象棋入门</p><span className="profile-tag"><Star /> 已训练 3 天</span></div></section>
      <section className="settings-card"><h2>训练设置</h2><div><span><Volume2 /> 语音讲解</span><strong>开启</strong></div><div><span><BookOpen /> 每日目标</span><strong>3 个训练关卡</strong></div><div><span><Target /> 当前难度</span><strong>入门</strong></div></section>
    </div>
  )
}

export default App
