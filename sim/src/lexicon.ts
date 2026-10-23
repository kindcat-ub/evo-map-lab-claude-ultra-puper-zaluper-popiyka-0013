// Vocabulary of the simulated world. Everything here is invented and generic:
// no real projects, people or products. Slots are always nominative and quoted
// in RU templates so the generator never has to decline words.

export type Pair = readonly [ru: string, en: string];

// A part of a project: what decisions are made about and what breaks.
export interface Part {
  name: Pair;
  options: Pair[]; // mutually exclusive alternatives for this part, >= 2
  problems: Pair[];
}

export interface Archetype {
  key: string;
  noun: Pair; // what kind of thing the project is
  tags: string[];
  parts: Part[];
  milestones: Pair[];
  release: "photo" | "audio" | "doc" | "diagram";
  questions: Pair[]; // originating questions
}

export const ARCHETYPES: Archetype[] = [
  {
    key: "device",
    noun: ["портативный приёмник", "portable receiver"],
    tags: ["hardware", "radio"],
    parts: [
      { name: ["питание", "power stage"], options: [["литиевая ячейка", "lithium cell"], ["сменные батарейки", "swappable batteries"], ["суперконденсатор", "supercapacitor"]], problems: [["утечка тока во сне", "sleep current leak"], ["перегрев", "overheating"]] },
      { name: ["корпус", "enclosure"], options: [["печатный корпус", "printed case"], ["фрезерованный алюминий", "milled aluminium"]], problems: [["трещина в креплении", "cracked mount"], ["перегрев", "overheating"]] },
      { name: ["антенна", "antenna"], options: [["штыревая антенна", "whip antenna"], ["антенна на плате", "PCB antenna"]], problems: [["провал приёма в помещении", "indoor reception drop"], ["помехи от преобразователя", "converter noise"]] },
      { name: ["прошивка", "firmware"], options: [["свой загрузчик", "custom bootloader"], ["готовый загрузчик", "stock bootloader"]], problems: [["зависание при старте", "hang on boot"], ["дребезг кнопки", "button bounce"]] },
    ],
    milestones: [["первая плата ожила", "first board boots"], ["приём на улице", "outdoor reception works"], ["неделя на одном заряде", "a week on one charge"]],
    release: "photo",
    questions: [["Можно ли слушать эфир, не таская с собой ноутбук?", "Can one listen to the air without carrying a laptop?"]],
  },
  {
    key: "tool",
    noun: ["инструмент для заметок", "note-taking tool"],
    tags: ["software", "cli"],
    parts: [
      { name: ["хранилище", "storage"], options: [["SQLite", "SQLite"], ["плоские файлы", "flat files"]], problems: [["битый индекс после сбоя", "corrupt index after crash"], ["гонка при записи", "write race"]] },
      { name: ["синхронизация", "sync"], options: [["CRDT", "CRDTs"], ["последняя запись побеждает", "last write wins"]], problems: [["рассинхрон между устройствами", "cross-device drift"], ["потеря правок", "lost edits"]] },
      { name: ["поиск", "search"], options: [["полнотекстовый индекс", "full-text index"], ["векторный поиск", "vector search"]], problems: [["мусор в выдаче", "junk results"], ["рост памяти", "memory growth"]] },
      { name: ["сборка", "packaging"], options: [["один бинарник", "single binary"], ["набор скриптов", "a bundle of scripts"]], problems: [["медленный холодный старт", "slow cold start"]] },
    ],
    milestones: [["первая заметка нашлась поиском", "first note found by search"], ["синхронизация двух машин", "two machines in sync"], ["тысяча заметок без тормозов", "a thousand notes, no lag"]],
    release: "diagram",
    questions: [["Почему старые заметки невозможно найти, когда они нужны?", "Why are old notes impossible to find when they matter?"]],
  },
  {
    key: "album",
    noun: ["альбом", "album"],
    tags: ["music"],
    parts: [
      { name: ["ритм-секция", "rhythm section"], options: [["живые барабаны", "live drums"], ["драм-машина", "drum machine"]], problems: [["плывущий темп", "drifting tempo"]] },
      { name: ["синт-партии", "synth parts"], options: [["аналоговый синт", "analog synth"], ["софт-синт", "soft synth"]], problems: [["фазовая каша", "phase smear"], ["расстройка на холоде", "detuning in the cold"]] },
      { name: ["запись", "tracking"], options: [["запись дома", "home recording"], ["студия", "studio"]], problems: [["шум комнаты", "room noise"]] },
      { name: ["сведение", "mix"], options: [["моно", "mono"], ["широкое стерео", "wide stereo"]], problems: [["муть в низах", "muddy low end"], ["клиппинг на мастере", "master clipping"]] },
    ],
    milestones: [["первый трек сведён", "first track mixed"], ["демо на четыре трека", "four-track demo"], ["финальный порядок треков", "final track order"]],
    release: "audio",
    questions: [["Как звучит город в четыре утра?", "What does a city sound like at 4 am?"]],
  },
  {
    key: "game",
    noun: ["маленькая игра", "small game"],
    tags: ["game", "software"],
    parts: [
      { name: ["механика", "core mechanic"], options: [["пошаговый режим", "turn-based"], ["реальное время", "real-time"]], problems: [["скучная середина", "boring midgame"]] },
      { name: ["уровни", "levels"], options: [["ручные уровни", "hand-made levels"], ["процедурные уровни", "procedural levels"]], problems: [["софтлок на третьем уровне", "softlock on level three"]] },
      { name: ["физика", "physics"], options: [["фиксированный шаг физики", "fixed physics step"], ["переменный шаг", "variable step"]], problems: [["рассинхрон физики", "physics desync"], ["проваливание сквозь пол", "falling through the floor"]] },
      { name: ["сохранения", "save system"], options: [["сохранение в любой момент", "save anywhere"], ["контрольные точки", "checkpoints"]], problems: [["потеря сохранений", "lost saves"]] },
    ],
    milestones: [["играбельный прототип", "playable prototype"], ["первый внешний тест", "first outside playtest"], ["вертикальный срез", "vertical slice"]],
    release: "photo",
    questions: [["Может ли игра научить терпению, не наказывая?", "Can a game teach patience without punishing?"]],
  },
  {
    key: "study",
    noun: ["исследование", "study"],
    tags: ["research", "data"],
    parts: [
      { name: ["разметка", "labeling"], options: [["ручная разметка", "manual labeling"], ["автоматическая разметка", "automatic labeling"]], problems: [["шум в данных", "noisy data"]] },
      { name: ["модель", "model"], options: [["простая регрессия", "plain regression"], ["дерево решений", "decision tree"]], problems: [["невоспроизводимый результат", "irreproducible result"], ["переобучение", "overfitting"]] },
      { name: ["замеры", "measurements"], options: [["ежедневные замеры", "daily measurements"], ["еженедельные замеры", "weekly measurements"]], problems: [["пропуски в логах", "gaps in the logs"], ["смещение выборки", "sampling bias"]] },
    ],
    milestones: [["первые сто записей", "first hundred records"], ["первый устойчивый эффект", "first stable effect"], ["отчёт для себя", "a write-up for myself"]],
    release: "doc",
    questions: [["Влияет ли время суток на качество решений?", "Does time of day change how well one decides?"]],
  },
  {
    key: "installation",
    noun: ["световая инсталляция", "light installation"],
    tags: ["art", "hardware"],
    parts: [
      { name: ["свет", "lighting"], options: [["адресные ленты", "addressable strips"], ["прожекторы", "spotlights"]], problems: [["мерцание на камерах", "flicker on cameras"], ["просадка питания", "power sag"]] },
      { name: ["датчики", "sensing"], options: [["ИК-датчик", "IR sensor"], ["камера глубины", "depth camera"]], problems: [["ложные срабатывания", "false triggers"]] },
      { name: ["каркас", "frame"], options: [["дерево", "wood"], ["сталь", "steel"]], problems: [["вибрация", "vibration"]] },
      { name: ["звук", "sound"], options: [["один сабвуфер", "a single subwoofer"], ["кольцо колонок", "a ring of speakers"]], problems: [["шум вентиляторов", "fan noise"]] },
    ],
    milestones: [["первый свет в темноте", "first light in the dark"], ["полный цикл сценария", "full sequence cycle"], ["показ для друзей", "showing for friends"]],
    release: "photo",
    questions: [["Может ли комната отвечать на присутствие, а не на движение?", "Can a room respond to presence rather than motion?"]],
  },
];

