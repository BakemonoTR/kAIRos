export type AppLanguage = 'en' | 'tr' | 'es' | 'zh' | 'ru';

export const LANGUAGE_OPTIONS: Array<{ code: AppLanguage; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'es', label: 'Español' },
  { code: 'zh', label: '中文' },
  { code: 'ru', label: 'Русский' },
];

export interface I18nStrings {
  fingerMode: string;
  synthLooper: string;
  overlay: string;
  record: string;
  settings: string;
  exportPreset: string;
  importPreset: string;
  // Start screen
  startTitle: string;
  startDesc: string;
  startCameraBtn: string;
  // Sidebar tabs & titles
  tabChannels: string;
  tabFx: string;
  tabMidi: string;
  titleChannels: string;
  titleFx: string;
  titleMidi: string;
  // Channels toolbar
  active: string;
  midi: string;
  quantize: string;
  off: string;
  randomizeAll: string;
  // Bottom bar
  start: string;
  stop: string;
  calibrate: string;
  sensitivity: string;
  threshold: string;
  volume: string;
  antiCrosstalk: string;
  liveMidi: string;
  handsPrefix: string;
  // Settings modal
  settingsTitle: string;
  languageLabel: string;
  showLandmarksLabel: string;
  resetAllSettings: string;
  close: string;
  // Theremin & Looper sidebar
  synthRightHand: string;
  soundPreset: string;
  customSynthParams: string;
  osc1Wave: string;
  osc2Wave: string;
  osc2Octave: string;
  detune: string;
  filterMode: string;
  resonanceQ: string;
  vibratoRate: string;
  vibratoDepth: string;
  glide: string;
  scale: string;
  reverb: string;
  looper: string;
  synthLoop: string;
  drumLoop: string;
  clear: string;
  tempo: string;
  clearAll: string;
  handControls: string;
  gRightFist: string;
  gRightFistDesc: string;
  gRightMove: string;
  gRightMoveDesc: string;
  gRightWall: string;
  gRightWallDesc: string;
  gLeftWall: string;
  gLeftWallDesc: string;
  gLeftPalm: string;
  gLeftPalmDesc: string;
  gRightPalm: string;
  gRightPalmDesc: string;
  // Record modal
  recComplete: string;
  multiTrack: string;
  dlVideo: string;
  dlMidi: string;
  dlBoth: string;
  // FX Panel
  fxMaster: string;
  fxBuses: string;
  fxLeftHand: string;
  fxRightHand: string;
  fxAddFx: string;
  fxResetMixer: string;
  fxInsertChain: string;
  fxEmptyRack: string;
  // MIDI Panel
  dawOutput: string;
  scan: string;
  test: string;
  panic: string;
  noMidiPort: string;
  clickScan: string;
  noPortMsg: string;
  dawReadyMsg: string;
  synthWarnMsg: string;
  howToConnect: string;
  guideStep1: string;
  guideStep2: string;
  guideStep3: string;
  mode: string;
  channel: string;
  octave: string;
  dawOnly: string;
  quickScale: string;
  leftHand: string;
  rightHand: string;
  // Finger names (0..9)
  fingerNames: [string, string, string, string, string, string, string, string, string, string];
}

