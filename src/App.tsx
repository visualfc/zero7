import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
  Award,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Crown,
  Home,
  SkipBack,
  SkipForward,
  Lightbulb,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Star,
  Swords,
  Target,
    Volume2,
} from 'lucide-react'
import './App.css'
import { LinxiVoiceClient, type LinxiState } from './linxi'
import { parseVoiceMove, sameSquare, type Level, type Piece, type Square } from './chess'
import { endgameCategories, fetchPuzzleLibrary, getEndgameCategory } from './puzzles'
import { battlePieces, battleStatus, buildBattleReview, chooseAiMove, createBattle, findVoiceMove, isChessMoveTranscript, legalTargets as battleLegalTargets, squareToPoint, makeBattleMove, terminalType as getTerminalType, VoiceMoveAuthorization, type TerminalType } from './battle'
import { Chess, type Move } from '@weshell/xiangqi.js'
import { BATTLE_RULES, describeAiResponse, describePlayerMove } from './battle-rules'
import { commandHelp, parseVoiceCommand, type VoiceCommand, type VoicePage } from './voice-command'
import { getPikafishMove, getPikafishStatus, warmupPikafish, type EngineLevel } from './pikafish'

type Page = 'home' | 'lesson' | 'endgame' | 'battle'
type ClassicGame = { id: string; event: string; red: string; redOriginal: string; black: string; blackOriginal: string; moves?: string[]; source: string }
const MIN_VOICE_HOLD_MS = 350
const EMPTY_LEVELS: Level[] = []