// Code names for projects. Invented, evocative, no real product names.
export const CODENAMES: Pair[] = [
  ["Маяк", "Beacon"], ["Сорока", "Magpie"], ["Полынь", "Wormwood"], ["Отлив", "Ebb"], ["Кочевник", "Nomad"],
  ["Шорох", "Rustle"], ["Ледокол", "Icebreaker"], ["Свиристель", "Waxwing"], ["Пустошь", "Moor"], ["Фонарщик", "Lamplighter"],
  ["Камыш", "Reed"], ["Зимовье", "Winterhold"], ["Перевал", "Pass"], ["Сверчок", "Cricket"], ["Солончак", "Saltflat"], ["Омут", "Pool"],
];

// Invented author personas.
export const AUTHORS: Pair[] = [
  ["Ада Ласточкина", "Ada Lastochkina"], ["Мирон Северин", "Miron Severin"], ["Нина Окунева", "Nina Okuneva"],
  ["Ярослав Гарин", "Yaroslav Garin"], ["Тая Тихомирова", "Taya Tikhomirova"], ["Глеб Бельский", "Gleb Belsky"],
];

export const LIFE_EVENTS: Pair[] = [
  ["Переезд в другой город", "Moving to another city"],
  ["Новая работа на полный день", "A new full-time job"],
  ["Два месяца болезни", "Two months of illness"],
  ["Длинный отпуск без компьютера", "A long holiday without a computer"],
  ["Ремонт в мастерской", "Workshop renovation"],
];

export const LITERARY: Pair[] = [
  ["Ночь. Всё снова молчит.", "Night. Everything is silent again."],
  ["Кажется, это уже было.", "This feels familiar."],
  ["Дверь, которую годами никто не замечал.", "A door unnoticed for years."],
  ["Утро пахнет припоем.", "The morning smells of solder."],
  ["Тишина длиннее, чем хотелось бы.", "The silence lasts longer than it should."],
  ["Где-то в другой комнате ответ уже лежит.", "Somewhere in another room the answer is already waiting."],
  ["Список дел растёт быстрее, чем гаснет лампа.", "The to-do list grows faster than the lamp fades."],
  ["Шаг назад, чтобы увидеть всю стену.", "A step back to see the whole wall."],
];