const DICT: Record<AppLanguage, I18nStrings> = {
  en: {
    fingerMode: 'Finger mode',
    synthLooper: 'Synth & looper',
    overlay: 'Overlay',
    record: 'Record',
    settings: 'Settings',
    exportPreset: 'Export preset',
    importPreset: 'Import preset',
    startTitle: 'Camera & audio required',
    startDesc: 'Play 10 virtual finger channels in Finger mode, or sweep Synth & Looper with your hands in mid-air.',
    startCameraBtn: 'Start camera',
    tabChannels: 'Channels',
    tabFx: 'FX',
    tabMidi: 'MIDI',
    titleChannels: 'Finger channels',
    titleFx: 'Mixer & FX Buses',
    titleMidi: 'MIDI & DAW Control',
    active: 'Active',
    midi: 'MIDI',
    quantize: 'Quantize',
    off: 'Off',
    randomizeAll: 'Randomize all',
    start: 'Start',
    stop: 'Stop',
    calibrate: 'Calibrate',
    sensitivity: 'Sensitivity',
    threshold: 'Threshold',
    volume: 'Volume',
    antiCrosstalk: 'Anti-crosstalk',
    liveMidi: 'Live MIDI',
    handsPrefix: 'HANDS',
    settingsTitle: 'General Settings',
    languageLabel: 'Language',
    showLandmarksLabel: 'Show Hand Skeleton Overlay',
    resetAllSettings: 'Reset Settings',
    close: 'Close',
    synthRightHand: 'Synthesizer (Right hand)',
    soundPreset: 'Sound preset',
    customSynthParams: 'Custom synth parameters',
    osc1Wave: 'Osc 1 wave',
    osc2Wave: 'Osc 2 wave',
    osc2Octave: 'Osc 2 octave',
    detune: 'Detune',
    filterMode: 'Filter mode',
    resonanceQ: 'Resonance (Q)',
    vibratoRate: 'Vibrato rate',
    vibratoDepth: 'Vibrato depth',
    glide: 'Glide',
    scale: 'Scale',
    reverb: 'Reverb',
    looper: 'Looper',
    synthLoop: 'Synth loop',
    drumLoop: 'Drum loop',
    clear: 'Clear',
    tempo: 'Tempo',
    clearAll: 'Clear all',
    handControls: 'Hand controls',
    gRightFist: 'Right fist',
    gRightFistDesc: 'Play synth & volume',
    gRightMove: 'Right vertical / horizontal',
    gRightMoveDesc: 'Pitch / filter',
    gRightWall: 'Right wall touch',
    gRightWallDesc: 'Record synth loop',
    gLeftWall: 'Left wall touch',
    gLeftWallDesc: 'Record drum loop',
    gLeftPalm: 'Left palm close & open',
    gLeftPalmDesc: 'Toggle pointer mode',
    gRightPalm: 'Right palm close & open',
    gRightPalmDesc: '5-finger one-hit mode',
    recComplete: 'Recording complete',
    multiTrack: 'Multi-track',
    dlVideo: 'Download video',
    dlMidi: 'Download MIDI',
    dlBoth: 'Download both',
    fxMaster: 'MASTER',
    fxBuses: 'FX BUSES',
    fxLeftHand: 'LEFT HAND',
    fxRightHand: 'RIGHT HAND',
    fxAddFx: '+ Add FX',
    fxResetMixer: 'Reset Mixer',
    fxInsertChain: 'Insert FX Chain',
    fxEmptyRack: 'No effects on this bus. Pick an effect above and click "+ Add FX".',
    dawOutput: 'DAW MIDI Output',
    scan: 'Scan',
    test: 'Test',
    panic: 'Panic',
    noMidiPort: 'No MIDI port found',
    clickScan: 'Click Scan to detect ports',
    noPortMsg: 'No port detected — open loopMIDI (Windows) or IAC Driver (macOS) and click Scan.',
    dawReadyMsg: 'DAW Port Ready:',
    synthWarnMsg: 'selected — choose loopMIDI or IAC Driver for DAW routing.',
    howToConnect: 'How to connect to FL Studio / Ableton (3 steps)',
    guideStep1: '1. Virtual Port: Open loopMIDI (Windows) and create a port, or enable IAC Driver (macOS).',
    guideStep2: '2. DAW Input: Enable that port as MIDI Input in FL Studio / Ableton Preferences.',
    guideStep3: '3. BeatCam: Select the port above and turn LIVE: ON. Enable DAW Only to mute local sound.',
    mode: 'Mode',
    channel: 'Channel',
    octave: 'Octave',
    dawOnly: 'DAW Only (Mute local BeatCam audio)',
    quickScale: 'Quick Scale / Kit',
    leftHand: 'LEFT HAND',
    rightHand: 'RIGHT HAND',
    fingerNames: [
      'Left thumb', 'Left index', 'Left middle', 'Left ring', 'Left pinky',
      'Right thumb', 'Right index', 'Right middle', 'Right ring', 'Right pinky',
    ],
  },
  tr: {
    fingerMode: 'Parmak modu',
    synthLooper: 'Synth & looper',
    overlay: 'Katman',
    record: 'Kaydet',
    settings: 'Ayarlar',
    exportPreset: 'Preset dışa aktar',
    importPreset: 'Preset yükle',
    startTitle: 'Kamera ve ses izni gerekli',
    startDesc: 'Parmak modunda 10 sanal parmak kanalını çalın veya Synth & Looper modunda ellerinizle havada müzik üretin.',
    startCameraBtn: 'Kamerayı başlat',
    tabChannels: 'Kanallar',
    tabFx: 'FX',
    tabMidi: 'MIDI',
    titleChannels: 'Parmak kanalları',
    titleFx: 'Mikser & FX Busları',
    titleMidi: 'MIDI & DAW Kontrolü',
    active: 'Aktif',
    midi: 'MIDI',
    quantize: 'Kuantize',
    off: 'Kapalı',
    randomizeAll: 'Hepsini karıştır',
    start: 'Başlat',
    stop: 'Durdur',
    calibrate: 'Kalibre et',
    sensitivity: 'Hassasiyet',
    threshold: 'Eşik',
    volume: 'Ses',
    antiCrosstalk: 'Çarpışma önle',
    liveMidi: 'Canlı MIDI',
    handsPrefix: 'ELLER',
    settingsTitle: 'Genel Ayarlar',
    languageLabel: 'Dil',
    showLandmarksLabel: 'El İskeleti Çizgilerini Göster',
    resetAllSettings: 'Ayarları Sıfırla',
    close: 'Kapat',
    synthRightHand: 'Synthesizer (Sağ el)',
    soundPreset: 'Ses önayarı',
    customSynthParams: 'Özel synth parametreleri',
    osc1Wave: 'Osc 1 dalga',
    osc2Wave: 'Osc 2 dalga',
    osc2Octave: 'Osc 2 oktav',
    detune: 'Detune',
    filterMode: 'Filtre modu',
    resonanceQ: 'Rezonans (Q)',
    vibratoRate: 'Vibrato hızı',
    vibratoDepth: 'Vibrato derinliği',
    glide: 'Kaydırma (Glide)',
    scale: 'Gam / Ölçek',
    reverb: 'Reverb',
    looper: 'Looper',
    synthLoop: 'Synth loop',
    drumLoop: 'Davul loop',
    clear: 'Temizle',
    tempo: 'Tempo',
    clearAll: 'Tümünü temizle',
    handControls: 'El kontrolleri',
    gRightFist: 'Sağ yumruk',
    gRightFistDesc: 'Synth çal ve ses seviyesi',
    gRightMove: 'Sağ dikey / yatay',
    gRightMoveDesc: 'Perde (Pitch) / filtre',
    gRightWall: 'Sağ duvara dokunma',
    gRightWallDesc: 'Synth loop kaydet',
    gLeftWall: 'Sol duvara dokunma',
    gLeftWallDesc: 'Davul loop kaydet',
    gLeftPalm: 'Sol avuç aç & kapa',
    gLeftPalmDesc: 'İşaretçi modunu aç/kapat',
    gRightPalm: 'Sağ avuç aç & kapa',
    gRightPalmDesc: '5-parmak one-hit modu',
    recComplete: 'Kayıt tamamlandı',
    multiTrack: 'Çoklu kanal',
    dlVideo: 'Videoyu indir',
    dlMidi: 'MIDI indir',
    dlBoth: 'İkisini indir',
    fxMaster: 'MASTER',
    fxBuses: 'FX BUSLARI',
    fxLeftHand: 'SOL EL',
    fxRightHand: 'SAĞ EL',
    fxAddFx: '+ FX Ekle',
    fxResetMixer: 'Mikseri Sıfırla',
    fxInsertChain: 'Insert FX Zinciri',
    fxEmptyRack: 'Bu bus üzerinde efekt yok. Yukarıdan efekt seçip "+ FX Ekle"ye basın.',
    dawOutput: 'DAW MIDI Çıkışı',
    scan: 'Tara',
    test: 'Test',
    panic: 'Panic',
    noMidiPort: 'MIDI portu bulunamadı',
    clickScan: 'Portları bulmak için Tara’ya basın',
    noPortMsg: 'Port yok — Windows için loopMIDI veya macOS için IAC Driver açıp Tara’ya basın.',
    dawReadyMsg: 'DAW Portu Hazır:',
    synthWarnMsg: 'seçili — DAW bağlantısı için loopMIDI veya IAC Driver seçin.',
    howToConnect: 'FL Studio / Ableton’a 3 Adımda Nasıl Bağlanır?',
    guideStep1: '1. Sanal Port: Windows’ta loopMIDI açıp bir port ekleyin veya Mac’te IAC Driver’ı açın.',
    guideStep2: '2. DAW Ayarı: FL Studio / Ableton MIDI ayarlarından bu portu Input olarak aktif edin.',
    guideStep3: '3. BeatCam: Yukarıdan portu seçip LIVE: ON yapın. İsterseniz DAW Only ile yerel sesi susturun.',
    mode: 'Mod',
    channel: 'Kanal',
    octave: 'Oktav',
    dawOnly: 'Sadece DAW (BeatCam yerel sesini sustur)',
    quickScale: 'Hızlı Ölçek / Kit',
    leftHand: 'SOL EL',
    rightHand: 'SAĞ EL',
    fingerNames: [
      'Sol başparmak', 'Sol işaret', 'Sol orta', 'Sol yüzük', 'Sol serçe',
      'Sağ başparmak', 'Sağ işaret', 'Sağ orta', 'Sağ yüzük', 'Sağ serçe',
    ],
  },
  es: {
    fingerMode: 'Modo dedos',
    synthLooper: 'Synth & looper',
    overlay: 'Superposición',
    record: 'Grabar',
    settings: 'Ajustes',
    exportPreset: 'Exportar preset',
    importPreset: 'Importar preset',
    startTitle: 'Se requiere cámara y audio',
    startDesc: 'Toca 10 canales de dedos virtuales o controla Synth & Looper con tus manos en el aire.',
    startCameraBtn: 'Iniciar cámara',
    tabChannels: 'Canales',
    tabFx: 'FX',
    tabMidi: 'MIDI',
    titleChannels: 'Canales de dedos',
    titleFx: 'Mezclador & Buses FX',
    titleMidi: 'Control MIDI & DAW',
    active: 'Activos',
    midi: 'MIDI',
    quantize: 'Cuantizar',
    off: 'Desactivado',
    randomizeAll: 'Aleatorizar',
    start: 'Iniciar',
    stop: 'Detener',
    calibrate: 'Calibrar',
    sensitivity: 'Sensibilidad',
    threshold: 'Umbral',
    volume: 'Volumen',
    antiCrosstalk: 'Anti-diafonía',
    liveMidi: 'MIDI en vivo',
    handsPrefix: 'MANOS',
    settingsTitle: 'Ajustes Generales',
    languageLabel: 'Idioma',
    showLandmarksLabel: 'Mostrar esqueleto de la mano',
    resetAllSettings: 'Restablecer',
    close: 'Cerrar',
    synthRightHand: 'Sintetizador (Mano derecha)',
    soundPreset: 'Preset de sonido',
    customSynthParams: 'Parámetros personalizados',
    osc1Wave: 'Onda Osc 1',
    osc2Wave: 'Onda Osc 2',
    osc2Octave: 'Octava Osc 2',
    detune: 'Desafinación',
    filterMode: 'Modo filtro',
    resonanceQ: 'Resonancia (Q)',
    vibratoRate: 'Frec. vibrato',
    vibratoDepth: 'Prof. vibrato',
    glide: 'Portamento',
    scale: 'Escala',
    reverb: 'Reverb',
    looper: 'Looper',
    synthLoop: 'Loop synth',
    drumLoop: 'Loop batería',
    clear: 'Limpiar',
    tempo: 'Tempo',
    clearAll: 'Limpiar todo',
    handControls: 'Controles gestuales',
    gRightFist: 'Puño derecho',
    gRightFistDesc: 'Tocar synth y volumen',
    gRightMove: 'Derecha vertical / horizontal',
    gRightMoveDesc: 'Tono / filtro',
    gRightWall: 'Toque pared derecha',
    gRightWallDesc: 'Grabar loop synth',
    gLeftWall: 'Toque pared izquierda',
    gLeftWallDesc: 'Grabar loop batería',
    gLeftPalm: 'Palma izq. abrir y cerrar',
    gLeftPalmDesc: 'Alternar modo puntero',
    gRightPalm: 'Palma der. abrir y cerrar',
    gRightPalmDesc: 'Modo one-hit 5 dedos',
    recComplete: 'Grabación completa',
    multiTrack: 'Multipista',
    dlVideo: 'Descargar vídeo',
    dlMidi: 'Descargar MIDI',
    dlBoth: 'Descargar ambos',
    fxMaster: 'MASTER',
    fxBuses: 'BUSES FX',
    fxLeftHand: 'MANO IZQ.',
    fxRightHand: 'MANO DER.',
    fxAddFx: '+ Añadir FX',
    fxResetMixer: 'Reiniciar Mixer',
    fxInsertChain: 'Cadena FX',
    fxEmptyRack: 'Sin efectos en este bus. Elige uno arriba y pulsa "+ Añadir FX".',
    dawOutput: 'Salida MIDI DAW',
    scan: 'Buscar',
    test: 'Probar',
    panic: 'Pánico',
    noMidiPort: 'No se encontró puerto MIDI',
    clickScan: 'Pulsa Buscar para detectar puertos',
    noPortMsg: 'Sin puerto — abre loopMIDI (Windows) o IAC Driver (macOS) y pulsa Buscar.',
    dawReadyMsg: 'Puerto DAW listo:',
    synthWarnMsg: 'seleccionado — elige loopMIDI o IAC Driver para tu DAW.',
    howToConnect: 'Cómo conectar a FL Studio / Ableton (3 pasos)',
    guideStep1: '1. Puerto virtual: Abre loopMIDI (Windows) o activa IAC Driver (macOS).',
    guideStep2: '2. Entrada DAW: Activa ese puerto como entrada MIDI en FL Studio / Ableton.',
    guideStep3: '3. BeatCam: Selecciona el puerto arriba y activa LIVE: ON.',
    mode: 'Modo',
    channel: 'Canal',
    octave: 'Octava',
    dawOnly: 'Solo DAW (Silenciar audio local)',
    quickScale: 'Escala / Kit rápido',
    leftHand: 'MANO IZQUIERDA',
    rightHand: 'MANO DERECHA',
    fingerNames: [
      'Pulgar izq.', 'Índice izq.', 'Medio izq.', 'Anular izq.', 'Meñique izq.',
      'Pulgar der.', 'Índice der.', 'Medio der.', 'Anular der.', 'Meñique der.',
    ],
  },
  zh: {
    fingerMode: '手指模式',
    synthLooper: '合成器 & 循环',
    overlay: '叠加层',
    record: '录制',
    settings: '设置',
    exportPreset: '导出预设',
    importPreset: '导入预设',
    startTitle: '需要摄像头与音频权限',
    startDesc: '在手指模式演奏 10 个虚拟通道，或在合成器与循环模式中隔空演奏。',
    startCameraBtn: '启动摄像头',
    tabChannels: '通道',
    tabFx: '效果器',
    tabMidi: 'MIDI',
    titleChannels: '手指通道',
    titleFx: '混音器 & FX 总线',
    titleMidi: 'MIDI & DAW 控制',
    active: '启用',
    midi: 'MIDI',
    quantize: '量化',
    off: '关闭',
    randomizeAll: '全部随机',
    start: '开始',
    stop: '停止',
    calibrate: '校准',
    sensitivity: '灵敏度',
    threshold: '触发阈值',
    volume: '音量',
    antiCrosstalk: '防误触',
    liveMidi: '实时 MIDI',
    handsPrefix: '手部',
    settingsTitle: '常规设置',
    languageLabel: '语言',
    showLandmarksLabel: '显示手部骨骼连线',
    resetAllSettings: '重置设置',
    close: '关闭',
    synthRightHand: '合成器（右手）',
    soundPreset: '音色预设',
    customSynthParams: '自定义合成器参数',
    osc1Wave: '振荡器 1 波形',
    osc2Wave: '振荡器 2 波形',
    osc2Octave: '振荡器 2 八度',
    detune: '失谐',
    filterMode: '滤波模式',
    resonanceQ: '共振 (Q)',
    vibratoRate: '颤音速率',
    vibratoDepth: '颤音深度',
    glide: '滑音',
    scale: '音阶',
    reverb: '混响',
    looper: '循环器',
    synthLoop: '合成器循环',
    drumLoop: '鼓组循环',
    clear: '清除',
    tempo: '速度',
    clearAll: '全部清除',
    handControls: '手势控制',
    gRightFist: '右手握拳',
    gRightFistDesc: '演奏合成器与音量',
    gRightMove: '右手上下 / 左右',
    gRightMoveDesc: '音高 / 滤波',
    gRightWall: '触碰右边界',
    gRightWallDesc: '录制合成器循环',
    gLeftWall: '触碰左边界',
    gLeftWallDesc: '录制鼓组循环',
    gLeftPalm: '左手掌开合',
    gLeftPalmDesc: '切换指针模式',
    gRightPalm: '右手掌开合',
    gRightPalmDesc: '五指打击垫模式',
    recComplete: '录制完成',
    multiTrack: '多轨',
    dlVideo: '下载视频',
    dlMidi: '下载 MIDI',
    dlBoth: '全部下载',
    fxMaster: '总控 MASTER',
    fxBuses: 'FX 总线',
    fxLeftHand: '左手',
    fxRightHand: '右手',
    fxAddFx: '+ 添加效果',
    fxResetMixer: '重置混音器',
    fxInsertChain: '插入效果链',
    fxEmptyRack: '此总线暂无效果器。请在上方选择效果并点击 "+ 添加效果"。',
    dawOutput: 'DAW MIDI 输出',
    scan: '扫描',
    test: '测试',
    panic: 'Panic',
    noMidiPort: '未找到 MIDI 端口',
    clickScan: '点击扫描检测端口',
    noPortMsg: '未检测到端口 — 请打开 loopMIDI (Windows) 或 IAC Driver (macOS) 后点击扫描。',
    dawReadyMsg: 'DAW 端口已就绪:',
    synthWarnMsg: '已选择 — 连接 DAW 请选择 loopMIDI 或 IAC Driver。',
    howToConnect: '如何连接 FL Studio / Ableton（3步）',
    guideStep1: '1. 虚拟端口：在 Windows 打开 loopMIDI 创建端口，或在 macOS 启用 IAC Driver。',
    guideStep2: '2. DAW 输入：在 FL Studio / Ableton 的 MIDI 设置中启用该端口作为输入。',
    guideStep3: '3. BeatCam：在上方选择该端口并开启 LIVE: ON。可勾选仅 DAW 模式静音本地音频。',
    mode: '模式',
    channel: '通道',
    octave: '八度',
    dawOnly: '仅 DAW（静音 BeatCam 本地音频）',
    quickScale: '快速音阶 / 鼓组',
    leftHand: '左手',
    rightHand: '右手',
    fingerNames: [
      '左拇指', '左食指', '左中指', '左无名指', '左小指',
      '右拇指', '右食指', '右中指', '右无名指', '右小指',
    ],
  },
  ru: {
    fingerMode: 'Режим пальцев',
    synthLooper: 'Синт и лупер',
    overlay: 'Оверлей',
    record: 'Запись',
    settings: 'Настройки',
    exportPreset: 'Экспорт пресета',
    importPreset: 'Импорт пресета',
    startTitle: 'Требуется камера и аудио',
    startDesc: 'Играйте на 10 виртуальных каналах пальцев или управляйте синтезатором и лупером в воздухе.',
    startCameraBtn: 'Включить камеру',
    tabChannels: 'Каналы',
    tabFx: 'FX',
    tabMidi: 'MIDI',
    titleChannels: 'Каналы пальцев',
    titleFx: 'Микшер и FX шины',
    titleMidi: 'MIDI и DAW',
    active: 'Активно',
    midi: 'MIDI',
    quantize: 'Квантиз.',
    off: 'Выкл',
    randomizeAll: 'Случайно',
    start: 'Старт',
    stop: 'Стоп',
    calibrate: 'Калибровка',
    sensitivity: 'Чувствительность',
    threshold: 'Порог',
    volume: 'Громкость',
    antiCrosstalk: 'Анти-перекрёст',
    liveMidi: 'Live MIDI',
    handsPrefix: 'РУКИ',
    settingsTitle: 'Общие настройки',
    languageLabel: 'Язык',
    showLandmarksLabel: 'Показывать скелет руки',
    resetAllSettings: 'Сбросить',
    close: 'Закрыть',
    synthRightHand: 'Синтезатор (Правая рука)',
    soundPreset: 'Пресет звука',
    customSynthParams: 'Параметры синта',
    osc1Wave: 'Волна Osc 1',
    osc2Wave: 'Волна Osc 2',
    osc2Octave: 'Октава Osc 2',
    detune: 'Расстройка',
    filterMode: 'Режим фильтра',
    resonanceQ: 'Резонанс (Q)',
    vibratoRate: 'Частота вибрато',
    vibratoDepth: 'Глубина вибрато',
    glide: 'Глайд',
    scale: 'Гамма',
    reverb: 'Реверб',
    looper: 'Лупер',
    synthLoop: 'Синт луп',
    drumLoop: 'Ударные луп',
    clear: 'Очистить',
    tempo: 'Темп',
    clearAll: 'Очистить всё',
    handControls: 'Управление руками',
    gRightFist: 'Правый кулак',
    gRightFistDesc: 'Игра и громкость',
    gRightMove: 'Правая верт. / гориз.',
    gRightMoveDesc: 'Высота / фильтр',
    gRightWall: 'Касание правой стены',
    gRightWallDesc: 'Запись синт-лупа',
    gLeftWall: 'Касание левой стены',
    gLeftWallDesc: 'Запись ударного лупа',
    gLeftPalm: 'Левая ладонь сжать/разжать',
    gLeftPalmDesc: 'Режим указателя',
    gRightPalm: 'Правая ладонь сжать/разжать',
    gRightPalmDesc: 'Режим 5-пальцевых пэдов',
    recComplete: 'Запись завершена',
    multiTrack: 'Мультитрек',
    dlVideo: 'Скачать видео',
    dlMidi: 'Скачать MIDI',
    dlBoth: 'Скачать всё',
    fxMaster: 'МАСТЕР',
    fxBuses: 'FX ШИНЫ',
    fxLeftHand: 'ЛЕВАЯ РУКА',
    fxRightHand: 'ПРАВАЯ РУКА',
    fxAddFx: '+ Добавить FX',
    fxResetMixer: 'Сброс микшера',
    fxInsertChain: 'Цепочка эффектов',
    fxEmptyRack: 'На этой шине нет эффектов. Выберите эффект выше и нажмите "+ Добавить FX".',
    dawOutput: 'Выход MIDI для DAW',
    scan: 'Поиск',
    test: 'Тест',
    panic: 'Panic',
    noMidiPort: 'MIDI-порт не найден',
    clickScan: 'Нажмите Поиск для сканирования',
    noPortMsg: 'Порт не найден — запустите loopMIDI (Windows) или IAC Driver (macOS) и нажмите Поиск.',
    dawReadyMsg: 'DAW порт готов:',
    synthWarnMsg: 'выбран — для DAW выберите loopMIDI или IAC Driver.',
    howToConnect: 'Как подключить к FL Studio / Ableton (3 шага)',
    guideStep1: '1. Виртуальный порт: Откройте loopMIDI (Windows) или включите IAC Driver (macOS).',
    guideStep2: '2. Вход в DAW: Включите этот порт как MIDI Input в настройках FL Studio / Ableton.',
    guideStep3: '3. BeatCam: Выберите порт выше и включите LIVE: ON.',
    mode: 'Режим',
    channel: 'Канал',
    octave: 'Октава',
    dawOnly: 'Только DAW (отключить локальный звук)',
    quickScale: 'Быстрая гамма / Кит',
    leftHand: 'ЛЕВАЯ РУКА',
    rightHand: 'ПРАВАЯ РУКА',
    fingerNames: [
      'Лев. большой', 'Лев. указат.', 'Лев. средний', 'Лев. безымян.', 'Лев. мизинец',
      'Прав. большой', 'Прав. указат.', 'Прав. средний', 'Прав. безымян.', 'Прав. мизинец',
    ],
  },
};

export function getStrings(lang: AppLanguage | undefined): I18nStrings {
  return DICT[lang ?? 'en'] ?? DICT.en;
}