function App({ initialLevels = EMPTY_LEVELS }: { initialLevels?: Level[] }) {
  const [page, setPage] = useState<Page>('home')
  const [levels, setLevels] = useState<Level[]>(initialLevels)
  const [levelIndex, setLevelIndex] = useState(0)
  const level = levels[levelIndex]
  const [pieces, setPieces] = useState<Piece[]>(() => initialLevels[0]?.pieces.map((piece) => ({ ...piece })) ?? [])
  const [lessonHistory, setLessonHistory] = useState<string[]>([])
  const [lessonLastPath, setLessonLastPath] = useState<{ from: Square; to: Square; side: 'red' | 'black' } | null>(null)
  const lessonPathTimer = useRef<number | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hintLevel, setHintLevel] = useState(0)
  const [voiceState, setVoiceState] = useState<LinxiState>('idle')
  const [voiceHeld, setVoiceHeld] = useState(false)
  const [voiceText, setVoiceText] = useState('')
  const voicePressStartedAt = useRef<number | null>(null)
  const [completed, setCompleted] = useState(false)
  const [terminalType, setTerminalType] = useState<TerminalType>('绝杀')
  const [lessonThinking, setLessonThinking] = useState(false)
  const [endgameAnalysis, setEndgameAnalysis] = useState<{ move: string; evaluation: string; explanation: string } | null>(null)
  const [endgameAnalysisVisible, setEndgameAnalysisVisible] = useState(false)
  const [endgameAnalysisLoading, setEndgameAnalysisLoading] = useState(false)
  const endgameAnalysisRequestId = useRef(0)
  const lessonGame = useRef<Chess | null>(initialLevels[0] ? new Chess(initialLevels[0].fen) : null)
  const lessonRequestId = useRef(0)
  const lessonWarmup = useRef<AbortController | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [pendingVoiceAction, setPendingVoiceAction] = useState<'undo' | 'restart' | 'resign' | null>(null)
  const voiceClient = useRef<LinxiVoiceClient | null>(null)
  const lessonSuccessVoiceClient = useRef<LinxiVoiceClient | null>(null)
  const lessonMoveVoiceClient = useRef<LinxiVoiceClient | null>(null)
  const lessonMoveSpeech = useRef(Promise.resolve())
  const lessonSpeechId = useRef(0)
  const lessonHintVoiceClient = useRef<LinxiVoiceClient | null>(null)
  const voiceStateRef = useRef<LinxiState>('idle')

  const selectedPiece = pieces.find((piece) => piece.id === selectedId)
  const legalTargets = selectedPiece && lessonGame.current
    ? battleLegalTargets(lessonGame.current, selectedPiece)
    : []

  useEffect(() => {
    if (initialLevels.length > 0) return
    const controller = new AbortController()
    void fetchPuzzleLibrary(controller.signal).then((loaded) => {
      setLevels(loaded)
      lessonGame.current = new Chess(loaded[0].fen)
      setPieces(battlePieces(lessonGame.current))
      setLessonHistory([])
    }).catch((error) => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setToast(error instanceof Error ? error.message : '题库加载失败')
    })
    return () => controller.abort()
  }, [initialLevels])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2400)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => () => {
    voiceClient.current?.disconnect()
    lessonSuccessVoiceClient.current?.disconnect()
    lessonMoveVoiceClient.current?.disconnect()
    lessonHintVoiceClient.current?.disconnect()
    lessonWarmup.current?.abort()
    if (lessonPathTimer.current !== null) window.clearTimeout(lessonPathTimer.current)
  }, [])

  useEffect(() => {
    const blockSpace = (event: KeyboardEvent) => {
      if (event.code === 'Space') event.preventDefault()
    }
    const handleSpaceDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      event.preventDefault()
      if (event.repeat || page === 'battle' || isTextInput(event.target) || voicePressStartedAt.current !== null) return
      if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur()
      voicePressStartedAt.current = Date.now()
      setVoiceHeld(true)
      void startVoice()
    }
    const handleSpaceUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      event.preventDefault()
      if (page === 'battle' || voicePressStartedAt.current === null) return
      setVoiceHeld(false)
      void stopVoice()
    }
    window.addEventListener('keydown', blockSpace, true)
    window.addEventListener('keyup', blockSpace, true)
    window.addEventListener('keypress', blockSpace, true)
    window.addEventListener('keydown', handleSpaceDown, true)
    window.addEventListener('keyup', handleSpaceUp, true)
    return () => {
      window.removeEventListener('keydown', blockSpace, true)
      window.removeEventListener('keyup', blockSpace, true)
      window.removeEventListener('keypress', blockSpace, true)
      window.removeEventListener('keydown', handleSpaceDown, true)
      window.removeEventListener('keyup', handleSpaceUp, true)
      if (page !== 'battle') voiceClient.current?.disconnect()
    }
  }, [page])

  const updateVoiceState = (state: LinxiState) => {
    voiceStateRef.current = state
    setVoiceState(state)
  }

  const stopVoice = async () => {
    const startedAt = voicePressStartedAt.current
    voicePressStartedAt.current = null
    if (startedAt === null) return
    if (Date.now() - startedAt < MIN_VOICE_HOLD_MS) {
      voiceClient.current?.disconnect()
      updateVoiceState('idle')
      return
    }
    await voiceClient.current?.stop()
  }

  const loadLevel = (index: number) => {
    voicePressStartedAt.current = null
    lessonRequestId.current += 1
    setVoiceHeld(false)
    setLessonThinking(false)
    const nextLevel = levels[index]
    lessonGame.current = new Chess(nextLevel.fen)
    lessonWarmup.current?.abort()
    const warmup = new AbortController()
    lessonWarmup.current = warmup
    void warmupPikafish(nextLevel.fen, warmup.signal).catch(() => {}).finally(() => {
      if (lessonWarmup.current === warmup) lessonWarmup.current = null
    })
    voiceClient.current?.disconnect()
    lessonSpeechId.current += 1
    lessonMoveVoiceClient.current?.disconnect()
    lessonMoveVoiceClient.current = null
    lessonMoveSpeech.current = Promise.resolve()
    lessonHintVoiceClient.current?.disconnect()
    lessonHintVoiceClient.current = null
    setLevelIndex(index)
    setPieces(battlePieces(lessonGame.current))
    setLessonHistory([])
    setLessonLastPath(null)
    if (lessonPathTimer.current !== null) window.clearTimeout(lessonPathTimer.current)
    lessonPathTimer.current = null
    setSelectedId(null)
    setHintLevel(0)
    setVoiceText('')
    setCompleted(false)
    setTerminalType('绝杀')
    setEndgameAnalysis(null)
    setEndgameAnalysisLoading(false)
    endgameAnalysisRequestId.current += 1
    updateVoiceState('idle')
  }

  const resetLesson = () => loadLevel(levelIndex)

  const openLesson = (index = Math.max(0, levels.findIndex((item) => item.mode !== 'endgame'))) => {
    loadLevel(index)
    setPage('lesson')
  }

  const openEndgame = () => {
    const index = Math.max(0, levels.findIndex((item) => item.mode === 'endgame'))
    loadLevel(index)
    setPage('endgame')
  }

  const selectLevel = (index: number) => loadLevel(index)
  const navigate = (next: Page) => {
    if (next === 'lesson') openLesson()
    else if (next === 'endgame') openEndgame()
    else setPage(next)
  }

  const continueLevel = () => {
    const mode = level.mode
    const candidates = levels.map((item, index) => ({ item, index })).filter(({ item }) => item.mode === mode)
    const current = candidates.findIndex(({ index }) => index === levelIndex)
    loadLevel(candidates[(current + 1) % candidates.length]?.index ?? levelIndex)
  }

  const queueLessonSpeech = (text: string) => {
    const speechId = lessonSpeechId.current
    lessonMoveSpeech.current = lessonMoveSpeech.current.then(async () => {
      if (speechId !== lessonSpeechId.current) return
      const client = new LinxiVoiceClient(() => {})
      lessonMoveVoiceClient.current = client
      try {
        await client.speakText(text)
        await client.waitForPlayback()
      } catch (error) {
        if (speechId === lessonSpeechId.current) setToast(error instanceof Error ? error.message : '走棋语音播放失败')
      } finally {
        client.disconnect()
        if (lessonMoveVoiceClient.current === client) lessonMoveVoiceClient.current = null
      }
    })
  }

  const speakLessonSuccess = async (notation = level.answer, terminal = '绝杀') => {
    lessonSuccessVoiceClient.current?.disconnect()
    const client = new LinxiVoiceClient(() => {})
    lessonSuccessVoiceClient.current = client
    try {
      await lessonMoveSpeech.current
      await client.speakText(`${notation}，${terminal}！`)
      await client.waitForPlayback()
    } catch (error) {
      setToast(error instanceof Error ? error.message : '成功讲解播放失败')
    } finally {
      client.disconnect()
      if (lessonSuccessVoiceClient.current === client) lessonSuccessVoiceClient.current = null
    }
  }

  const completeLesson = (notation = level.answer, terminal: TerminalType = '绝杀') => {
    setTerminalType(terminal)
    setSelectedId(null)
    setCompleted(true)
    setVoiceText(`${notation}，${terminal}！`)
    void speakLessonSuccess(notation, terminal)
  }

  const showLessonPath = (move: Move, untilResponse = false) => {
    setLessonLastPath({ from: squareToPoint(move.from), to: squareToPoint(move.to), side: move.color === 'w' ? 'red' : 'black' })
    if (lessonPathTimer.current !== null) window.clearTimeout(lessonPathTimer.current)
    lessonPathTimer.current = untilResponse ? null : window.setTimeout(() => {
      setLessonLastPath(null)
      lessonPathTimer.current = null
    }, BATTLE_RULES.movePathDisplayMs)
  }

  const respondToLessonMove = async (game: Chess, candidateAnswer = false, playerNotation?: string) => {
    const requestId = ++lessonRequestId.current
    const fen = game.fen()
    const locallyCheckmated = game.isCheckmate()
    setLessonThinking(true)
    setVoiceText(candidateAnswer ? '正在验证对方是否还有解法…' : '零七正在应对…')
    try {
      const mateDepth = level.mode === 'mateN' ? 20 : level.mode.match(/^mate([2-9]\d*)$/)?.[1]
      const targetMateDepth = mateDepth ? Number(mateDepth) : undefined
      let result
      try {
        result = await getPikafishMove(fen, '初级', false, targetMateDepth)
      } catch (error) {
        if (!targetMateDepth) throw error
        result = await getPikafishMove(fen, '初级')
      }
      if (requestId !== lessonRequestId.current || lessonGame.current !== game || game.fen() !== fen) return
      if (!result.move && game.moves().length > 0 && targetMateDepth) {
        result = await getPikafishMove(fen, '初级')
        if (requestId !== lessonRequestId.current || lessonGame.current !== game || game.fen() !== fen) return
      }
      const forcedMate = result.score?.type === 'mate' && result.score.value < 0
      if (!result.move) {
        if (result.terminal && game.moves().length === 0) {
          const lastMove = game.history({ verbose: true }).at(-1)
          completeLesson(lastMove?.zh ?? level.answer, locallyCheckmated ? getTerminalType(game) : '困毙杀')
          return
        }
        if (playerNotation) queueLessonSpeech(playerNotation)
        setVoiceText('对方没有合法应手，但当前没有形成将死。可以重新练习或继续下一题。')
        return
      }
      if (playerNotation) queueLessonSpeech(playerNotation)
      await new Promise((resolve) => window.setTimeout(resolve, BATTLE_RULES.aiThinkDelayMs))
      if (requestId !== lessonRequestId.current || lessonGame.current !== game || game.fen() !== fen) return
      if (candidateAnswer && forcedMate && level.mode !== 'mate1') {
        const response = game.move(result.move)
        if (!response) throw new Error('Pikafish 返回了无效应手')
        setPieces(battlePieces(game))
        setLessonHistory((game.history({ verbose: true }) as Move[]).map((move) => move.zh))
        showLessonPath(response)
        if (endgameAnalysisVisible && level.mode === 'endgame') void analyzeEndgame()
        const responseTerminal = response.isCheckmate ? getTerminalType(game) : null
        const responseText = responseTerminal ? `${response.zh}，${responseTerminal}！` : response.isCheck ? `${response.zh}，将军。` : response.zh
        queueLessonSpeech(responseText)
        setVoiceText(responseTerminal ? `${response.zh}，${responseTerminal}！` : response.isCheck ? `${response.zh}，将军。` : `零七走了${response.zh}。`)
        setLessonThinking(false)
        return
      }
      const response = game.move(result.move)
      if (!response) throw new Error('Pikafish 返回了无效应手')
      setPieces(battlePieces(game))
      setLessonHistory((game.history({ verbose: true }) as Move[]).map((move) => move.zh))
      showLessonPath(response)
      if (endgameAnalysisVisible && level.mode === 'endgame') void analyzeEndgame()
      const responseTerminal = response.isCheckmate ? getTerminalType(game) : null
      const responseText = responseTerminal ? `${response.zh}，${responseTerminal}！` : response.isCheck ? `${response.zh}，将军。` : response.zh
      queueLessonSpeech(responseText)
      setVoiceText(responseTerminal ? `${response.zh}，${responseTerminal}！` : response.isCheck ? `${response.zh}，将军。` : `零七走了${response.zh}。`)
    } catch (error) {
      if (requestId !== lessonRequestId.current) return
      if (playerNotation) queueLessonSpeech(playerNotation)
      setVoiceText('引擎连接失败，请重试。')
      setToast(error instanceof Error ? error.message : '引擎连接失败，请重试')
    } finally {
      if (requestId === lessonRequestId.current) setLessonThinking(false)
    }
  }

  const analyzeEndgame = async () => {
    const game = lessonGame.current
    if (!game || level.mode !== 'endgame') return
    const requestId = ++endgameAnalysisRequestId.current
    const fen = game.fen()
    setEndgameAnalysisLoading(true)
    try {
      const result = await getPikafishMove(fen, '中级', true)
      if (requestId !== endgameAnalysisRequestId.current || lessonGame.current !== game || game.fen() !== fen) return
      const analysisGame = new Chess(fen)
      const recommended = result.move ? analysisGame.move(result.move) : null
      const move = recommended?.zh ?? '当前没有合法着法'
      const evaluation = result.score?.type === 'mate'
        ? result.score.value > 0 ? `预计${result.score.value}步成杀` : `需要防守对方${Math.abs(result.score.value)}步杀棋`
        : Math.abs(result.score?.value ?? 0) < 50 ? '局面接近均势' : (result.score?.value ?? 0) > 0 ? '当前行棋方占优' : '当前行棋方需要谨慎防守'
      const explanation = `推荐走法${move}。${evaluation}。优先改善子力位置，同时注意对方的将军和兑子手段。`
      setEndgameAnalysis({ move, evaluation, explanation })
    } catch (error) {
      setToast(error instanceof Error ? error.message : '残局讲解暂不可用')
    } finally {
      if (requestId === endgameAnalysisRequestId.current) setEndgameAnalysisLoading(false)
    }
  }

  const toggleEndgameAnalysis = () => {
    if (endgameAnalysisVisible) {
      endgameAnalysisRequestId.current += 1
      setEndgameAnalysisVisible(false)
      setEndgameAnalysisLoading(false)
      return
    }
    setEndgameAnalysisVisible(true)
  }

  useEffect(() => {
    if (page === 'endgame' && endgameAnalysisVisible) void analyzeEndgame()
  }, [levelIndex, page, endgameAnalysisVisible])

  const playLessonMove = (from: Square, to: Square) => {
    const game = lessonGame.current
    const move = game && makeBattleMove(game, from, to)
    if (!game || !move) {
      setToast('当前局面已经变化，请重新说当前局面可以走的走法')
      return
    }
    setPieces(battlePieces(game))
    if (level.mode === 'endgame') setEndgameAnalysis(null)
    setLessonHistory((game.history({ verbose: true }) as Move[]).map((historyMove) => historyMove.zh))
    showLessonPath(move, true)
    setSelectedId(null)
    void respondToLessonMove(game, level.mode !== 'endgame' ? true : game.isCheckmate(), move.zh)
  }

  const handleSquare = (square: Square) => {
    if (completed || lessonThinking) return
    const game = lessonGame.current
    const piece = pieces.find((item) => sameSquare(item, square))
    if (!game) return

    if (selectedPiece && legalTargets.some((target) => sameSquare(target, square))) {
      const from = { row: selectedPiece.row, col: selectedPiece.col }
      const move = makeBattleMove(game, from, square)
      if (!move) return
      setPieces(battlePieces(game))
      setLessonHistory((game.history({ verbose: true }) as Move[]).map((historyMove) => historyMove.zh))
      showLessonPath(move, true)
      setSelectedId(null)
      void respondToLessonMove(game, level.mode !== 'endgame' ? true : game.isCheckmate(), move.zh)
      return
    }

    const movingSide = game.turn() === 'w' ? 'red' : 'black'
    const sideName = movingSide === 'red' ? '红' : '黑'
    if (piece?.side === movingSide) {
      if (game.isCheck() && battleLegalTargets(game, piece).length === 0) {
        setSelectedId(null)
        setVoiceText('当前处于将军中，请先应将。')
        return
      }
      setSelectedId(piece.id)
      setVoiceText(`选中了${sideName}${piece.text}，请选择合法落点。`)
      return
    }

    setSelectedId(null)
    setToast(`请选择${sideName}方棋子`)
  }

  const executeLessonCommand = (command: VoiceCommand) => {
    if (command.type === 'training.hint') { void requestHint(); return true }
    if (command.type === 'training.restart') { setPendingVoiceAction('restart'); setVoiceText('请说确认或取消。'); return true }
    if (command.type === 'navigation.home') { setPage('home'); return true }
    if (command.type === 'help') { setVoiceText(commandHelp('lesson')); return true }
    if (command.type === 'training.next') {
      loadLevel((levelIndex + 1) % levels.length)
      return true
    }
    return false
  }

  const executeGlobalCommand = (command: VoiceCommand) => {
    if (command.type === 'help') { setVoiceText(commandHelp(page as VoicePage)); return true }
    if (command.type === 'navigation.home') { setPage('home'); return true }
    if (command.type === 'battle.start' && page === 'home') { setPage('battle'); return true }
    if (command.type === 'training.start' && page === 'home') { openLesson(); return true }
    return false
  }

  const handleTranscript = (text: string) => {
    voiceClient.current?.disconnect()
    const command = parseVoiceCommand(text)
    if (pendingVoiceAction && (command.type === 'confirm' || command.type === 'cancel')) {
      if (command.type === 'cancel') { setPendingVoiceAction(null); setVoiceText('已取消。'); return }
      const action = pendingVoiceAction
      setPendingVoiceAction(null)
      setVoiceText('已确认。')
      if (page === 'lesson') {
        if (action === 'restart') resetLesson()
      }
      return
    }
    if (executeGlobalCommand(command)) return
    if (executeLessonCommand(command)) return
    setVoiceText(`听到“${text}”`)
    const game = lessonGame.current
    const legalMove = game && findVoiceMove(game, text)
    if (legalMove) {
      setVoiceText(`听到“${text}”，识别为“${legalMove.zh}”。`)
      const from = squareToPoint(legalMove.from)
      const to = squareToPoint(legalMove.to)
      window.setTimeout(() => playLessonMove(from, to), 450)
      return
    }
    const result = parseVoiceMove(text, level)
    setToast(result.matched ? '这步棋在当前局面不能走，请重新说合法走法' : `这步还没有匹配成功，可以说“${level.answer}”`)
  }

  const createVoiceClient = () => {
    const client = new LinxiVoiceClient((event) => {
      if (event.type === 'state' && event.state) updateVoiceState(event.state)
      if (event.type === 'transcript' && event.text) handleTranscript(event.text)
      if (event.type === 'reply' && event.text && !isRepeatedClosingReply(event.text)) setVoiceText(event.text)
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
    if (!window.isSecureContext) {
      setVoiceText('手机语音输入需要使用 HTTPS，请访问终端显示的 https:// 地址。')
      updateVoiceState('error')
      return
    }
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
      setVoiceText('我在听，请说出你的走法，松开后完成识别。')
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
    lessonHintVoiceClient.current?.disconnect()
    const client = new LinxiVoiceClient(() => {})
    lessonHintVoiceClient.current = client
    try {
      await client.speakText(hintText)
      await client.waitForPlayback()
    } catch (error) {
      const message = error instanceof Error ? error.message : '语音提示播放失败'
      setToast(message)
    } finally {
      client.disconnect()
      if (lessonHintVoiceClient.current === client) lessonHintVoiceClient.current = null
    }
  }

  const hint = useMemo(() => {
    if (hintLevel === 0 || !level) return '需要帮助时，我会一点点提示你。'
    return level.hints[hintLevel - 1]
  }, [hintLevel, level])

  if (!level) return <div className="app-shell puzzle-loading"><main><div className="loading-card">正在加载练习题库…</div></main>{toast && <div className="toast" role="status"><Volume2 /> {toast}</div>}</div>

  return (
    <div className={`app-shell ${page === 'battle' ? 'battle-shell' : ''} ${page === 'home' ? 'home-shell' : ''} ${page === 'lesson' || page === 'endgame' ? 'content-shell' : ''}`}>
      <main>
        {page === 'home' && <HomePage levels={levels} onStart={openLesson} onEndgame={openEndgame} onBattle={() => setPage('battle')} onNavigate={navigate} completedCount={levelIndex} />}
        {(page === 'lesson' || page === 'endgame') && (
          <LessonPage
            pieces={pieces}
            selectedId={selectedId}
            legalTargets={legalTargets}
            level={level}
            levelIndex={levelIndex}
            lessonHistory={lessonHistory}
            lastPath={lessonLastPath}
            page={page}
            completed={completed}
            terminalType={terminalType}
            thinking={lessonThinking}
            voiceState={voiceState}
            voiceHeld={voiceHeld}
            voiceText={voiceText}
            hint={hint}
            hintLevel={hintLevel}
            endgameAnalysis={endgameAnalysis}
            endgameAnalysisVisible={endgameAnalysisVisible}
            endgameAnalysisLoading={endgameAnalysisLoading}
            onToggleEndgameAnalysis={toggleEndgameAnalysis}
            onSpeakEndgameAnalysis={() => { if (endgameAnalysis) queueLessonSpeech(endgameAnalysis.explanation) }}
            onSquare={handleSquare}
            onBack={() => setPage('home')}
            onVoiceStart={() => { voicePressStartedAt.current = Date.now(); setVoiceHeld(true); void startVoice() }} onVoiceStop={() => { setVoiceHeld(false); void stopVoice() }}
            onHint={() => void requestHint()}
            onReset={resetLesson}
            onContinue={continueLevel}
            levels={levels}
            onSelectLevel={selectLevel}
            onNavigate={navigate}
          />
        )}
        {page === 'battle' && <BattlePage onNavigate={navigate} />}
      </main>

      {toast && <div className="toast" role="status"><Volume2 /> {toast}</div>}

      <nav className="mobile-nav" aria-label="移动端主导航">
        <NavButton active={page === 'home'} icon={<Home />} label="首页" onClick={() => setPage('home')} />
        <NavButton active={page === 'battle'} icon={<Swords />} label="对战" onClick={() => setPage('battle')} />
        <NavButton active={page === 'lesson'} icon={<Target />} label="训练" onClick={() => openLesson()} />
        <NavButton active={page === 'endgame'} icon={<Crown />} label="残局" onClick={openEndgame} />
      </nav>
    </div>
  )
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button className={active ? 'nav-button active' : 'nav-button'} onClick={onClick}>{icon}<span>{label}</span></button>
}

function SideNavigation({ active, onNavigate }: { active: Page; onNavigate: (page: Page) => void }) {
  return <nav className="battle-side-nav unified-side-nav" aria-label="主导航"><button className="brand battle-side-brand" onClick={() => onNavigate('home')} aria-label="返回首页"><span className="brand-mark"><span>象</span></span><span className="brand-name">零七 <small>ZERO7</small></span></button><div className="battle-side-nav-buttons"><NavButton active={active === 'battle'} icon={<Swords />} label="对战" onClick={() => onNavigate('battle')} /><NavButton active={active === 'lesson'} icon={<Target />} label="训练" onClick={() => onNavigate('lesson')} /><NavButton active={active === 'endgame'} icon={<Crown />} label="残局" onClick={() => onNavigate('endgame')} /></div></nav>
}

function HomePage({ levels, onStart, onEndgame, onBattle, onNavigate, completedCount }: { levels: Level[]; onStart: (index?: number) => void; onEndgame: () => void; onBattle: () => void; onNavigate: (page: Page) => void; completedCount: number }) {
  const dailyLevels = useMemo(() => {
    const training = levels.map((level, index) => ({ level, index })).filter(({ level }) => level.mode !== 'endgame')
    const day = new Date().toLocaleDateString('zh-CN')
    let seed = [...`${day}:${training.map(({ level }) => level.id).join(',')}`].reduce((value, char) => ((value * 31) + char.charCodeAt(0)) >>> 0, 2166136261)
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
    const groups = new Map<string, typeof training>()
    training.forEach((entry) => groups.set(entry.level.mode, [...(groups.get(entry.level.mode) ?? []), entry]))
    const selected = [...groups.values()].map((items) => items[Math.floor(random() * items.length)]).sort(() => random() - 0.5).slice(0, 3)
    const remaining = training.filter((entry) => !selected.some((item) => item.index === entry.index)).sort(() => random() - 0.5)
    return [...selected, ...remaining].slice(0, 3)
  }, [levels])
  return (
    <div className="home-page">
      <div className="home-main">
      <section className="hero-card">
        <div className="hero-copy">
          <span className="eyebrow"><Sparkles /> 训练 · 对弈 · 复盘</span>
          <h1>你好，棋友！<br /><em>今天想练哪一步？</em></h1>
          <p>和零七一起训练、对弈、复盘，轻松读懂每一步棋。</p>
          <div className="hero-actions"><button className="primary-button" onClick={onBattle}><Swords /> 人机对战</button><button className="secondary-button" onClick={() => onStart(0)}><Target /> 杀棋训练</button><button className="secondary-button" onClick={onEndgame}><Crown /> 残局训练</button></div>
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
          {dailyLevels.map(({ level, index: levelIndex }, index) => <LessonCard key={level.id} number={level.number} color={['coral', 'gold', 'blue'][index]} icon={[<Target key="target" />, <Lightbulb key="hint" />, <Award key="award" />][index]} title={level.title.replace('\n', '')} text={level.description} tags={[level.category, level.difficulty]} onClick={() => onStart(levelIndex)} />)}
        </div>
      </section>

      <section className="encourage-card">
        <div className="coach-avatar">象</div>
        <div><span>零七教练说</span><p>“下棋不用急，先看看对方下一步想做什么。”</p></div>
        <div className="weekly"><strong>3</strong><span>本周完成</span></div>
      </section>
      </div>
      <aside className="home-sidebar">
        <SideNavigation active="home" onNavigate={onNavigate} />
        <div className="home-side-card"><span className="section-kicker">TODAY</span><strong>今日进度</strong><p>已完成 {completedCount} / 3</p><div className="home-progress"><i style={{ width: `${(completedCount / 3) * 100}%` }} /></div></div>
        <div className="home-side-card home-tip"><div className="coach-avatar small">象</div><p>下棋不用急，先看看对方下一步想做什么。</p></div>
      </aside>
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
  pieces: Piece[]; selectedId: string | null; legalTargets: Square[]; lessonHistory: string[]; lastPath: { from: Square; to: Square; side: 'red' | 'black' } | null; level: Level; levelIndex: number; page: Page; levels: Level[]; completed: boolean; terminalType: TerminalType; thinking: boolean; voiceState: LinxiState; voiceHeld: boolean;
  voiceText: string; hint: string; hintLevel: number; endgameAnalysis: { move: string; evaluation: string; explanation: string } | null; endgameAnalysisVisible: boolean; endgameAnalysisLoading: boolean; onToggleEndgameAnalysis: () => void; onSpeakEndgameAnalysis: () => void; onSquare: (square: Square) => void; onBack: () => void;
  onVoiceStart: () => void; onVoiceStop: () => void; onHint: () => void; onReset: () => void; onContinue: () => void; onSelectLevel: (index: number) => void; onNavigate: (page: Page) => void
}) {
  const trainingGroups = [
    { mode: 'mate1', label: '一步杀', numberPrefix: '1' },
    { mode: 'mate2', label: '二步杀', numberPrefix: '2' },
    { mode: 'mate3', label: '三步杀', numberPrefix: '3' },
    { mode: 'mate4', label: '四步杀', numberPrefix: '4' },
    { mode: 'mateN', label: 'N步杀', numberPrefix: '9' },
  ] as const
  const currentEndgameCategory = getEndgameCategory(props.level.sourceType)
  const selectableLevels = props.levels
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => props.page === 'endgame'
      ? item.mode === 'endgame' && getEndgameCategory(item.sourceType) === currentEndgameCategory
      : item.mode === props.level.mode)

  return (
    <div className={`lesson-page unified-page ${props.page === 'endgame' ? 'endgame-page' : ''}`}>
      <div className="unified-main">
      <section className="challenge-layout">
        <div className="board-panel">
          <div className="lesson-move-rail" aria-label="残局棋谱">{Array.from({ length: Math.ceil(props.lessonHistory.length / 2) }, (_, index) => <div className="battle-move-turn" key={index}><span>{index + 1}.</span><div><span className="lesson-move">{props.lessonHistory[index * 2]}</span>{props.lessonHistory[index * 2 + 1] && <span className="lesson-move">{props.lessonHistory[index * 2 + 1]}</span>}</div></div>)}</div>
          <ChessBoard pieces={props.pieces} selectedId={props.selectedId} legalTargets={props.legalTargets} lastPath={props.lastPath} instruction={props.level.instruction} onSquare={props.onSquare} />
        </div>
      </section>
      </div>

      <aside className="unified-sidebar lesson-sidebar">
        <SideNavigation active={props.page} onNavigate={props.onNavigate} />
        <div className={`coach-panel ${props.completed ? 'lesson-completed' : ''}`}>
          <div className="lesson-card lesson-overview-card">
          <div className="lesson-picker">
            {props.page === 'endgame' ? (
              <>
                <label htmlFor="lesson-mode-select">残局类型</label>
                <select
                  id="lesson-mode-select"
                  value={currentEndgameCategory}
                  onChange={(event) => {
                    const index = props.levels.findIndex((item) => item.mode === 'endgame' && getEndgameCategory(item.sourceType) === event.target.value)
                    if (index >= 0) props.onSelectLevel(index)
                  }}
                >
                  {endgameCategories.map((group) => props.levels.some((item) => item.mode === 'endgame' && getEndgameCategory(item.sourceType) === group.label) && <option key={group.id} value={group.label}>{group.label}</option>)}
                </select>
              </>
            ) : (
              <>
                <label htmlFor="lesson-mode-select">杀棋类型</label>
                <select
                  id="lesson-mode-select"
                  value={props.level.mode}
                  onChange={(event) => {
                    const index = props.levels.findIndex((item) => item.mode === event.target.value)
                    if (index >= 0) props.onSelectLevel(index)
                  }}
                >
                  {trainingGroups.map((group) => props.levels.some((item) => item.mode === group.mode) && <option key={group.mode} value={group.mode}>{group.label}</option>)}
                </select>
              </>
            )}
            <label htmlFor="lesson-picker-select">选择题目</label>
            <select id="lesson-picker-select" value={props.levelIndex} onChange={(event) => props.onSelectLevel(Number(event.target.value))}>
              {selectableLevels.map(({ item, index }, itemIndex) => {
                const trainingPrefix = trainingGroups.find((group) => group.mode === item.mode)?.numberPrefix
                const endgameStart = endgameCategories.find((group) => group.label === currentEndgameCategory)?.numberStart
                const number = item.mode === 'endgame' && endgameStart ? String(endgameStart + itemIndex) : `${trainingPrefix ?? ''}${String(itemIndex + 1).padStart(3, '0')}`
                return <option key={item.id} value={index}>{number}</option>
              })}
            </select>
          </div>
          <div className="lesson-side-description"><div className="lesson-badges"><span className="mini-badge">{props.level.category}</span><span className="mini-badge difficulty-badge">{props.level.difficulty}</span><span className={`mini-badge source-badge ${props.level.fen.split(' ')[1] === 'b' ? 'black' : 'red'}`}>{props.level.fen.split(' ')[1] === 'b' ? '黑方先行' : '红方先行'}</span></div><div className="puzzle-title"><h1>{props.level.title.replace(/\\\\n/g, '\n').replace(/\\n/g, '\n').split(/\r?\n/).map((line, index) => <Fragment key={`${props.level.id}-${index}`}>{index > 0 && <br />}{line}</Fragment>)}</h1></div></div>
          </div>
          {!props.completed && props.voiceText && <div className="lesson-status" aria-live="polite">{props.voiceText}</div>}

          {!props.completed && (
            <>
              <div className="lesson-card lesson-voice-card">
              <button className={props.voiceHeld ? 'voice-button listening' : 'voice-button'} onPointerDown={(event) => { event.currentTarget.setPointerCapture?.(event.pointerId); props.onVoiceStart() }} onPointerUp={props.onVoiceStop} onPointerCancel={props.onVoiceStop} onPointerLeave={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) props.onVoiceStop() }} disabled={props.thinking || props.voiceState === 'connecting' || props.voiceState === 'thinking'}>
                <span><Mic /></span><strong>{props.voiceHeld ? '松开完成' : '按住语音输入'}</strong><small>（按住按钮/空格，说完后松开）</small>
              </button>
              </div>
              {props.page === 'endgame' ? (
                <div className="lesson-card hint-card endgame-analysis-card">
                  <button className="secondary-button compact-action" onClick={props.onToggleEndgameAnalysis}><Target /> {props.endgameAnalysisVisible ? '收起引擎讲解' : '展开引擎讲解'}</button>
                  {props.endgameAnalysisVisible && (props.endgameAnalysisLoading || props.endgameAnalysis) && (
                    <div className="analysis-result">
                      {props.endgameAnalysis ? <><div className="analysis-recommendation"><strong>推荐走法：{props.endgameAnalysis.move}</strong><button className="analysis-speak-button" onClick={props.onSpeakEndgameAnalysis} aria-label="语音讲解残局推荐" title="语音讲解残局推荐"><Volume2 /></button></div><p>{props.endgameAnalysis.evaluation}</p><p>{props.endgameAnalysis.explanation}</p></> : <p>正在分析当前残局…</p>}
                    </div>
                  )}
                </div>
              ) : <div className="lesson-card hint-card"><div><Lightbulb /><strong>分级提示</strong><span>{props.hintLevel}/3</span></div><p>{props.hint}</p><button className="secondary-button compact-action" onClick={props.onHint} disabled={props.hintLevel >= 3}>{props.hintLevel >= 3 ? '已显示完整提示' : '再给我一点提示'}</button></div>}
            </>
          )}

          {props.completed && (
            <div className="lesson-card success-card">
              <div className="stars"><Star /><Star /><Star /></div>
              <h2>{props.terminalType}！</h2><p>{props.level.answer}</p>
              <div className="reward"><Sparkles /> 获得 {props.level.reward} 颗智慧星</div>
            </div>
          )}
          <div className="lesson-card lesson-actions"><button className="secondary-button lesson-reset-button" onClick={props.onReset}><RotateCcw /> 重新练习</button><button className="primary-button lesson-next-button" onClick={props.onContinue}>{props.completed ? (props.levelIndex < 2 ? '挑战下一关' : '继续下一题') : '跳过这题'} <ChevronRight /></button></div>
        </div>
      </aside>
    </div>
  )
}

