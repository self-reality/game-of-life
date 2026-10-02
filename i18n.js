// Interface languages. index.html carries the English text and marks what is
// translatable with data-i18n attributes; this file swaps the text in place, so
// control ids and values never change with the language. The Sound section is
// left in English on purpose: its terms (attack, decay, sustain, waveform
// names) are the ones synths use everywhere.
(() => {
  const STORAGE_KEY = "game-of-life.lang";
  const DEFAULT_LANGUAGE = "en";

  // `flag` is a file in flags/. Arabic is the only right-to-left one.
  const LANGUAGES = [
    { code: "en", name: "English", flag: "gb" },
    { code: "ru", name: "Русский", flag: "ru" },
    { code: "de", name: "Deutsch", flag: "de" },
    { code: "fr", name: "Français", flag: "fr" },
    { code: "it", name: "Italiano", flag: "it" },
    { code: "es", name: "Español", flag: "es" },
    { code: "pt", name: "Português", flag: "br" },
    { code: "zh", name: "中文", flag: "cn" },
    { code: "ja", name: "日本語", flag: "jp" },
    { code: "ko", name: "한국어", flag: "kr" },
    { code: "hi", name: "हिन्दी", flag: "in" },
    { code: "ar", name: "العربية", flag: "sa", rtl: true },
  ];

  const STRINGS = {
    en: {
      title: "Game of Life",
      language: "Language",
      fullscreen: "Full screen",
      fullscreenShortcut: "Shortcut: F",
      soundShortcut: "Shortcut: M",
      soundOn: "Sound: on",
      soundOff: "Sound: off",
      soundUnavailable: "Sound unavailable",
      soundUnavailableWhy: "Tone.js failed to load",
      screenRatio: "Screen ratio",
      thisScreen: "This screen",
      presetCells: "{cols} × {rows} cells",
      settings: "Settings",
      fieldWidth: "Field width (cells)",
      fieldHeight: "Field height (cells)",
      horizontalEdges: "Horizontal edges",
      edgesWrap: "Wrap (cylinder)",
      edgesWall: "Wall",
      resolution: "Resolution (px per cell)",
      speed: "Speed (steps/sec)",
      gridMargin: "Grid margin (px)",
      gridThickness: "Grid thickness (px)",
      glowBlur: "Glow blur (px)",
      glowStrength: "Glow strength",
      glowBlend: "Glow blend mode",
      colors: "Colors",
      colorBackground: "Background",
      colorGrid: "Grid",
      colorAlive1: "Alive 1",
      colorAlive2: "Alive 2+",
      colorAlive10: "Alive 10+",
      shipsPerSpawn: "Ships per spawn",
      spawnPeriod: "Spawn period (steps)",
      status: "Status",
      density: "Density p",
      soundsAtOnce: "Sounds at once",
      exitHint: "Press Esc to exit full screen",
      canvasLabel: "Game of Life simulation",
    },
    ru: {
      title: "Игра «Жизнь»",
      language: "Язык",
      fullscreen: "Во весь экран",
      fullscreenShortcut: "Клавиша: F",
      soundShortcut: "Клавиша: M",
      soundOn: "Звук: вкл",
      soundOff: "Звук: выкл",
      soundUnavailable: "Звук недоступен",
      soundUnavailableWhy: "Не удалось загрузить Tone.js",
      screenRatio: "Соотношение сторон",
      thisScreen: "Этот экран",
      presetCells: "{cols} × {rows} клеток",
      settings: "Настройки",
      fieldWidth: "Ширина поля (клетки)",
      fieldHeight: "Высота поля (клетки)",
      horizontalEdges: "Края по горизонтали",
      edgesWrap: "Замкнуты (цилиндр)",
      edgesWall: "Стена",
      resolution: "Разрешение (px на клетку)",
      speed: "Скорость (шагов/с)",
      gridMargin: "Отступ сетки (px)",
      gridThickness: "Толщина сетки (px)",
      glowBlur: "Размытие свечения (px)",
      glowStrength: "Сила свечения",
      glowBlend: "Режим наложения свечения",
      colors: "Цвета",
      colorBackground: "Фон",
      colorGrid: "Сетка",
      colorAlive1: "Живые 1",
      colorAlive2: "Живые 2+",
      colorAlive10: "Живые 10+",
      shipsPerSpawn: "Кораблей за появление",
      spawnPeriod: "Период появления (шаги)",
      status: "Состояние",
      density: "Плотность p",
      soundsAtOnce: "Звуков одновременно",
      exitHint: "Нажмите Esc, чтобы выйти из полноэкранного режима",
      canvasLabel: "Симуляция игры «Жизнь»",
    },
    de: {
      title: "Spiel des Lebens",
      language: "Sprache",
      fullscreen: "Vollbild",
      fullscreenShortcut: "Taste: F",
      soundShortcut: "Taste: M",
      soundOn: "Ton: an",
      soundOff: "Ton: aus",
      soundUnavailable: "Ton nicht verfügbar",
      soundUnavailableWhy: "Tone.js konnte nicht geladen werden",
      screenRatio: "Seitenverhältnis",
      thisScreen: "Dieser Bildschirm",
      presetCells: "{cols} × {rows} Zellen",
      settings: "Einstellungen",
      fieldWidth: "Feldbreite (Zellen)",
      fieldHeight: "Feldhöhe (Zellen)",
      horizontalEdges: "Horizontale Ränder",
      edgesWrap: "Umlaufend (Zylinder)",
      edgesWall: "Wand",
      resolution: "Auflösung (px pro Zelle)",
      speed: "Geschwindigkeit (Schritte/s)",
      gridMargin: "Gitterrand (px)",
      gridThickness: "Gitterstärke (px)",
      glowBlur: "Leuchten: Unschärfe (px)",
      glowStrength: "Leuchten: Stärke",
      glowBlend: "Leuchten: Mischmodus",
      colors: "Farben",
      colorBackground: "Hintergrund",
      colorGrid: "Gitter",
      colorAlive1: "Lebend 1",
      colorAlive2: "Lebend 2+",
      colorAlive10: "Lebend 10+",
      shipsPerSpawn: "Schiffe pro Erzeugung",
      spawnPeriod: "Erzeugungsintervall (Schritte)",
      status: "Status",
      density: "Dichte p",
      soundsAtOnce: "Töne gleichzeitig",
      exitHint: "Esc drücken, um den Vollbildmodus zu verlassen",
      canvasLabel: "Simulation des Spiels des Lebens",
    },
    fr: {
      title: "Jeu de la vie",
      language: "Langue",
      fullscreen: "Plein écran",
      fullscreenShortcut: "Raccourci : F",
      soundShortcut: "Raccourci : M",
      soundOn: "Son : activé",
      soundOff: "Son : coupé",
      soundUnavailable: "Son indisponible",
      soundUnavailableWhy: "Échec du chargement de Tone.js",
      screenRatio: "Format d’écran",
      thisScreen: "Cet écran",
      presetCells: "{cols} × {rows} cellules",
      settings: "Réglages",
      fieldWidth: "Largeur du champ (cellules)",
      fieldHeight: "Hauteur du champ (cellules)",
      horizontalEdges: "Bords horizontaux",
      edgesWrap: "Bouclés (cylindre)",
      edgesWall: "Mur",
      resolution: "Résolution (px par cellule)",
      speed: "Vitesse (pas/s)",
      gridMargin: "Marge de la grille (px)",
      gridThickness: "Épaisseur de la grille (px)",
      glowBlur: "Flou du halo (px)",
      glowStrength: "Intensité du halo",
      glowBlend: "Mode de fusion du halo",
      colors: "Couleurs",
      colorBackground: "Fond",
      colorGrid: "Grille",
      colorAlive1: "Vivante 1",
      colorAlive2: "Vivante 2+",
      colorAlive10: "Vivante 10+",
      shipsPerSpawn: "Vaisseaux par apparition",
      spawnPeriod: "Période d’apparition (pas)",
      status: "État",
      density: "Densité p",
      soundsAtOnce: "Sons simultanés",
      exitHint: "Appuyez sur Échap pour quitter le plein écran",
      canvasLabel: "Simulation du jeu de la vie",
    },
    it: {
      title: "Gioco della vita",
      language: "Lingua",
      fullscreen: "Schermo intero",
      fullscreenShortcut: "Tasto: F",
      soundShortcut: "Tasto: M",
      soundOn: "Audio: attivo",
      soundOff: "Audio: spento",
      soundUnavailable: "Audio non disponibile",
      soundUnavailableWhy: "Impossibile caricare Tone.js",
      screenRatio: "Formato dello schermo",
      thisScreen: "Questo schermo",
      presetCells: "{cols} × {rows} celle",
      settings: "Impostazioni",
      fieldWidth: "Larghezza del campo (celle)",
      fieldHeight: "Altezza del campo (celle)",
      horizontalEdges: "Bordi orizzontali",
      edgesWrap: "Continui (cilindro)",
      edgesWall: "Muro",
      resolution: "Risoluzione (px per cella)",
      speed: "Velocità (passi/s)",
      gridMargin: "Margine della griglia (px)",
      gridThickness: "Spessore della griglia (px)",
      glowBlur: "Sfocatura del bagliore (px)",
      glowStrength: "Intensità del bagliore",
      glowBlend: "Fusione del bagliore",
      colors: "Colori",
      colorBackground: "Sfondo",
      colorGrid: "Griglia",
      colorAlive1: "Viva 1",
      colorAlive2: "Viva 2+",
      colorAlive10: "Viva 10+",
      shipsPerSpawn: "Navi per comparsa",
      spawnPeriod: "Periodo di comparsa (passi)",
      status: "Stato",
      density: "Densità p",
      soundsAtOnce: "Suoni simultanei",
      exitHint: "Premi Esc per uscire dallo schermo intero",
      canvasLabel: "Simulazione del gioco della vita",
    },
    es: {
      title: "Juego de la vida",
      language: "Idioma",
      fullscreen: "Pantalla completa",
      fullscreenShortcut: "Atajo: F",
      soundShortcut: "Atajo: M",
      soundOn: "Sonido: activado",
      soundOff: "Sonido: desactivado",
      soundUnavailable: "Sonido no disponible",
      soundUnavailableWhy: "No se pudo cargar Tone.js",
      screenRatio: "Proporción de pantalla",
      thisScreen: "Esta pantalla",
      presetCells: "{cols} × {rows} celdas",
      settings: "Ajustes",
      fieldWidth: "Ancho del campo (celdas)",
      fieldHeight: "Alto del campo (celdas)",
      horizontalEdges: "Bordes horizontales",
      edgesWrap: "Continuos (cilindro)",
      edgesWall: "Pared",
      resolution: "Resolución (px por celda)",
      speed: "Velocidad (pasos/s)",
      gridMargin: "Margen de la cuadrícula (px)",
      gridThickness: "Grosor de la cuadrícula (px)",
      glowBlur: "Desenfoque del brillo (px)",
      glowStrength: "Intensidad del brillo",
      glowBlend: "Modo de fusión del brillo",
      colors: "Colores",
      colorBackground: "Fondo",
      colorGrid: "Cuadrícula",
      colorAlive1: "Viva 1",
      colorAlive2: "Viva 2+",
      colorAlive10: "Viva 10+",
      shipsPerSpawn: "Naves por aparición",
      spawnPeriod: "Período de aparición (pasos)",
      status: "Estado",
      density: "Densidad p",
      soundsAtOnce: "Sonidos simultáneos",
      exitHint: "Pulsa Esc para salir de la pantalla completa",
      canvasLabel: "Simulación del juego de la vida",
    },
    pt: {
      title: "Jogo da vida",
      language: "Idioma",
      fullscreen: "Tela cheia",
      fullscreenShortcut: "Atalho: F",
      soundShortcut: "Atalho: M",
      soundOn: "Som: ligado",
      soundOff: "Som: desligado",
      soundUnavailable: "Som indisponível",
      soundUnavailableWhy: "Falha ao carregar o Tone.js",
      screenRatio: "Proporção da tela",
      thisScreen: "Esta tela",
      presetCells: "{cols} × {rows} células",
      settings: "Configurações",
      fieldWidth: "Largura do campo (células)",
      fieldHeight: "Altura do campo (células)",
      horizontalEdges: "Bordas horizontais",
      edgesWrap: "Contínuas (cilindro)",
      edgesWall: "Parede",
      resolution: "Resolução (px por célula)",
      speed: "Velocidade (passos/s)",
      gridMargin: "Margem da grade (px)",
      gridThickness: "Espessura da grade (px)",
      glowBlur: "Desfoque do brilho (px)",
      glowStrength: "Intensidade do brilho",
      glowBlend: "Modo de mesclagem do brilho",
      colors: "Cores",
      colorBackground: "Fundo",
      colorGrid: "Grade",
      colorAlive1: "Viva 1",
      colorAlive2: "Viva 2+",
      colorAlive10: "Viva 10+",
      shipsPerSpawn: "Naves por surgimento",
      spawnPeriod: "Período de surgimento (passos)",
      status: "Status",
      density: "Densidade p",
      soundsAtOnce: "Sons simultâneos",
      exitHint: "Pressione Esc para sair da tela cheia",
      canvasLabel: "Simulação do jogo da vida",
    },
    zh: {
      title: "生命游戏",
      language: "语言",
      fullscreen: "全屏",
      fullscreenShortcut: "快捷键：F",
      soundShortcut: "快捷键：M",
      soundOn: "声音：开",
      soundOff: "声音：关",
      soundUnavailable: "声音不可用",
      soundUnavailableWhy: "Tone.js 加载失败",
      screenRatio: "屏幕比例",
      thisScreen: "当前屏幕",
      presetCells: "{cols} × {rows} 个细胞",
      settings: "设置",
      fieldWidth: "场地宽度（细胞）",
      fieldHeight: "场地高度（细胞）",
      horizontalEdges: "水平边界",
      edgesWrap: "循环（圆柱）",
      edgesWall: "墙壁",
      resolution: "分辨率（每细胞像素）",
      speed: "速度（步/秒）",
      gridMargin: "网格边距（像素）",
      gridThickness: "网格线宽（像素）",
      glowBlur: "辉光模糊（像素）",
      glowStrength: "辉光强度",
      glowBlend: "辉光混合模式",
      colors: "颜色",
      colorBackground: "背景",
      colorGrid: "网格",
      colorAlive1: "存活 1",
      colorAlive2: "存活 2+",
      colorAlive10: "存活 10+",
      shipsPerSpawn: "每次生成飞船数",
      spawnPeriod: "生成周期（步）",
      status: "状态",
      density: "密度 p",
      soundsAtOnce: "同时发声数",
      exitHint: "按 Esc 退出全屏",
      canvasLabel: "生命游戏模拟",
    },
    ja: {
      title: "ライフゲーム",
      language: "言語",
      fullscreen: "全画面",
      fullscreenShortcut: "ショートカット：F",
      soundShortcut: "ショートカット：M",
      soundOn: "サウンド：オン",
      soundOff: "サウンド：オフ",
      soundUnavailable: "サウンドは利用できません",
      soundUnavailableWhy: "Tone.js を読み込めませんでした",
      screenRatio: "画面比率",
      thisScreen: "この画面",
      presetCells: "{cols} × {rows} セル",
      settings: "設定",
      fieldWidth: "フィールドの幅（セル）",
      fieldHeight: "フィールドの高さ（セル）",
      horizontalEdges: "左右の端",
      edgesWrap: "ループ（円筒）",
      edgesWall: "壁",
      resolution: "解像度（1セルあたりのpx）",
      speed: "速度（ステップ/秒）",
      gridMargin: "グリッドの余白（px）",
      gridThickness: "グリッドの太さ（px）",
      glowBlur: "グローのぼかし（px）",
      glowStrength: "グローの強さ",
      glowBlend: "グローの合成モード",
      colors: "色",
      colorBackground: "背景",
      colorGrid: "グリッド",
      colorAlive1: "生存 1",
      colorAlive2: "生存 2+",
      colorAlive10: "生存 10+",
      shipsPerSpawn: "1回あたりの宇宙船数",
      spawnPeriod: "出現間隔（ステップ）",
      status: "ステータス",
      density: "密度 p",
      soundsAtOnce: "同時発音数",
      exitHint: "Esc キーで全画面を終了",
      canvasLabel: "ライフゲームのシミュレーション",
    },
    ko: {
      title: "라이프 게임",
      language: "언어",
      fullscreen: "전체 화면",
      fullscreenShortcut: "단축키: F",
      soundShortcut: "단축키: M",
      soundOn: "소리: 켜짐",
      soundOff: "소리: 꺼짐",
      soundUnavailable: "소리를 사용할 수 없음",
      soundUnavailableWhy: "Tone.js를 불러오지 못했습니다",
      screenRatio: "화면 비율",
      thisScreen: "현재 화면",
      presetCells: "{cols} × {rows} 셀",
      settings: "설정",
      fieldWidth: "필드 너비(셀)",
      fieldHeight: "필드 높이(셀)",
      horizontalEdges: "좌우 가장자리",
      edgesWrap: "순환(원통)",
      edgesWall: "벽",
      resolution: "해상도(셀당 px)",
      speed: "속도(스텝/초)",
      gridMargin: "격자 여백(px)",
      gridThickness: "격자 두께(px)",
      glowBlur: "글로우 흐림(px)",
      glowStrength: "글로우 강도",
      glowBlend: "글로우 혼합 모드",
      colors: "색상",
      colorBackground: "배경",
      colorGrid: "격자",
      colorAlive1: "생존 1",
      colorAlive2: "생존 2+",
      colorAlive10: "생존 10+",
      shipsPerSpawn: "생성당 우주선 수",
      spawnPeriod: "생성 주기(스텝)",
      status: "상태",
      density: "밀도 p",
      soundsAtOnce: "동시 발음 수",
      exitHint: "Esc를 눌러 전체 화면 종료",
      canvasLabel: "라이프 게임 시뮬레이션",
    },
    hi: {
      title: "जीवन का खेल",
      language: "भाषा",
      fullscreen: "पूर्ण स्क्रीन",
      fullscreenShortcut: "शॉर्टकट: F",
      soundShortcut: "शॉर्टकट: M",
      soundOn: "ध्वनि: चालू",
      soundOff: "ध्वनि: बंद",
      soundUnavailable: "ध्वनि उपलब्ध नहीं",
      soundUnavailableWhy: "Tone.js लोड नहीं हो सका",
      screenRatio: "स्क्रीन अनुपात",
      thisScreen: "यह स्क्रीन",
      presetCells: "{cols} × {rows} कोशिकाएँ",
      settings: "सेटिंग्स",
      fieldWidth: "क्षेत्र की चौड़ाई (कोशिकाएँ)",
      fieldHeight: "क्षेत्र की ऊँचाई (कोशिकाएँ)",
      horizontalEdges: "क्षैतिज किनारे",
      edgesWrap: "जुड़े हुए (बेलन)",
      edgesWall: "दीवार",
      resolution: "रिज़ॉल्यूशन (px प्रति कोशिका)",
      speed: "गति (चरण/सेकंड)",
      gridMargin: "ग्रिड मार्जिन (px)",
      gridThickness: "ग्रिड की मोटाई (px)",
      glowBlur: "चमक का धुंधलापन (px)",
      glowStrength: "चमक की तीव्रता",
      glowBlend: "चमक का ब्लेंड मोड",
      colors: "रंग",
      colorBackground: "पृष्ठभूमि",
      colorGrid: "ग्रिड",
      colorAlive1: "जीवित 1",
      colorAlive2: "जीवित 2+",
      colorAlive10: "जीवित 10+",
      shipsPerSpawn: "प्रति स्पॉन यान",
      spawnPeriod: "स्पॉन अवधि (चरण)",
      status: "स्थिति",
      density: "घनत्व p",
      soundsAtOnce: "एक साथ ध्वनियाँ",
      exitHint: "पूर्ण स्क्रीन से बाहर निकलने के लिए Esc दबाएँ",
      canvasLabel: "जीवन के खेल का सिमुलेशन",
    },
    ar: {
      title: "لعبة الحياة",
      language: "اللغة",
      fullscreen: "ملء الشاشة",
      fullscreenShortcut: "اختصار: F",
      soundShortcut: "اختصار: M",
      soundOn: "الصوت: تشغيل",
      soundOff: "الصوت: إيقاف",
      soundUnavailable: "الصوت غير متاح",
      soundUnavailableWhy: "تعذّر تحميل Tone.js",
      screenRatio: "نسبة أبعاد الشاشة",
      thisScreen: "هذه الشاشة",
      presetCells: "{cols} × {rows} خلية",
      settings: "الإعدادات",
      fieldWidth: "عرض الحقل (خلايا)",
      fieldHeight: "ارتفاع الحقل (خلايا)",
      horizontalEdges: "الحواف الأفقية",
      edgesWrap: "متصلة (أسطوانة)",
      edgesWall: "جدار",
      resolution: "الدقة (بكسل لكل خلية)",
      speed: "السرعة (خطوة/ثانية)",
      gridMargin: "هامش الشبكة (بكسل)",
      gridThickness: "سماكة الشبكة (بكسل)",
      glowBlur: "تمويه التوهج (بكسل)",
      glowStrength: "شدة التوهج",
      glowBlend: "وضع دمج التوهج",
      colors: "الألوان",
      colorBackground: "الخلفية",
      colorGrid: "الشبكة",
      colorAlive1: "حية 1",
      colorAlive2: "حية 2+",
      colorAlive10: "حية 10+",
      shipsPerSpawn: "عدد السفن في كل توليد",
      spawnPeriod: "فترة التوليد (خطوات)",
      status: "الحالة",
      density: "الكثافة p",
      soundsAtOnce: "أصوات متزامنة",
      exitHint: "اضغط Esc للخروج من ملء الشاشة",
      canvasLabel: "محاكاة لعبة الحياة",
    },
  };

  // Attributes that can carry a translated string, as data-i18n-<attribute>.
  const TRANSLATED_ATTRIBUTES = ["title", "aria-label"];

  const listeners = [];
  let current = DEFAULT_LANGUAGE;

  function findLanguage(code) {
    return LANGUAGES.find((language) => language.code === code) || null;
  }

  // Storage can be blocked (private window, file:// in some browsers); the
  // page then simply starts in English every time.
  function readStoredLanguage() {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      return null;
    }
  }

  function storeLanguage(code) {
    try {
      window.localStorage.setItem(STORAGE_KEY, code);
    } catch (error) {
      // Not remembered; nothing else depends on it.
    }
  }

  function t(key, params = {}) {
    const text = STRINGS[current][key] ?? STRINGS[DEFAULT_LANGUAGE][key] ?? key;
    return text.replace(/\{(\w+)\}/g, (match, name) =>
      name in params ? String(params[name]) : match
    );
  }

  function getFlagUrl(language) {
    return `flags/${language.flag}.svg`;
  }

  function applyToDocument() {
    const language = findLanguage(current);
    document.documentElement.lang = language.code;
    document.title = t("title");

    document.querySelectorAll("[data-i18n]").forEach((node) => {
      node.textContent = t(node.dataset.i18n);
    });
    TRANSLATED_ATTRIBUTES.forEach((attribute) => {
      const source = `data-i18n-${attribute}`;
      document.querySelectorAll(`[${source}]`).forEach((node) => {
        node.setAttribute(attribute, t(node.getAttribute(source)));
      });
    });

    // Only the panel mirrors for a right-to-left language: the field and its
    // pitch ruler are a picture, not text.
    const panel = document.querySelector(".panel");
    if (panel) panel.dir = language.rtl ? "rtl" : "ltr";

    const flag = document.getElementById("langFlag");
    const name = document.getElementById("langName");
    if (flag) flag.src = getFlagUrl(language);
    if (name) name.textContent = language.name;
    document.querySelectorAll(".lang-option").forEach((option) => {
      option.setAttribute("aria-pressed", String(option.lang === current));
    });
  }

  function setLanguage(code) {
    const language = findLanguage(code);
    if (!language) return;
    current = language.code;
    storeLanguage(current);
    applyToDocument();
    listeners.forEach((listener) => listener(current));
  }

  function renderMenu() {
    const menu = document.getElementById("langMenu");
    const list = document.getElementById("langList");
    if (!menu || !list) return;

    LANGUAGES.forEach((language) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "lang-option";
      option.lang = language.code;

      const flag = document.createElement("img");
      flag.className = "lang-flag";
      flag.src = getFlagUrl(language);
      flag.alt = "";
      flag.loading = "lazy";

      option.append(flag, language.name);
      option.addEventListener("click", () => {
        setLanguage(language.code);
        menu.open = false;
      });
      list.appendChild(option);
    });

    document.addEventListener("pointerdown", (event) => {
      if (menu.open && !menu.contains(event.target)) menu.open = false;
    });
    menu.addEventListener("keydown", (event) => {
      if (event.code !== "Escape" || !menu.open) return;
      menu.open = false;
      menu.querySelector("summary").focus();
    });
  }

  renderMenu();
  current = findLanguage(readStoredLanguage()) ? readStoredLanguage() : DEFAULT_LANGUAGE;
  applyToDocument();

  globalThis.I18n = {
    LANGUAGES,
    t,
    setLanguage,
    getLanguage: () => current,
    onChange: (listener) => listeners.push(listener),
  };
})();
