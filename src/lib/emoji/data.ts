/**
 * Compact unicode emoji set, bundled instead of pulled from npm so the static
 * export stays dependency-free. Each entry is "<emoji> <keyword> <keyword>…";
 * keywords are Hungarian first, English second, both are searchable.
 */
export interface EmojiEntry {
  char: string;
  keywords: string[];
}

export interface EmojiCategory {
  id: string;
  /** Hungarian category name shown in the picker. */
  label: string;
  /** Rendered in the category rail. */
  icon: string;
  emojis: EmojiEntry[];
}

const RAW: Array<[id: string, label: string, icon: string, entries: string]> = [
  [
    "smileys",
    "Arcok és érzelmek",
    "😀",
    `😀 vigyor mosoly grin
😃 mosoly vidam smile
😄 nevet vidam happy
😁 vigyor fogak beaming
😆 rohog nevetes laugh
😅 izzad nevetes sweat
🤣 rofl padlo rolling
😂 sirva nevet joy konny
🙂 mosoly enyhe slight
🙃 forditott upside
😉 kacsint wink
😊 boldog pir blush
😇 angyal szent halo
🥰 szerelmes szivek love
😍 szivszem heart-eyes
🤩 csillagszem star-struck
😘 puszi csok kiss
😗 csok kiss
😚 csok kiss
🥲 konnyes mosoly tear
😋 nyami finom yum
😛 nyelv tongue
😜 kacsint nyelv zany
🤪 bolond orult crazy
😝 nyelv squint
🤑 penz money dollar
🤗 olel hug
🤭 kuncog giggle
🤫 csend halk shush
🤔 gondolkodik think
🤐 befogja zipper
🤨 szemoldok raised-brow
😐 semleges neutral
😑 kifejezestelen expressionless
😶 nema no-mouth
😏 fanyar smirk
😒 unott unamused
🙄 forgatja szemet eyeroll
😬 fintor grimace
🤥 hazudik lying pinocchio
😌 megkonnyebbult relieved
😔 szomoru pensive
😪 almos sleepy
🤤 nyal drool
😴 alszik sleep zzz
😷 maszk mask beteg
🤒 lazas beteg thermometer
🤕 serult bandage
🤢 hanyinger nauseated
🤮 hany vomit
🤧 tusszent sneeze
🥵 forro hot
🥶 fazik cold
🥴 kabult woozy
😵 szedul dizzy
🤯 fejrobbanas mind-blown
🤠 cowboy kalap
🥳 bulizik party
😎 napszemuveg cool sunglasses
🤓 kocka nerd
🧐 monokli monocle
😕 zavart confused
😟 aggodo worried
🙁 szomoru frown
😮 meglepett open-mouth
😯 hukkent hushed
😲 dobbent astonished
😳 elpirul flushed
🥺 konyorgo pleading
😦 homlokranc frowning
😧 gyotort anguished
😨 fel fearful
😰 hideg verejtek anxious
😥 csalodott sad
😢 sir cry
😭 zokog sobbing
😱 sikolt scream
😖 zavarodott confounded
😣 kitart persevere
😞 csalodott disappointed
😓 verejtek downcast
😩 kimerult weary
😫 fáradt tired
🥱 asit yawn
😤 dühos triumph gozol
😡 dühos pouting angry
😠 merges angry
🤬 karomkodik cursing
😈 ordog devil
👿 ordog imp
💀 koponya skull halal
☠️ kalozzaszlo skull-crossbones
💩 kaki poop
🤡 bohoc clown
👻 szellem ghost
👽 ufo alien
🤖 robot bot
😺 macska cat
😹 macska nevet
😻 macska szerelmes
🙀 macska ijedt
😿 macska sir
😾 macska merges`,
  ],
  [
    "people",
    "Emberek és kezek",
    "👋",
    `👋 integet wave szia
🤚 kez hand
🖐️ tenyer hand
✋ megall stop tenyer
🖖 vulkan spock
👌 ok rendben
🤌 csipet olasz pinch
🤏 kicsi pinch
✌️ beke victory
🤞 szorit fingers-crossed
🤟 szeretlek love-you
🤘 rock szarv
🤙 hivj call-me
👈 balra left
👉 jobbra right
👆 fel up
👇 le down
☝️ mutat index
👍 tetszik like thumbs-up
👎 nem tetszik dislike thumbs-down
✊ okol fist
👊 utes punch
🤛 balokol fist
🤜 jobbokol fist
👏 taps clap
🙌 hurra raised-hands
👐 nyitott tenyer
🤲 kerlek palms
🤝 kezfogas handshake
🙏 kerlek ima pray thanks
✍️ ir writing
💅 korom nail
🤳 szelfi selfie
💪 izom muscle biceps
🦾 protezis mechanical-arm
🧠 agy brain
👀 szemek eyes nezes
👁️ szem eye
👄 szaj mouth
🫀 sziv szerv
🧑 szemely person
👶 baba baby
🧒 gyerek child
👦 fiu boy
👧 lany girl
👩 no woman
👨 ferfi man
🧔 szakall beard
👵 nagyi old-woman
👴 nagypapa old-man
👮 rendor police
🕵️ nyomozo detective
👷 munkas worker
🤴 herceg prince
👸 hercegno princess
🧑‍💻 fejleszto developer programozo
🧑‍🚀 urhajos astronaut
🧑‍🍳 szakacs chef
🦸 szuperhos superhero
🦹 gonosztevo villain
🧙 varazslo mage
🧚 tunder fairy
🧛 vampir vampire
🧜 sellő mermaid
🧝 elf
🧞 dzsinn genie
🧟 zombi zombie
💃 tancos dancer
🕺 tancol dancing
🧗 maszik climbing
🏃 fut running
🚶 setal walking
🧍 all standing
🧎 terdel kneeling
👫 par couple
👪 csalad family
🗣️ beszel speaking
👤 sziluett silhouette
🫂 olelkezes hugging`,
  ],
  [
    "nature",
    "Állatok és természet",
    "🌿",
    `🐶 kutya dog kutyus
🐱 macska cat cica
🐭 eger mouse
🐹 hörcsög hamster
🐰 nyul rabbit
🦊 roka fox
🐻 medve bear
🐼 panda
🐨 koala
🐯 tigris tiger
🦁 oroszlan lion
🐮 tehen cow
🐷 malac pig
🐸 beka frog
🐵 majom monkey
🙈 nem latom see-no-evil
🙉 nem hallom hear-no-evil
🙊 nem mondom speak-no-evil
🐔 csirke chicken
🐧 pingvin penguin
🐦 madar bird
🦆 kacsa duck
🦅 sas eagle
🦉 bagoly owl
🦇 denever bat
🐺 farkas wolf
🐗 vaddiszno boar
🐴 lo horse
🦄 egyszarvu unicorn
🐝 meh bee
🐛 hernyo bug hiba
🦋 pillango butterfly
🐌 csiga snail
🐞 katica ladybug
🐜 hangya ant
🕷️ pok spider
🦂 skorpio scorpion
🐢 teknos turtle
🐍 kigyo snake
🦎 gyik lizard
🐙 polip octopus
🦑 tintahal squid
🦐 garnela shrimp
🦀 rak crab
🐡 gombhal pufferfish
🐠 hal fish tropical
🐟 hal fish
🐬 delfin dolphin
🐳 balna whale
🦈 capa shark
🐊 krokodil crocodile
🐅 tigris tiger
🦓 zebra
🦍 gorilla
🐘 elefant elephant
🦏 orrszarvu rhino
🐪 teve camel
🦒 zsiraf giraffe
🐃 bivaly buffalo
🐄 tehen cow
🐖 diszno pig
🐑 barany sheep
🐐 kecske goat
🦌 szarvas deer
🐕 kutya dog
🐩 pudli poodle
🐈 macska cat
🐓 kakas rooster
🦃 pulyka turkey
🕊️ galamb dove beke
🐇 nyul rabbit
🐁 eger mouse
🐿️ mokus chipmunk
🦔 sun hedgehog
🌵 kaktusz cactus
🎄 karacsonyfa christmas-tree
🌲 fenyo evergreen
🌳 fa tree
🌴 palma palm
🌱 palanta seedling
🌿 novény herb
☘️ lohere shamrock
🍀 negylevelu clover szerencse
🍁 juharlevel maple
🍂 avar fallen-leaf osz
🍃 levelek leaves szel
🌾 kalasz rice
💐 csokor bouquet
🌷 tulipan tulip
🌹 rozsa rose
🥀 hervadt wilted
🌺 hibiszkusz hibiscus
🌸 cseresznyevirag blossom sakura
🌼 viragszal daisy
🌻 napraforgo sunflower
🌞 nap sun
🌝 holdarc moon
🌛 hold moon
🌜 hold moon
🌚 ujhold new-moon
🌙 holdsarlo crescent
⭐ csillag star
🌟 ragyogo star2
✨ csillamok sparkles
⚡ villam zap lightning
🔥 tuz fire lang
💥 robbanas boom
☄️ ustokos comet
🌈 szivarvany rainbow
☀️ napsutes sunny
⛅ felhos partly-cloudy
☁️ felho cloud
🌧️ eso rain
⛈️ vihar storm
❄️ hopehely snowflake
⛄ hoember snowman
💧 csepp droplet
🌊 hullam wave viz
🌍 fold earth vilag
🌋 vulkan volcano
🏔️ hegy mountain`,
  ],
  [
    "food",
    "Étel és ital",
    "🍕",
    `🍏 alma apple
🍎 alma apple
🍐 korte pear
🍊 narancs orange
🍋 citrom lemon
🍌 banan banana
🍉 gorogdinnye watermelon
🍇 szolo grapes
🍓 eper strawberry
🫐 afonya blueberry
🍈 dinnye melon
🍒 cseresznye cherries
🍑 oszibarack peach
🥭 mango
🍍 ananasz pineapple
🥥 kokusz coconut
🥝 kivi kiwi
🍅 paradicsom tomato
🥑 avokado avocado
🍆 padlizsan eggplant
🥔 krumpli potato
🥕 sargarepa carrot
🌽 kukorica corn
🌶️ csili chili paprika
🥒 uborka cucumber
🥬 salata leafy
🥦 brokkoli broccoli
🧄 fokhagyma garlic
🧅 hagyma onion
🍄 gomba mushroom
🥜 mogyoro peanuts
🌰 gesztenye chestnut
🍞 kenyer bread
🥐 croissant kifli
🥖 bagett baguette
🥨 perec pretzel
🧀 sajt cheese
🥚 tojas egg
🍳 tukortojas fried-egg
🥞 palacsinta pancakes
🧇 gofri waffle
🥓 bacon szalonna
🍔 hamburger burger
🍟 sultkrumpli fries
🍕 pizza
🌭 hotdog virsli
🥪 szendvics sandwich
🌮 taco
🌯 burrito
🥙 pita
🧆 falafel
🥘 serpenyo paella
🍲 leves stew
🍜 ramec tesztaleves ramen
🍝 spagetti spaghetti teszta
🍛 curry rizs
🍣 sushi
🍤 rantott garnela tempura
🍱 bento doboz
🥟 gomboc dumpling
🍚 rizs rice
🍙 rizsgolyo onigiri
🍥 halrud narutomaki
🥠 szerencsesuti fortune-cookie
🍦 fagylalt ice-cream
🍧 jegkasa shaved-ice
🍨 fagyi ice-cream
🍩 fank donut
🍪 keksz cookie suti
🎂 torta birthday-cake szulinap
🍰 sutemeny cake
🧁 muffin cupcake
🥧 pite pie
🍫 csoki chocolate
🍬 cukorka candy
🍭 nyalóka lollipop
🍯 mez honey
🍼 cumisuveg baby-bottle
🥛 tej milk
☕ kave coffee
🍵 tea
🧃 gyumolcsle juice
🥤 udito soda pohar
🍺 sor beer
🍻 sorozes cheers
🍷 bor wine
🥂 pezsgo champagne koccintas
🍸 koktel cocktail
🍹 trópusi ital tropical
🥃 whisky
🧊 jegkocka ice
🍴 evoeszkoz fork-knife
🥄 kanal spoon
🍽️ tanyer plate`,
  ],
  [
    "activity",
    "Tevékenységek",
    "⚽",
    `⚽ foci soccer labda
🏀 kosarlabda basketball
🏈 amerikai foci football
⚾ baseball
🥎 softball
🎾 tenisz tennis
🏐 rolabda volleyball
🏉 rögbi rugby
🥏 frizbi frisbee
🎱 biliárd 8ball
🏓 pingpong ping-pong
🏸 tollaslabda badminton
🥅 kapu goal
🏒 jeghoki hockey
🏑 gyeplabda field-hockey
🥍 lacrosse
🏏 krikett cricket
⛳ golf
🏹 ijaszat archery
🎣 horgaszat fishing
🥊 boksz boxing
🥋 harcmuveszet martial-arts
🎽 futotrikó running-shirt
⛸️ korcsolya skate
🎿 si ski
🛷 szanko sled
🏂 snowboard
🏋️ sulyemeles weightlifting
🤼 birkozas wrestling
🤸 akrobatika cartwheel
⛹️ labdapattogtatas bouncing-ball
🤺 vivas fencing
🏇 lovaglas horse-racing
🧘 jóga yoga meditacio
🏄 szorf surfing
🏊 uszas swimming
🤽 vizilabda water-polo
🚣 evezes rowing
🧗 sziklamaszas climbing
🚴 kerekpar cycling
🚵 hegyi bicikli mountain-biking
🏆 kupa trophy gyozelem
🥇 arany gold first
🥈 ezust silver second
🥉 bronz bronze third
🏅 erem medal
🎖️ kituntetes military-medal
🎗️ szalag ribbon
🎫 jegy ticket
🎟️ belepo admission
🎪 cirkusz circus
🎭 szinhaz theater
🎨 festes art paletta
🎬 film clapper
🎤 mikrofon microphone enek
🎧 fejhallgato headphone zene
🎼 kotta musical-score
🎹 zongora piano
🥁 dob drum
🎷 szaxofon saxophone
🎺 trombita trumpet
🎸 gitar guitar
🎻 hegedu violin
🎲 kocka dice jatek
♟️ sakk chess
🎯 celtabla dart cel
🎳 bowling
🎮 jatekvezerlo gaming controller
🕹️ joystick
🎰 nyerogep slot
🧩 puzzle kirako
🪁 sarkany kite
🎈 lufi balloon
🎉 konfetti party tada
🎊 konfettigömb confetti
🎁 ajandek gift
🎏 szélzsák carp
🎑 holdunnep moon-ceremony
🧧 piros boritek red-envelope`,
  ],
  [
    "objects",
    "Tárgyak és utazás",
    "💻",
    `💻 laptop szamitogep computer
🖥️ asztali gep desktop
🖨️ nyomtato printer
⌨️ billentyuzet keyboard
🖱️ eger mouse
💽 lemez disk
💾 floppy mentes save
💿 cd
📀 dvd
📱 telefon mobile phone
☎️ telefon phone
📞 kagylo receiver
📟 pager
📠 fax
📺 tv televizio
📻 radio
🎙️ studio mikrofon
⏱️ stopper stopwatch
⏰ ebreszto alarm
⌚ ora watch
⏳ homokora hourglass
🔋 akkumulator battery
🔌 konnektor plug
💡 otlet bulb lampa
🔦 zseblampa flashlight
🕯️ gyertya candle
🧯 tuzolto extinguisher
🛢️ olajhordo oil
💸 penz repul money-wings
💵 dollar cash
💴 jen yen
💶 euro
💷 font pound
💰 penzeszsak moneybag
💳 bankkartya credit-card
🧾 szamla receipt
💎 gyemant gem
⚖️ merleg scales
🔧 csavarkulcs wrench
🔨 kalapacs hammer
🛠️ szerszamok tools
⚙️ fogaskerek gear beallitas
🔩 csavar nut-bolt
⛓️ lanc chains
🔒 zar lock zarva
🔓 nyitott zar unlock
🔑 kulcs key
🗝️ regi kulcs old-key
🚪 ajto door
🪑 szek chair
🛏️ agy bed
🚿 zuhany shower
🛁 kad bath
🧹 sepru broom
🧺 kosar basket
🧻 wc papir toilet-paper
🔍 nagyito search kereses
🔎 nagyito search
📡 antenna satellite
📢 hangszoro loudspeaker
📣 megafon megaphone
🔔 csengo bell ertesites
🔕 nema bell no-bell
📚 konyvek books
📖 nyitott konyv open-book
📓 jegyzetfuzet notebook
📒 fozet ledger
📄 lap page
📃 dokumentum document
📑 konyvjelzok bookmarks
📊 oszlopdiagram bar-chart
📈 novekvo chart-up
📉 csokkeno chart-down
📋 vagolap clipboard
📌 gombostu pushpin
📍 helyszin round-pin
📎 gemkapocs paperclip
✂️ ollo scissors
🗑️ kuka trash torles
📦 doboz package csomag
📧 email
✉️ boritek envelope
📨 bejovo incoming-mail
📤 kimeno outbox
📥 bejovo inbox
🗂️ mappak card-index
📁 mappa folder
📂 nyitott mappa open-folder
🗓️ naptar calendar
📅 datum date
🖊️ toll pen
✏️ ceruza pencil
🖌️ ecset paintbrush
📝 jegyzet memo iras
🚗 auto car
🚕 taxi
🚌 busz bus
🚑 mento ambulance
🚓 rendorauto police-car
🚒 tuzolto fire-engine
🏍️ motor motorcycle
🚲 bicikli bicycle
🛴 roller scooter
✈️ repulo airplane
🚀 raketa rocket inditas
🛸 ufo
🚁 helikopter helicopter
🚢 hajo ship
⛵ vitorlas sailboat
🚂 vonat train
🚇 metro
🗺️ terkep map
🧭 iranytu compass
🏠 haz house
🏢 iroda office
🏥 korhaz hospital
🏦 bank
🏫 iskola school
🗼 torony tower
🗽 szabadsagszobor statue-of-liberty
⛺ satr tent
🌃 ejszaka night-city`,
  ],
  [
    "symbols",
    "Szimbólumok",
    "❤️",
    `❤️ sziv heart szerelem
🧡 narancs sziv orange-heart
💛 sarga sziv yellow-heart
💚 zold sziv green-heart
💙 kek sziv blue-heart
💜 lila sziv purple-heart
🖤 fekete sziv black-heart
🤍 feher sziv white-heart
🤎 barna sziv brown-heart
💔 tort sziv broken-heart
❣️ felkialto sziv heart-exclamation
💕 ket sziv two-hearts
💞 forgo szivek revolving
💓 dobogo sziv beating
💗 novekvo sziv growing
💖 csillogo sziv sparkling
💘 nyilas sziv cupid
💝 ajandek sziv gift-heart
💯 szazalek hundred perfect
💢 dühjel anger
💬 buborek speech chat
💭 gondolat thought
🗯️ kiabalas right-anger
💤 alvas zzz
✅ pipa check kesz ok
☑️ bejelolve ballot-check
✔️ pipa heavy-check
❌ x cross hiba
❎ x negative-cross
➕ plusz plus
➖ minusz minus
➗ osztas divide
✖️ szorzas multiply
❓ kerdojel question
❔ kerdojel white-question
❗ felkialtojel exclamation
❕ felkialtojel white-exclamation
‼️ ketto felkialto double-exclamation
⁉️ felkialto kerdo interrobang
⚠️ figyelmeztetes warning vigyazat
🚫 tiltva no-entry
⛔ belepni tilos no-entry-sign
🔞 tizennyolc no-under-18
♻️ ujrahasznositas recycle
🔰 kezdo beginner
⚜️ liliom fleur-de-lis
🔱 szigony trident
📛 nevtabla name-badge
🔴 piros kor red-circle
🟠 narancs kor orange-circle
🟡 sarga kor yellow-circle
🟢 zold kor green-circle
🔵 kek kor blue-circle
🟣 lila kor purple-circle
⚫ fekete kor black-circle
⚪ feher kor white-circle
🟥 piros negyzet red-square
🟧 narancs negyzet orange-square
🟨 sarga negyzet yellow-square
🟩 zold negyzet green-square
🟦 kek negyzet blue-square
🟪 lila negyzet purple-square
⬛ fekete negyzet black-square
⬜ feher negyzet white-square
🔶 narancs rombusz diamond
🔷 kek rombusz diamond
🔺 piros haromszog triangle-up
🔻 piros haromszog triangle-down
▶️ lejatszas play
⏸️ szunet pause
⏹️ megallit stop
⏺️ felvetel record
⏭️ kovetkezo next
⏮️ elozo previous
⏩ elore fast-forward
⏪ vissza rewind
🔀 kevert shuffle
🔁 ismetles repeat
🔂 egy ismetles repeat-one
🔼 fel up
🔽 le down
⤴️ jobbra fel arrow-up
⤵️ jobbra le arrow-down
🔄 frissites refresh sync
🆗 ok
🆕 uj new
🆒 cool
🆓 ingyenes free
🔝 top
🔜 hamarosan soon
🔙 vissza back
♾️ vegtelen infinity
©️ copyright
®️ registered
™️ trademark
#️⃣ hashtag
*️⃣ csillag asterisk
0️⃣ nulla zero
1️⃣ egy one
2️⃣ ketto two
3️⃣ harom three
4️⃣ negy four
5️⃣ ot five
6️⃣ hat six
7️⃣ het seven
8️⃣ nyolc eight
9️⃣ kilenc nine
🔟 tiz ten`,
  ],
];

export const EMOJI_CATEGORIES: EmojiCategory[] = RAW.map(([id, label, icon, entries]) => ({
  id,
  label,
  icon,
  emojis: entries
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [char, ...keywords] = line.split(" ");
      return { char, keywords };
    }),
}));

export const ALL_EMOJIS: EmojiEntry[] = EMOJI_CATEGORIES.flatMap((category) => category.emojis);

/** Diacritics are dropped so "dühös" and "duhos" both match. */
function fold(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function searchEmojis(query: string, limit = 120): EmojiEntry[] {
  const needle = fold(query.trim());
  if (!needle) return [];
  const starts: EmojiEntry[] = [];
  const contains: EmojiEntry[] = [];
  for (const entry of ALL_EMOJIS) {
    if (entry.char === query) {
      starts.unshift(entry);
      continue;
    }
    const folded = entry.keywords.map(fold);
    if (folded.some((keyword) => keyword.startsWith(needle))) starts.push(entry);
    else if (folded.some((keyword) => keyword.includes(needle))) contains.push(entry);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}