function BattlePage({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const initialGame = useMemo(() => {
    const restored = createBattle()
    try {
      const savedMoves = JSON.parse(sessionStorage.getItem('zero7-battle-moves') ?? '[]') as string[]
      savedMoves.forEach((move) => restored.move(move))
    } catch {
      sessionStorage.removeItem('zero7-battle-moves')
    }
    return restored
  }, [])
  const game = useRef<Chess>(initialGame)
  const [pieces, setPieces] = useState(() => battlePieces(initialGame))
  const [selected, setSelected] = useState<Square | null>(null)
  const [targets, setTargets] = useState<Square[]>([])
  const [history, setHistory] = useState<string[]>(() => (initialGame.history({ verbose: true }) as Move[]).map((move) => move.zh))
  const [reviewHistory, setReviewHistory] = useState<string[]>([])
  const [lastPath, setLastPath] = useState<{ from: Square; to: Square; side: 'red' | 'black' } | null>(null)
  const pathTimer = useRef<number | null>(null)
  const turnReminderTimer = useRef<number | null>(null)
  const lastTurnReminderKey = useRef<string | null>(null)
  const moveRailRef = useRef<HTMLDivElement | null>(null)
  const [replayStep, setReplayStep] = useState<number | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const reviewMode = 'classic' as const
  const [classicGames, setClassicGames] = useState<ClassicGame[]>([])
  const [classicQuery, setClassicQuery] = useState('')
  const [classicLoading, setClassicLoading] = useState(false)
  const [classicGameId, setClassicGameId] = useState(() => sessionStorage.getItem('zero7-review-game') ?? '')
  const [reviewStep, setReviewStep] = useState(() => Number(sessionStorage.getItem('zero7-review-step') ?? 0))
  const [reviewPlaying, setReviewPlaying] = useState(false)
  const [reviewAnalysis, setReviewAnalysis] = useState<{ actual: string; recommended: string; actualPurpose: string; recommendedPurpose: string; sameMove: boolean; red: number; black: number } | null>(() => { try { return JSON.parse(sessionStorage.getItem('zero7-review-analysis') ?? 'null') } catch { return null } })
  const [reviewAnalysisVisible, setReviewAnalysisVisible] = useState(() => sessionStorage.getItem('zero7-review-analysis-visible') === 'true')
  const [reviewAnalysisLoading, setReviewAnalysisLoading] = useState(false)
  const [globalAnalysis, setGlobalAnalysis] = useState<{ step: number; move: string; redBefore: number; redAfter: number; swing: number; judgment: string }[]>([])
  const [globalAnalysisLoading, setGlobalAnalysisLoading] = useState(false)
  const [globalAnalysisProgress, setGlobalAnalysisProgress] = useState('')
  const reviewPositionRequestId = useRef(0)
  const reviewGlobalRequestId = useRef(0)
  const [status, setStatus] = useState('轮到红方走棋')
  const [difficulty, setDifficulty] = useState<EngineLevel>('初级')
  const difficultyDescriptions = { 入门: '皮卡鱼 2026-01-31\n入门 · 约 1280 Elo', 初级: '皮卡鱼 2026-01-31\n初级 · 约 1500 Elo', 中级: '皮卡鱼 2026-01-31\n中级 · 约 1900 Elo' } as const
  useEffect(() => {
    if (!reviewOpen || reviewMode !== 'classic') return
    const controller = new AbortController()
    setClassicLoading(true)
    fetch(`/api/classic-games?limit=50&q=${encodeURIComponent(classicQuery)}`, { signal: controller.signal })
      .then((response) => response.json() as Promise<{ items?: ClassicGame[] }>)
      .then((payload) => { const items = payload.items ?? []; setClassicGames(items); if (items[0]) { const nextId = items.some((item) => item.id === classicGameId) ? classicGameId : items[0].id; setClassicGameId(nextId); const selected = items.find((item) => item.id === nextId); if (selected?.moves) showReviewStep(nextId === classicGameId ? reviewStep : 0, 'classic', nextId, selected.moves, nextId === classicGameId) } })
      .catch(() => undefined)
      .finally(() => setClassicLoading(false))
    return () => controller.abort()
  }, [reviewOpen, reviewMode, classicQuery])
  useEffect(() => {
    if (!reviewOpen || reviewMode !== 'classic' || !classicGameId) return
    const selected = classicGames.find((item) => item.id === classicGameId)
    if (selected?.moves) { showReviewStep(reviewStep, 'classic', classicGameId, selected.moves, true); return }
    fetch(`/api/classic-games/${classicGameId}`)
      .then((response) => response.json() as Promise<ClassicGame>)
      .then((game) => { const sameGame = game.id === sessionStorage.getItem('zero7-review-game'); setClassicGames((items) => items.map((item) => item.id === game.id ? game : item)); showReviewStep(sameGame ? reviewStep : 0, 'classic', game.id, game.moves, sameGame) })
      .catch(() => setStatus('经典棋局加载失败，请稍后重试。'))
  }, [classicGameId, reviewOpen, reviewMode])
  const [thinking, setThinking] = useState(false)
  const [resigned, setResigned] = useState(() => sessionStorage.getItem('zero7-battle-resigned') === 'true')
  const [analysis, setAnalysis] = useState<{ red: number; black: number; move: string; explanation: string } | null>(null)
  const [analysisVisible, setAnalysisVisible] = useState(false)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [pendingVoiceAction, setPendingVoiceAction] = useState<'undo' | 'restart' | 'resign' | null>(null)
  const [engineStatus, setEngineStatus] = useState<'checking' | 'pikafish' | 'fallback'>('checking')
  const [engineName, setEngineName] = useState('正在检查 Pikafish…')
  const [voiceState, setVoiceState] = useState<LinxiState>('idle')
  const [voiceText, setVoiceText] = useState(() => battleVoicePrompt(initialGame))
  const [voiceHeld, setVoiceHeld] = useState(false)
  const voicePressStartedAt = useRef<number | null>(null)
  const battleVoiceClient = useRef<LinxiVoiceClient | null>(null)
  const battleSpeechClient = useRef<LinxiVoiceClient | null>(null)
  const battleSpeechQueue = useRef(Promise.resolve())
  const battleVoiceState = useRef<LinxiState>('idle')
  const voiceMoveAuthorization = useRef(new VoiceMoveAuthorization())
  const ignoreBattleReplies = useRef(false)
  const aiRequestId = useRef(0)
  const startBattleVoiceRef = useRef<(() => void) | undefined>(undefined)
  const stopBattleVoiceRef = useRef<(() => void) | undefined>(undefined)

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
    scheduleTurnReminder()
    return () => {
      aiRequestId.current += 1
      authorization.cancel()
      voicePressStartedAt.current = null
      setVoiceHeld(false)
      battleVoiceClient.current?.disconnect()
      battleSpeechClient.current?.disconnect()
      battleSpeechClient.current = null
      battleSpeechQueue.current = Promise.resolve()
      if (turnReminderTimer.current !== null) window.clearTimeout(turnReminderTimer.current)
    }
  }, [])

  useEffect(() => {
    if (replayStep !== null) return
    const rail = moveRailRef.current
    if (!rail) return
    if (typeof rail.scrollTo === 'function') rail.scrollTo({ top: rail.scrollHeight, behavior: history.length > 2 ? 'smooth' : 'auto' })
    else rail.scrollTop = rail.scrollHeight
  }, [history, replayStep])

  const scheduleTurnReminder = () => {
    if (turnReminderTimer.current !== null) window.clearTimeout(turnReminderTimer.current)
    turnReminderTimer.current = null
    const moves = game.current.history({ verbose: true }) as Move[]
    const reminderKey = moves.map((move) => move.lan).join('|')
    if (reviewOpen || game.current.isGameOver() || game.current.turn() !== 'w' || moves.at(-1)?.color !== 'b' || replayStep !== null || thinking || resigned || lastTurnReminderKey.current === reminderKey) return
    turnReminderTimer.current = window.setTimeout(() => {
      turnReminderTimer.current = null
      const currentMoves = game.current.history({ verbose: true }) as Move[]
      if (reviewOpen || game.current.isGameOver() || game.current.turn() !== 'w' || currentMoves.at(-1)?.color !== 'b' || replayStep !== null || thinking || resigned) return
      const inCheck = game.current.isCheck()
      const reminder = inCheck ? '将军，请先应将。' : '轮到你继续走棋。'
      lastTurnReminderKey.current = reminderKey
      void speakBattleText(reminder, inCheck)
    }, BATTLE_RULES.turnReminderDelayMs)
  }

  const refresh = (lastMove?: Move) => {
    setLastPath(lastMove ? { from: squareToPoint(lastMove.from), to: squareToPoint(lastMove.to), side: lastMove.color === 'w' ? 'red' : 'black' } : null)
    if (pathTimer.current !== null) window.clearTimeout(pathTimer.current)
    pathTimer.current = lastMove ? window.setTimeout(() => { setLastPath(null); pathTimer.current = null }, BATTLE_RULES.movePathDisplayMs) : null
    setPieces(battlePieces(game.current))
    setHistory((game.current.history({ verbose: true }) as Move[]).map((move) => move.zh))
    sessionStorage.setItem('zero7-battle-moves', JSON.stringify(game.current.history()))
    setReplayStep(null)
    setStatus(battleStatus(game.current))
    scheduleTurnReminder()
  }

  const prepareBattleSpeech = () => {
    if (!battleSpeechClient.current) battleSpeechClient.current = new LinxiVoiceClient(() => {})
    void battleSpeechClient.current.prepareAudio().catch(() => undefined)
  }

  const speakBattleText = (text: string, showText = true) => {
    if (showText) setVoiceText(text)
    battleSpeechQueue.current = battleSpeechQueue.current.then(async () => {
      const client = battleSpeechClient.current ?? new LinxiVoiceClient(() => {})
      battleSpeechClient.current = client
      try {
        await client.speakText(text)
        await client.waitForPlayback()
        await new Promise((resolve) => window.setTimeout(resolve, BATTLE_RULES.voicePlaybackSettleMs))
      } catch {
        updateBattleVoiceState('error')
      }
    })
  }


  const aiTurn = async (playerMove: Move) => {
    ignoreBattleReplies.current = false
    const requestId = ++aiRequestId.current
    if (game.current.isGameOver()) {
      void speakBattleText(describePlayerMove(playerMove))
      return
    }
    void speakBattleText(describePlayerMove(playerMove))
    await new Promise((resolve) => window.setTimeout(resolve, BATTLE_RULES.aiThinkDelayMs))
    if (requestId !== aiRequestId.current || ignoreBattleReplies.current) return
    if (turnReminderTimer.current !== null) window.clearTimeout(turnReminderTimer.current)
    turnReminderTimer.current = null
    setThinking(true)
    setStatus(`${BATTLE_RULES.brandName}正在思考…`)
    if (requestId !== aiRequestId.current || game.current.turn() !== 'b') return
    let aiMove: Move | null = null
    try {
      if (engineStatus === 'pikafish') {
        const fen = game.current.fen()
        const result = await getPikafishMove(fen, difficulty)
        if (requestId !== aiRequestId.current || game.current.fen() !== fen || game.current.turn() !== 'b') return
        if (!result.move) throw new Error('Pikafish 没有返回可执行走法')
        aiMove = game.current.move(result.move)
        if (!aiMove) throw new Error('Pikafish 返回了无效应手')
      } else {
        if (requestId !== aiRequestId.current || game.current.turn() !== 'b') return
        const choice = chooseAiMove(game.current, difficulty)
        if (choice) aiMove = game.current.move({ from: choice.from, to: choice.to })
        if (!aiMove) throw new Error('基础 AI 没有返回有效应手')
      }
    } catch {
      if (requestId !== aiRequestId.current || game.current.turn() !== 'b') return
      setEngineStatus('fallback')
      setEngineName('基础 AI（Pikafish 暂不可用）')
      await new Promise((resolve) => window.setTimeout(resolve, BATTLE_RULES.aiThinkDelayMs))
      const choice = chooseAiMove(game.current, difficulty)
      if (choice) aiMove = game.current.move({ from: choice.from, to: choice.to })
      if (!aiMove) {
        setThinking(false)
        setStatus(`${BATTLE_RULES.brandName}暂时无法走棋，请重新开始本局。`)
        return
      }
    } finally {
      if (requestId === aiRequestId.current) {
        if (aiMove) refresh(aiMove)
        setThinking(false)
        if (analysisVisible && aiMove) void analyzePosition()
        if (!ignoreBattleReplies.current && aiMove) void speakBattleText(describeAiResponse(aiMove))
      }
    }
  }

  const playBattleMove = (move: Move) => {
    prepareBattleSpeech()
    setSelected(null)
    setTargets([])
    refresh(move)
    setVoiceText(`已识别为“${move.zh}”，${BATTLE_RULES.brandName}正在思考。`)
    void aiTurn(move)
  }

  const stopBattleVoice = async () => {
    const startedAt = voicePressStartedAt.current
    voicePressStartedAt.current = null
    setVoiceHeld(false)
    if (startedAt === null) return
    if (Date.now() - startedAt < MIN_VOICE_HOLD_MS) {
      battleVoiceClient.current?.disconnect()
      voiceMoveAuthorization.current.cancel()
      updateBattleVoiceState('idle')
      return
    }
    if (battleVoiceState.current === 'listening' || battleVoiceState.current === 'thinking') await battleVoiceClient.current?.stop()
  }

  const handleBattleCommand = (command: VoiceCommand) => {
    if (command.type === 'battle.start' && command.level) {
      setDifficulty(command.level)
      restart()
      setVoiceText(`已切换为${command.level}棋力。`)
      return true
    }
    if (pendingVoiceAction && (command.type === 'confirm' || command.type === 'cancel')) {
      const action = pendingVoiceAction
      setPendingVoiceAction(null)
      if (command.type === 'cancel') { setVoiceText('已取消。'); return true }
      if (action === 'undo') undo()
      if (action === 'restart') restart()
      if (action === 'resign') { if (turnReminderTimer.current !== null) window.clearTimeout(turnReminderTimer.current); turnReminderTimer.current = null; setResigned(true); sessionStorage.setItem('zero7-battle-resigned', 'true'); setStatus(`你已认输，本局由 ${BATTLE_RULES.brandName} 获胜。`) }
      setVoiceText('已确认。')
      return true
    }
    if (command.type === 'battle.undo' || command.type === 'battle.restart' || command.type === 'battle.resign') {
      setPendingVoiceAction(command.type === 'battle.undo' ? 'undo' : command.type === 'battle.restart' ? 'restart' : 'resign')
      setVoiceText('请说确认或取消。')
      return true
    }
    if (command.type === 'analysis.show') { setAnalysisVisible(true); if (!analysis) void analyzePosition(); return true }
    if (command.type === 'analysis.hide') { setAnalysisVisible(false); return true }
    if (command.type === 'analysis.recommend') { if (!analysis) void analyzePosition(); setAnalysisVisible(true); return true }
    if (command.type === 'review.previous' && replayStep !== null) { replayMove(Math.max(1, replayStep - 1)); return true }
    if (command.type === 'review.next' && replayStep !== null) { replayMove(Math.min(history.length, replayStep + 1)); return true }
    if (command.type === 'review.exit' && replayStep !== null) { returnToCurrentPosition(); return true }
    if (command.type === 'help') { setVoiceText(commandHelp('battle')); return true }
    return false
  }

  const handleBattleTranscript = (text: string) => {
    if (!voiceMoveAuthorization.current.consume()) return
    const command = parseVoiceCommand(text)
    if (handleBattleCommand(command)) return
    if (reviewOpen || replayStep !== null || thinking || game.current.isGameOver() || game.current.turn() !== 'w') return
    const move = findVoiceMove(game.current, text)
    if (!move) {
      battleVoiceClient.current?.disconnect()
      updateBattleVoiceState('idle')
      ignoreBattleReplies.current = true
      const message = isChessMoveTranscript(text)
        ? BATTLE_RULES.invalidMovePrompt(text)
        : BATTLE_RULES.unclearMovePrompt(text)
      setVoiceText(message)
      setStatus(isChessMoveTranscript(text) ? '这步棋现在不能走，请重新说。' : '没听明白，请重新说。')
      void speakBattleText(message)
      return
    }
    battleVoiceClient.current?.disconnect()
    playBattleMove(game.current.move({ from: move.from, to: move.to }))
  }

  function createBattleVoiceClient() {
    const client = new LinxiVoiceClient((event) => {
      if (event.type === 'state' && event.state) updateBattleVoiceState(event.state)
      if (event.type === 'transcript' && event.text) handleBattleTranscript(event.text)
      if (event.type === 'reply' && event.text && !ignoreBattleReplies.current) setVoiceText(event.text)
      if (event.type === 'error' && event.text) {
        updateBattleVoiceState('error')
        setVoiceText(event.text)
      }
    })
    battleVoiceClient.current = client
    return client
  }

  const startBattleVoice = async () => {
    if (!window.isSecureContext) {
      setVoiceText('手机语音输入需要使用 HTTPS，请访问终端显示的 https:// 地址。')
      updateBattleVoiceState('error')
      return
    }
    if (reviewOpen || replayStep !== null || thinking || game.current.isGameOver() || game.current.turn() !== 'w') return
    if (battleVoiceState.current === 'listening' || battleVoiceState.current === 'connecting') return
    battleVoiceClient.current?.disconnect()
    voiceMoveAuthorization.current.cancel()
    prepareBattleSpeech()
    const client = createBattleVoiceClient()
    setVoiceText('正在连接零七，请准备说出走法…')
    try {
      await client.start()
      voiceMoveAuthorization.current.arm()
      setVoiceText('我在听，请说出中文棋谱，松开后完成识别。')
    } catch (error) {
      voiceMoveAuthorization.current.cancel()
      client.disconnect()
      updateBattleVoiceState('error')
      setVoiceText(error instanceof Error ? error.message : '灵矽连接失败')
    }
  }

  const handleSquare = (square: Square) => {
    if (reviewOpen || thinking || game.current.isGameOver() || game.current.turn() !== 'w') return
    voiceMoveAuthorization.current.cancel()
    if (battleVoiceState.current === 'listening' || battleVoiceState.current === 'thinking') battleVoiceClient.current?.disconnect()
    const activePieces = replayStep !== null ? battlePieces(game.current) : pieces
    if (replayStep !== null) {
      setPieces(activePieces)
      setReplayStep(null)
      setLastPath(null)
      setStatus(battleStatus(game.current))
    }
    const piece = activePieces.find((item) => sameSquare(item, square))
    if (replayStep !== null || !selected) {
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

  const replayMove = (step: number) => {
    if (thinking) return
    const replayGame = createBattle()
    const moves = game.current.history({ verbose: true }) as Move[]
    moves.slice(0, step).forEach((move) => replayGame.move({ from: move.from, to: move.to }))
    const replayMoveData = moves[step - 1]
    setLastPath(replayMoveData ? { from: squareToPoint(replayMoveData.from), to: squareToPoint(replayMoveData.to), side: replayMoveData.color === 'w' ? 'red' : 'black' } : null)
    if (pathTimer.current !== null) window.clearTimeout(pathTimer.current)
    pathTimer.current = replayMoveData ? window.setTimeout(() => { setLastPath(null); pathTimer.current = null }, BATTLE_RULES.movePathDisplayMs) : null
    setPieces(battlePieces(replayGame))
    setSelected(null)
    setTargets([])
    setReplayStep(step)
    setStatus(`正在复盘第 ${step} 步，共 ${moves.length} 步`)
  }

  const returnToCurrentPosition = () => {
    setPieces(battlePieces(game.current))
    setReplayStep(null)
    setLastPath(null)
    setStatus(battleStatus(game.current))
  }

  const analyzePosition = async () => {
    if (analysisLoading || replayStep !== null || engineStatus !== 'pikafish') return
    setAnalysisLoading(true)
    try {
      const result = await getPikafishMove(game.current.fen(), difficulty, true)
      const score = result.score?.type === 'mate' ? (result.score.value > 0 ? 10000 : -10000) : (result.score?.value ?? 0)
      const red = Math.round(100 / (1 + Math.exp(-score / 180)))
      const analysisGame = new Chess(game.current.fen())
      const recommendedMove = result.move ? analysisGame.move(result.move) : null
      const move = recommendedMove?.zh ?? '当前无合法着法'
      let purpose = '改善子力位置，争取后续主动。'
      if (recommendedMove) {
        if (analysisGame.isCheckmate()) purpose = '形成绝杀，立即结束对局。'
        else if (analysisGame.isCheck()) purpose = '直接将军，迫使对方应将。'
        else if (recommendedMove.captured) purpose = `吃掉对方${recommendedMove.captured}，取得子力收益。`
        else if (/^[a-i][09]$/.test(recommendedMove.from)) purpose = '调动底线子力，使棋子更快参与进攻和防守。'
        else if (['d', 'e', 'f'].includes(recommendedMove.to[0])) purpose = '加强中路控制，限制对方子力活动。'
        else purpose = '调整子力位置，同时改善进攻和防守的协调。'
      }
      const explanation = `这步的目的：${purpose}`
      setAnalysis({ red, black: 100 - red, move, explanation })
    } catch {
      setAnalysis(null)
      setStatus('当前无法获取胜负概率，请确认 Pikafish 可用。')
    } finally {
      setAnalysisLoading(false)
    }
  }

  const openReview = () => {
    if (turnReminderTimer.current !== null) window.clearTimeout(turnReminderTimer.current)
    turnReminderTimer.current = null
    battleVoiceClient.current?.disconnect()
    voiceMoveAuthorization.current.cancel()
    setVoiceHeld(false)
    setSelected(null)
    setTargets([])
    setReviewOpen(true)
  }

  const closeReview = () => {
    reviewPositionRequestId.current += 1
    reviewGlobalRequestId.current += 1
    setReviewOpen(false)
    setReviewPlaying(false)
    setReviewAnalysisLoading(false)
    setGlobalAnalysisLoading(false)
    setPieces(battlePieces(game.current))
    setLastPath(null)
    setStatus(battleStatus(game.current))
    window.setTimeout(scheduleTurnReminder, 0)
  }

  const reviewMoves = (mode = reviewMode, gameId = classicGameId) => mode === 'classic'
    ? (classicGames.find((item) => item.id === gameId) ?? classicGames[0])?.moves ?? []
    : (game.current.history({ verbose: true }) as Move[]).map((move) => `${move.from}${move.to}`)

  const showReviewStep = (step: number, mode = reviewMode, gameId = classicGameId, suppliedMoves?: string[], preserveAnalysis = false) => {
    reviewPositionRequestId.current += 1
    const moves = suppliedMoves ?? reviewMoves(mode, gameId)
    const nextStep = Math.max(0, Math.min(step, moves.length))
    const replayGame = createBattle()
    moves.slice(0, nextStep).forEach((move) => replayGame.move(move))
    const verbose = replayGame.history({ verbose: true }) as Move[]
    const fullGame = createBattle()
    moves.forEach((move) => fullGame.move(move))
    const fullVerbose = fullGame.history({ verbose: true }) as Move[]
    const lastMove = verbose.at(-1)
    setPieces(battlePieces(replayGame))
    setLastPath(lastMove ? { from: squareToPoint(lastMove.from), to: squareToPoint(lastMove.to), side: lastMove.color === 'w' ? 'red' : 'black' } : null)
    setReviewStep(nextStep)
    sessionStorage.setItem('zero7-review-step', String(nextStep))
    if (gameId) sessionStorage.setItem('zero7-review-game', gameId)
    setReviewHistory(fullVerbose.map((move) => move.zh))
    if (!reviewAnalysisVisible && !preserveAnalysis) {
      setReviewAnalysis(null)
      sessionStorage.removeItem('zero7-review-analysis')
    }
    setStatus(`复盘第 ${nextStep} 步，共 ${moves.length} 步`)
  }

  const analyzeReviewStep = async () => {
    const requestId = ++reviewPositionRequestId.current
    const moves = reviewMoves()
    const reviewGame = createBattle()
    moves.slice(0, reviewStep).forEach((move) => reviewGame.move(move))
    const fen = reviewGame.fen()
    setReviewAnalysisLoading(true)
    try {
      const result = await getPikafishMove(fen, '中级', true)
      if (requestId !== reviewPositionRequestId.current) return
      const actualGame = new Chess(fen)
      const recommendedMove = result.move ? actualGame.move(result.move) : null
      const actualUci = moves[reviewStep]
      const actualLine = new Chess(fen)
      const actualMove = actualUci ? actualLine.move(actualUci) : null
      const recommended = recommendedMove?.zh ?? '当前没有合法着法'
      const actual = actualMove?.zh ?? '对局已经结束'
      const inferPurpose = (line: Chess, move: Move | null) => {
        if (!move) return '当前没有可分析的后续着法。'
        const pieceNames: Record<string, string> = { k: '将', a: '士', b: '象', n: '马', r: '车', c: '炮', p: '兵' }
        if (line.isCheckmate()) return '形成绝杀，立即结束对局。'
        if (line.isCheck()) return '直接将军，迫使对方应将。'
        if (move.captured) return `吃掉对方${pieceNames[move.captured] ?? '棋子'}，取得子力收益。`
        if (/^[a-i][09]$/.test(move.from)) return '调动底线子力，使棋子更快参与进攻和防守。'
        if (['d', 'e', 'f'].includes(move.to[0])) return '加强中路控制，限制对方子力活动。'
        return '调整子力位置，同时改善进攻和防守的协调。'
      }
      const actualPurpose = inferPurpose(actualLine, actualMove)
      const recommendedPurpose = inferPurpose(actualGame, recommendedMove)
      const score = result.score?.type === 'mate' ? (result.score.value > 0 ? 10000 : -10000) : (result.score?.value ?? 0)
      const redScore = reviewGame.turn() === 'w' ? score : -score
      const red = Math.round(100 / (1 + Math.exp(-redScore / 180)))
      const analysis = { actual, recommended, actualPurpose, recommendedPurpose, sameMove: Boolean(actualUci && result.move === actualUci), red, black: 100 - red }
      setReviewAnalysis(analysis)
      sessionStorage.setItem('zero7-review-analysis', JSON.stringify(analysis))
    } catch {
      setStatus('当前复盘局面分析失败，请稍后重试。')
    } finally {
      if (requestId === reviewPositionRequestId.current) setReviewAnalysisLoading(false)
    }
  }

  useEffect(() => {
    if (reviewOpen && reviewAnalysisVisible) void analyzeReviewStep()
  }, [reviewOpen, reviewAnalysisVisible, reviewStep, classicGameId])
  useEffect(() => {
    if (!reviewPlaying) return
    const total = reviewMoves().length
    if (reviewStep >= total) { setReviewPlaying(false); return }
    const timer = window.setTimeout(() => {
      const nextStep = reviewStep + 1
      showReviewStep(nextStep)
      const notation = reviewHistory[nextStep - 1]
      if (notation) void speakBattleText(notation, false)
    }, 5_000)
    return () => window.clearTimeout(timer)
  }, [reviewPlaying, reviewStep, classicGameId])

  const analyzeGlobalReview = async () => {
    const moves = reviewMoves()
    if (moves.length === 0) return
    const requestId = ++reviewGlobalRequestId.current
    const deadline = performance.now() + 29_000
    const probability = (result: Awaited<ReturnType<typeof getPikafishMove>>, turn: 'w' | 'b') => {
      const score = result.score?.type === 'mate' ? (result.score.value > 0 ? 10000 : -10000) : (result.score?.value ?? 0)
      const redScore = turn === 'w' ? score : -score
      return Math.round(100 / (1 + Math.exp(-redScore / 180)))
    }
    setGlobalAnalysisLoading(true)
    setGlobalAnalysisProgress('快速扫描 0%')
    try {
      const positions: { fen: string; turn: 'w' | 'b' }[] = []
      const replay = createBattle()
      const moveNames: string[] = []
      for (let step = 0; step <= moves.length; step += 1) {
        positions.push({ fen: replay.fen(), turn: replay.turn() })
        if (step < moves.length) {
          const move = replay.move(moves[step])
          moveNames.push(move?.zh ?? moves[step])
        }
      }
      const fastTime = Math.max(100, Math.min(220, Math.floor(18_000 / positions.length)))
      const evaluations: number[] = []
      for (let step = 0; step < positions.length; step += 1) {
        if (performance.now() >= deadline) break
        const position = positions[step]
        const result = await getPikafishMove(position.fen, '中级', true, undefined, fastTime)
        if (requestId !== reviewGlobalRequestId.current) return
        evaluations.push(probability(result, position.turn))
        setGlobalAnalysisProgress(`快速扫描 ${Math.round(((step + 1) / positions.length) * 100)}%`)
      }
      const candidates = moves.slice(0, Math.max(0, evaluations.length - 1)).map((move, index) => ({
        step: index + 1, move: moveNames[index] ?? move, redBefore: evaluations[index], redAfter: evaluations[index + 1], swing: Math.abs(evaluations[index + 1] - evaluations[index]),
      })).sort((a, b) => b.swing - a.swing).slice(0, 6)
      setGlobalAnalysisProgress('深度复核关键步')
      const refined = []
      for (const candidate of candidates) {
        if (performance.now() + 1_200 >= deadline) break
        const beforePosition = positions[candidate.step - 1]
        const afterPosition = positions[candidate.step]
        const [before, after] = await Promise.all([
          getPikafishMove(beforePosition.fen, '中级', true, undefined, 450),
          getPikafishMove(afterPosition.fen, '中级', true, undefined, 450),
        ])
        if (requestId !== reviewGlobalRequestId.current) return
        const redBefore = probability(before, beforePosition.turn)
        const redAfter = probability(after, afterPosition.turn)
        const swing = Math.abs(redAfter - redBefore)
        refined.push({ ...candidate, redBefore, redAfter, swing, judgment: swing >= 15 ? '关键转折' : swing >= 8 ? '局势变化' : '局面波动' })
      }
      const result = refined.sort((a, b) => b.swing - a.swing).filter((item) => item.swing >= 5).slice(0, 8).sort((a, b) => a.step - b.step)
      const fallback = candidates.slice(0, 5).map((item) => ({ ...item, judgment: item.swing >= 8 ? '局势变化' : '局面波动' })).sort((a, b) => a.step - b.step)
      setGlobalAnalysis(result.length > 0 ? result : fallback)
      setGlobalAnalysisProgress('')
    } catch {
      setStatus('全局分析失败，请稍后重试。')
      setGlobalAnalysisProgress('')
    } finally {
      if (requestId === reviewGlobalRequestId.current) setGlobalAnalysisLoading(false)
    }
  }

  const reviewBattle = () => {
    void speakBattleText(buildBattleReview(game.current, resigned))
  }

  const restart = () => {
    aiRequestId.current += 1
    reviewPositionRequestId.current += 1
    reviewGlobalRequestId.current += 1
    setReviewAnalysis(null)
    setReviewAnalysisLoading(false)
    game.current = createBattle()
    setPieces(battlePieces(game.current))
    setHistory([])
    sessionStorage.removeItem('zero7-battle-moves')
    sessionStorage.removeItem('zero7-battle-resigned')
    setLastPath(null)
    if (pathTimer.current !== null) window.clearTimeout(pathTimer.current)
    pathTimer.current = null
    setSelected(null)
    setTargets([])
    setReplayStep(null)
    setAnalysis(null)
    setAnalysisVisible(false)
    setResigned(false)
    setStatus('轮到红方走棋')
    setThinking(false)
    voiceMoveAuthorization.current.cancel()
    battleVoiceClient.current?.disconnect()
    updateBattleVoiceState('idle')
    setVoiceText(battleVoicePrompt(game.current))
    scheduleTurnReminder()
  }

  const undo = () => {
    if (thinking || history.length === 0 || replayStep !== null) return
    aiRequestId.current += 1
    game.current.undo()
    if (game.current.turn() === 'b' && game.current.history().length > 0) game.current.undo()
    setSelected(null)
    setTargets([])
    setLastPath(null)
    if (pathTimer.current !== null) window.clearTimeout(pathTimer.current)
    pathTimer.current = null
    setReplayStep(null)
    setStatus(battleStatus(game.current))
    setPieces(battlePieces(game.current))
    setHistory((game.current.history({ verbose: true }) as Move[]).map((move) => move.zh))
    setThinking(false)
    scheduleTurnReminder()
  }

  startBattleVoiceRef.current = startBattleVoice
  stopBattleVoiceRef.current = stopBattleVoice

  useEffect(() => {
    const handleSpaceDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      event.preventDefault()
      if (event.repeat) return
      voicePressStartedAt.current = Date.now()
      setVoiceHeld(true)
      void startBattleVoiceRef.current?.()
    }
    const handleSpaceUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      event.preventDefault()
      void stopBattleVoiceRef.current?.()
    }
    window.addEventListener('keydown', handleSpaceDown)
    window.addEventListener('keyup', handleSpaceUp)
    return () => {
      window.removeEventListener('keydown', handleSpaceDown)
      window.removeEventListener('keyup', handleSpaceUp)
    }
  }, [])

  const selectedPiece = selected ? pieces.find((item) => sameSquare(item, selected)) : undefined
  return (
    <div className={`battle-page page-wrap ${reviewOpen ? 'review-page' : ''}`}>
      <section className="battle-layout">
        <div className="battle-board-column">
          <div className="board-panel battle-board-panel">
            <div className="battle-move-rail" ref={moveRailRef} aria-label="对局棋谱">{Array.from({ length: Math.ceil((reviewOpen ? reviewHistory.length : history.length) / 2) }, (_, index) => <div className="battle-move-turn" key={index}><span>{index + 1}.</span><div><button className={replayStep === index * 2 + 1 ? 'move-replay active' : 'move-replay'} onClick={() => reviewOpen ? showReviewStep(index * 2 + 1) : replayMove(index * 2 + 1)}>{(reviewOpen ? reviewHistory : history)[index * 2]}</button>{(reviewOpen ? reviewHistory : history)[index * 2 + 1] && <button className={replayStep === index * 2 + 2 ? 'move-replay active' : 'move-replay'} onClick={() => reviewOpen ? showReviewStep(index * 2 + 2) : replayMove(index * 2 + 2)}>{(reviewOpen ? reviewHistory : history)[index * 2 + 1]}</button>}</div></div>)}</div>
            <ChessBoard pieces={pieces} selectedId={selectedPiece?.id ?? null} legalTargets={targets} lastPath={lastPath} onSquare={handleSquare} />
            {reviewOpen && globalAnalysis.length > 0 && <div className="battle-key-rail" aria-label="全局分析关键步"><strong>关键步</strong>{globalAnalysis.map((item) => <button key={item.step} className="global-analysis-item" onClick={() => showReviewStep(item.step)}><span>第{item.step}步 · {item.move}</span><small>{item.judgment} · 红方 {item.redBefore}% → {item.redAfter}%</small></button>)}</div>}
          </div>
          <button className={`mobile-battle-voice ${voiceHeld ? 'listening' : ''}`} onPointerDown={(event) => { event.currentTarget.setPointerCapture?.(event.pointerId); voicePressStartedAt.current = Date.now(); setVoiceHeld(true); void startBattleVoice() }} onPointerUp={() => void stopBattleVoice()} onPointerCancel={() => void stopBattleVoice()} onContextMenu={(event) => event.preventDefault()} aria-label={voiceHeld ? '松开完成' : '按住语音输入'} disabled={reviewOpen || replayStep !== null || thinking || voiceState === 'connecting' || voiceState === 'thinking' || game.current.turn() !== 'w'}><Mic /><span><strong>{voiceHeld ? '松开完成' : '按住语音输入'}</strong><small>（按住按钮/空格，说完后松开）</small></span></button>
        </div>
        <aside className="battle-sidebar">
          <SideNavigation active="battle" onNavigate={onNavigate} />
          {reviewOpen && <div className="battle-review-panel battle-review-rail" aria-label="复盘控制">
            <div className="review-head"><strong>AI复盘 · 经典对局</strong><button className="secondary-button compact-action" onClick={closeReview}>返回对战</button></div>
            {reviewMode === 'classic' && <><input aria-label="搜索经典对局" placeholder="搜索赛事或棋手" value={classicQuery} onChange={(event) => setClassicQuery(event.target.value)} /><select aria-label="选择经典对局" value={classicGameId} disabled={classicLoading || classicGames.length === 0} onChange={(event) => { setReviewPlaying(false); reviewGlobalRequestId.current += 1; setGlobalAnalysisLoading(false); setGlobalAnalysis([]); setClassicGameId(event.target.value); setReviewHistory([]); setReviewStep(0) }}>{classicGames.map((item) => <option key={item.id} value={item.id}>{item.event} · {item.red} vs {item.black}</option>)}</select></>}
            <div className="review-navigation"><strong>{reviewStep} / {reviewMoves().length}</strong><div className="review-navigation-buttons"><button onClick={() => { setReviewPlaying(false); showReviewStep(0) }} disabled={reviewStep === 0} aria-label="开局" title="开局"><SkipBack /></button><button onClick={() => { setReviewPlaying(false); showReviewStep(reviewStep - 1) }} disabled={reviewStep === 0} aria-label="上一步" title="上一步"><ChevronLeft /></button><button onClick={() => { setReviewPlaying(false); showReviewStep(reviewStep + 1) }} disabled={reviewStep >= reviewMoves().length} aria-label="下一步" title="下一步"><ChevronRight /></button><button onClick={() => { setReviewPlaying(false); showReviewStep(reviewMoves().length) }} disabled={reviewStep >= reviewMoves().length} aria-label="终局" title="终局"><SkipForward /></button><button onClick={() => setReviewPlaying((playing) => !playing)} disabled={reviewStep >= reviewMoves().length} aria-label={reviewPlaying ? '停止自动播放' : '自动播放'} title={reviewPlaying ? '停止自动播放' : '自动播放'}>{reviewPlaying ? <Pause /> : <Play />}</button></div></div>
            <div className="review-analysis-card"><div className="review-analysis-heading"><strong>局面分析</strong>{reviewAnalysisLoading && <span>正在更新分析…</span>}</div><button className="primary-button review-analyze-button" onClick={() => { const visible = !reviewAnalysisVisible; setReviewAnalysisVisible(visible); sessionStorage.setItem('zero7-review-analysis-visible', String(visible)) }} >{reviewAnalysisVisible ? '收起局面分析' : '展开局面分析'}</button>{reviewAnalysisVisible && <div className="analysis-result review-analysis-result">{reviewAnalysis && <><div className="probability-row"><span>红方 {reviewAnalysis.red}%</span><span>黑方 {reviewAnalysis.black}%</span></div><div className="probability-bar"><i style={{ width: `${reviewAnalysis.red}%` }} /></div><p>实战着：{reviewAnalysis.actual}</p><p>实战目的：{reviewAnalysis.actualPurpose}</p>{reviewStep >= 2 && !reviewAnalysis.sameMove && <><p>推荐着：{reviewAnalysis.recommended}</p><p>推荐目的：{reviewAnalysis.recommendedPurpose}</p></>}</>}</div>}</div>
            <div className="review-global-card"><strong>全局分析</strong><button className="secondary-button review-global-button" onClick={() => void analyzeGlobalReview()} disabled={globalAnalysisLoading}>{globalAnalysisLoading ? (globalAnalysisProgress || '正在进行全局分析…') : '分析关键步'}</button></div>
          </div>}
          {!reviewOpen && <><div className="battle-card engine-card"><div className="battle-side-actions"><div className="difficulty-inline" aria-label="选择棋力">{(['入门', '初级', '中级'] as const).map((item) => <button key={item} className={difficulty === item ? 'active' : ''} onClick={() => setDifficulty(item)} aria-describedby={`difficulty-${item}`} data-tooltip={difficultyDescriptions[item]}>{item}</button>)}</div><span className="visually-hidden" id="difficulty-入门">{difficultyDescriptions.入门}</span><span className="visually-hidden" id="difficulty-初级">{difficultyDescriptions.初级}</span><span className="visually-hidden" id="difficulty-中级">{difficultyDescriptions.中级}</span><button className="secondary-button battle-restart-button" onClick={restart}><RotateCcw /> 重开一局</button></div><span className="visually-hidden" aria-live="polite">{engineName}</span></div>
          <div className="battle-card battle-voice-card">
            {!['轮到红方走棋', `${BATTLE_RULES.brandName}正在思考…`, '轮到你继续走棋。'].includes(status) && <p className="battle-message">{status}</p>}
            <div className="coach-head compact"><div className="coach-avatar small">象</div><div><strong>语音走棋与讲解</strong><span>{voiceStateLabel(voiceState)}</span></div><span className={`connection-dot ${voiceState}`} /></div>
            <p>{voiceText}</p>
            <button className={voiceHeld ? 'voice-button listening' : 'voice-button'} onPointerDown={(event) => { event.currentTarget.setPointerCapture?.(event.pointerId); voicePressStartedAt.current = Date.now(); setVoiceHeld(true); void startBattleVoice() }} onPointerUp={() => void stopBattleVoice()} onPointerCancel={() => void stopBattleVoice()} disabled={reviewOpen || replayStep !== null || thinking || voiceState === 'connecting' || voiceState === 'thinking' || game.current.turn() !== 'w'}><span><Mic /></span><strong>{voiceHeld ? '松开完成' : '按住语音输入'}</strong><small>（按住按钮/空格，说完后松开）</small></button>
          </div>

          {replayStep !== null && <button className="secondary-button full" onClick={returnToCurrentPosition}>返回当前局面</button>}
          <div className="battle-actions"><button className="secondary-button" onClick={undo} disabled={thinking || history.length === 0}><RotateCcw /> 悔棋</button><button className="secondary-button" onClick={() => { if (turnReminderTimer.current !== null) window.clearTimeout(turnReminderTimer.current); turnReminderTimer.current = null; setResigned(true); sessionStorage.setItem('zero7-battle-resigned', 'true'); setStatus(`你已认输，本局由 ${BATTLE_RULES.brandName} 获胜。`) }}>认输</button></div>
          {!reviewOpen && engineStatus === 'pikafish' && <div className="battle-card analysis-card"><button className="secondary-button full compact-action" onClick={() => { if (analysisVisible) setAnalysisVisible(false); else { setAnalysisVisible(true); if (!analysis) void analyzePosition() } }} disabled={replayStep !== null}><Target /> {analysisLoading ? '正在分析…' : analysisVisible ? '收起局面分析' : '局面分析'}</button>{analysisVisible && (analysis || analysisLoading) && <div className="analysis-result">{analysis ? <><div className="probability-row"><span>红方 {analysis.red}%</span><span>黑方 {analysis.black}%</span></div><div className="probability-bar"><i style={{ width: `${analysis.red}%` }} /></div><div className="analysis-recommendation"><strong>推荐走法：{analysis.move}</strong></div><p>{analysis.explanation}</p></> : <p>正在分析当前局面…</p>}</div>}</div>}
          {(resigned || game.current.isGameOver()) && <button className="secondary-button full review-button" onClick={reviewBattle}><Volume2 /> 语音总结</button>}
          <button className="secondary-button full review-button" onClick={openReview}><BookOpen /> AI复盘</button>
          </>}
        </aside>
      </section>
    </div>
  )
}

