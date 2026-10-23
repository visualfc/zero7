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
  Target,
  Trophy,
  UserRound,
  Volume2,
} from 'lucide-react'
import './App.css'
import { LinxiVoiceClient, type LinxiState } from './linxi'

type Page = 'home' | 'lesson' | 'progress' | 'profile'
type Square = { row: number; col: number }
type Piece = Square & { id: string; text: string; side: 'red' | 'black' }

const initialPieces: Piece[] = [
  { id: 'black-general', text: '将', side: 'black', row: 0, col: 4 },
  { id: 'black-advisor-a', text: '士', side: 'black', row: 0, col: 3 },
  { id: 'black-advisor-b', text: '士', side: 'black', row: 0, col: 5 },
  { id: 'black-rook', text: '车', side: 'black', row: 2, col: 4 },
  { id: 'black-pawn-a', text: '卒', side: 'black', row: 3, col: 2 },
  { id: 'black-pawn-b', text: '卒', side: 'black', row: 3, col: 6 },
  { id: 'red-general', text: '帅', side: 'red', row: 9, col: 4 },
  { id: 'red-advisor-a', text: '仕', side: 'red', row: 9, col: 3 },
  { id: 'red-advisor-b', text: '仕', side: 'red', row: 9, col: 5 },
  { id: 'red-cannon', text: '炮', side: 'red', row: 7, col: 4 },
  { id: 'red-rook', text: '车', side: 'red', row: 8, col: 8 },
]

const destinations: Record<string, Square[]> = {
  'red-cannon': [{ row: 2, col: 4 }],
}

function sameSquare(a: Square, b: Square) {
  return a.row === b.row && a.col === b.col
}

function App() {
  const [page, setPage] = useState<Page>('home')
  const [pieces, setPieces] = useState(initialPieces)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hintLevel, setHintLevel] = useState(0)
  const [voiceState, setVoiceState] = useState<LinxiState>('idle')
  const [voiceText, setVoiceText] = useState('')
  const [completed, setCompleted] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const voiceClient = useRef<LinxiVoiceClient | null>(null)
  const voiceStateRef = useRef<LinxiState>('idle')

  const selectedPiece = pieces.find((piece) => piece.id === selectedId)
  const legalTargets = selectedId ? destinations[selectedId] ?? [] : []

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

  const resetLesson = () => {
    setPieces(initialPieces)
    setSelectedId(null)
    setHintLevel(0)
    setVoiceText('')
    setCompleted(false)
  }

  const openLesson = () => {
    resetLesson()
    setPage('lesson')
  }

  const makeWinningMove = () => {
    setPieces((current) =>
      current
        .filter((piece) => piece.id !== 'black-rook')
        .map((piece) =>
          piece.id === 'red-cannon' ? { ...piece, row: 2, col: 4 } : piece,
        ),
    )
    setSelectedId(null)
    setCompleted(true)
    setVoiceText('炮五进五，吃掉黑车！')
  }

  const handleSquare = (square: Square) => {
    if (completed) return
    const piece = pieces.find((item) => sameSquare(item, square))

    if (selectedPiece && legalTargets.some((target) => sameSquare(target, square))) {
      makeWinningMove()
      return
    }

    if (piece?.side === 'red') {
      setSelectedId(piece.id)
      setVoiceText(piece.id === 'red-cannon' ? '选中了红炮，它可以沿直线前进。' : `选中了红${piece.text}。`)
      return
    }

    setSelectedId(null)
    setToast('试试先选中红色的炮')
  }

  const handleTranscript = (text: string) => {
    setVoiceText(`听到“${text}”`)
    const normalized = text.replace(/[，。！？,.!?\s]/g, '').replace('砲', '炮')
    if (normalized.includes('炮五进五') || (normalized.includes('炮') && normalized.includes('进五'))) {
      setVoiceText(`听到“${text}”。这步能吃掉黑车！`)
      window.setTimeout(makeWinningMove, 450)
      return
    }
    setToast('这步还没有匹配成功，可以说“炮五进五”')
  }

  const startVoice = async () => {
    if (completed) return
    if (voiceStateRef.current === 'listening') {
      await voiceClient.current?.stop()
      return
    }

    voiceClient.current?.disconnect()
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
    setVoiceText('正在连接小象教练…')
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

  const hint = useMemo(() => {
    if (hintLevel === 0) return '需要帮助时，我会一点点提示你。'
    if (hintLevel === 1) return '看看棋盘中路，黑车正在将军。'
    if (hintLevel === 2) return '红炮和黑车在同一条直线上。'
    return '选中红炮，再走到黑车的位置：炮五进五。'
  }, [hintLevel])

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setPage('home')} aria-label="返回首页">
          <span className="brand-mark"><span>象</span></span>
          <span className="brand-name">小象棋伴</span>
        </button>
        <nav className="desktop-nav" aria-label="主导航">
          <NavButton active={page === 'home'} icon={<Home />} label="首页" onClick={() => setPage('home')} />
          <NavButton active={page === 'progress'} icon={<Trophy />} label="成长" onClick={() => setPage('progress')} />
          <NavButton active={page === 'profile'} icon={<UserRound />} label="我的" onClick={() => setPage('profile')} />
        </nav>
        <div className="streak"><Flame /> 连续学习 <strong>3</strong> 天</div>
      </header>

      <main>
        {page === 'home' && <HomePage onStart={openLesson} />}
        {page === 'lesson' && (
          <LessonPage
            pieces={pieces}
            selectedId={selectedId}
            legalTargets={legalTargets}
            completed={completed}
            voiceState={voiceState}
            voiceText={voiceText}
            hint={hint}
            hintLevel={hintLevel}
            onSquare={handleSquare}
            onBack={() => setPage('home')}
            onVoice={startVoice}
            onHint={() => setHintLevel((level) => Math.min(3, level + 1))}
            onReset={resetLesson}
            onContinue={() => setPage('progress')}
          />
        )}
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

function HomePage({ onStart }: { onStart: () => void }) {
  return (
    <div className="home-page page-wrap">
      <section className="hero-card">
        <div className="hero-copy">
          <span className="eyebrow"><Sparkles /> 今天也来动动脑筋吧</span>
          <h1>小棋手，<br /><em>准备好闯关了吗？</em></h1>
          <p>每天 10 分钟，和小象一起学会看棋、想棋、下好每一步。</p>
          <button className="primary-button" onClick={onStart}>开始今日挑战 <ChevronRight /></button>
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
        <div className="section-heading"><div><span className="section-kicker">TODAY</span><h2>今日三小关</h2></div><span className="progress-copy">已完成 0 / 3</span></div>
        <div className="lesson-grid">
          <LessonCard number="01" color="coral" icon={<Target />} title="找出危险" text="谁正在攻击我们的帅？" tags={['观察力', '2 分钟']} onClick={onStart} />
          <LessonCard number="02" color="gold" icon={<Lightbulb />} title="一步解围" text="找到既安全又聪明的一步。" tags={['救将', '3 分钟']} onClick={onStart} />
          <LessonCard number="03" color="blue" icon={<Award />} title="将军挑战" text="用一招漂亮地将军！" tags={['进攻', '3 分钟']} onClick={onStart} />
        </div>
      </section>

      <section className="encourage-card">
        <div className="coach-avatar">象</div>
        <div><span>小象教练说</span><p>“下棋不用急，先看看对方下一步想做什么。”</p></div>
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
  pieces: Piece[]; selectedId: string | null; legalTargets: Square[]; completed: boolean; voiceState: LinxiState;
  voiceText: string; hint: string; hintLevel: number; onSquare: (square: Square) => void; onBack: () => void;
  onVoice: () => void; onHint: () => void; onReset: () => void; onContinue: () => void
}) {
  return (
    <div className="lesson-page page-wrap">
      <div className="lesson-topline">
        <button className="back-button" onClick={props.onBack}><ArrowLeft /> 返回</button>
        <div className="step-progress"><span style={{ width: props.completed ? '100%' : '33%' }} /><small>今日第 1 关</small></div>
        <button className="icon-button" onClick={props.onReset} aria-label="重新开始"><RotateCcw /></button>
      </div>

      <section className="challenge-layout">
        <div className="board-panel">
          <div className="challenge-title"><span className="mini-badge">观察力</span><h1>黑车正在将军，<br />你能帮红方解围吗？</h1><p>点击棋子走棋，也可以按住麦克风说出答案。</p></div>
          <ChessBoard pieces={props.pieces} selectedId={props.selectedId} legalTargets={props.legalTargets} onSquare={props.onSquare} />
        </div>

        <aside className="coach-panel">
          <div className="coach-head"><div className="coach-avatar small">象</div><div><strong>小象教练</strong><span>{voiceStateLabel(props.voiceState)}</span></div><span className={`connection-dot ${props.voiceState}`} aria-label={`灵矽状态：${voiceStateLabel(props.voiceState)}`} /></div>
          <div className="speech-bubble">
            {props.completed ? <><strong>太棒了！</strong><br />红炮沿着中路向前，吃掉黑车，帅就安全啦。</> : (props.voiceText || '先别急着走。看看是谁在攻击红帅，再找一找能吃掉它的棋子。')}
          </div>

          {!props.completed && (
            <>
              <button className={props.voiceState === 'listening' ? 'voice-button listening' : 'voice-button'} onClick={props.onVoice} disabled={props.voiceState === 'connecting' || props.voiceState === 'thinking'}>
                <span><Mic /></span><strong>{voiceButtonLabel(props.voiceState)}</strong><small>{props.voiceState === 'listening' ? '说完后再按一次' : '例如：“炮五进五”'}</small>
              </button>
              <div className="hint-card"><div><Lightbulb /><strong>分级提示</strong><span>{props.hintLevel}/3</span></div><p>{props.hint}</p><button onClick={props.onHint} disabled={props.hintLevel >= 3}>{props.hintLevel >= 3 ? '已显示完整提示' : '再给我一点提示'}</button></div>
            </>
          )}

          {props.completed && (
            <div className="success-card">
              <div className="stars"><Star /><Star /><Star /></div>
              <h2>成功解围！</h2><p>你发现了炮能沿直线吃掉黑车。</p>
              <div className="reward"><Sparkles /> 获得 10 颗智慧星</div>
              <button className="primary-button full" onClick={props.onContinue}>查看今日成长 <ChevronRight /></button>
            </div>
          )}
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

function ChessBoard({ pieces, selectedId, legalTargets, onSquare }: { pieces: Piece[]; selectedId: string | null; legalTargets: Square[]; onSquare: (square: Square) => void }) {
  const squares = Array.from({ length: 90 }, (_, index) => ({ row: Math.floor(index / 9), col: index % 9 }))
  return (
    <div className="board-wrap">
      <div className="chess-board" aria-label="中国象棋棋盘">
        <div className="river"><span>楚 河</span><span>汉 界</span></div>
        {squares.map((square) => {
          const piece = pieces.find((item) => sameSquare(item, square))
          const target = legalTargets.some((item) => sameSquare(item, square))
          return (
            <button key={`${square.row}-${square.col}`} className={target ? 'board-square target' : 'board-square'} onClick={() => onSquare(square)} aria-label={piece ? `${piece.side === 'red' ? '红' : '黑'}${piece.text}` : `${square.row}-${square.col}`}>
              {piece && <span className={`chess-piece ${piece.side} ${selectedId === piece.id ? 'selected' : ''}`}>{piece.text}</span>}
            </button>
          )
        })}
      </div>
      <div className="board-tip"><span className="red-dot" /> 红方走棋 <span>·</span> 吃掉正在将军的黑车</div>
    </div>
  )
}

function ProgressPage({ onLesson }: { onLesson: () => void }) {
  return (
    <div className="simple-page page-wrap">
      <span className="eyebrow"><Trophy /> MY JOURNEY</span><h1>小棋手的成长册</h1><p className="lead">每一次认真思考，都让你离象棋高手更近一步。</p>
      <div className="stats-grid"><Stat value="3" label="连续学习天数" color="coral" /><Stat value="28" label="收集智慧星" color="gold" /><Stat value="5" label="完成小关卡" color="blue" /></div>
      <section className="journey-card"><div><span className="section-kicker">本周目标</span><h2>完成 3 次象棋练习</h2><p>再完成今天的三小关，就能点亮“小小观察家”徽章。</p><div className="journey-bar"><span /></div><small>2 / 3 次</small></div><div className="badge-art"><Award /></div></section>
      <button className="primary-button" onClick={onLesson}>继续今日挑战 <ChevronRight /></button>
    </div>
  )
}

function Stat({ value, label, color }: { value: string; label: string; color: string }) {
  return <div className={`stat-card ${color}`}><strong>{value}</strong><span>{label}</span></div>
}

function ProfilePage() {
  return (
    <div className="simple-page page-wrap">
      <span className="eyebrow"><UserRound /> MY PROFILE</span><h1>你好，小棋手！</h1><p className="lead">这里保存着你的学习偏好和小小成就。</p>
      <section className="profile-card"><div className="profile-avatar">小<br />棋</div><div><h2>小小棋手</h2><p>当前等级：象棋新芽</p><span className="profile-tag"><Star /> 已学习 3 天</span></div></section>
      <section className="settings-card"><h2>学习设置</h2><div><span><Volume2 /> 语音讲解</span><strong>开启</strong></div><div><span><BookOpen /> 每日目标</span><strong>3 个小关卡</strong></div><div><span><Target /> 当前难度</span><strong>启蒙</strong></div></section>
    </div>
  )
}

export default App