function isTextInput(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable)
}

function isRepeatedClosingReply(text: string) {
  return /时间过得真快|期待和你下次对弈|期待和你下次再对弈/.test(text)
}

function battleVoicePrompt(game: Chess) {
  const firstMove = (game.moves({ verbose: true }) as Move[])[0]
  return firstMove
    ? `按住语音按钮，说出“${firstMove.zh}”，松开后完成识别。`
    : '按住语音按钮，说出当前局面可以走的中文棋谱，松开后完成识别。'
}

function voiceStateLabel(state: LinxiState) {
  const labels: Record<LinxiState, string> = {
    idle: '语音待命', connecting: '正在连接灵矽…', ready: '灵矽已连接', listening: '正在认真听…',
    thinking: '正在识别走法…', speaking: '正在讲解…', error: '语音暂不可用',
  }
  return labels[state]
}


function ChessBoard({ pieces, selectedId, legalTargets, lastPath, instruction, onSquare }: { pieces: Piece[]; selectedId: string | null; legalTargets: Square[]; lastPath?: { from: Square; to: Square; side: 'red' | 'black' } | null; instruction?: string; onSquare: (square: Square) => void }) {
  const previousPieces = useRef(pieces)
  const [movingPieceId, setMovingPieceId] = useState<string | null>(null)
  const [captureSquare, setCaptureSquare] = useState<Square | null>(null)
  useEffect(() => {
    const previous = previousPieces.current
    const movedPiece = pieces.find((piece) => {
      const oldPiece = previous.find((item) => item.id === piece.id)
      return oldPiece && !sameSquare(oldPiece, piece)
    })
    const captured = previous.find((oldPiece) => !pieces.some((piece) => piece.id === oldPiece.id))
    previousPieces.current = pieces
    if (!movedPiece) return
    setMovingPieceId(movedPiece.id)
    setCaptureSquare(captured ? { row: movedPiece.row, col: movedPiece.col } : null)
    const timer = window.setTimeout(() => {
      setMovingPieceId(null)
      setCaptureSquare(null)
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [pieces])

  const squares = Array.from({ length: 90 }, (_, index) => ({ row: Math.floor(index / 9), col: index % 9 }))
  return (
    <div className="board-wrap">
      <div className="chess-board" aria-label="中国象棋棋盘">
        <div className="board-coordinates black-files" aria-label="黑方纵线编号">{['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((file) => <span key={file}>{file}</span>)}</div>
        {lastPath && <svg className={`move-path ${lastPath.side}`} viewBox="0 0 8 9" preserveAspectRatio="none" aria-label="最近一步走子路径"><line x1={lastPath.from.col} y1={lastPath.from.row} x2={lastPath.to.col} y2={lastPath.to.row} /></svg>}
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
              className={`${target ? 'board-square target' : 'board-square'} ${captureSquare && sameSquare(captureSquare, square) ? 'capture-target' : ''}`}
              style={{ '--board-col': square.col, '--board-row': square.row } as React.CSSProperties}
              onClick={() => onSquare(square)}
              aria-label={piece ? `${piece.side === 'red' ? '红' : '黑'}${piece.text}` : `${square.row}-${square.col}`}
            >
              {piece && <span className={`chess-piece ${piece.side} ${selectedId === piece.id ? 'selected' : ''} ${movingPieceId === piece.id ? 'moving' : ''}`}>{piece.text}</span>}
            </button>
          )
        })}
        <div className="board-coordinates red-files" aria-label="红方纵线编号">{['九', '八', '七', '六', '五', '四', '三', '二', '一'].map((file) => <span key={file}>{file}</span>)}</div>
      </div>
      {instruction && <div className="board-tip"><span className="red-dot" /> {instruction}</div>}
    </div>
  )
}

export default App
