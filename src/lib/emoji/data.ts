/**
 * Compact unicode emoji set, bundled instead of pulled from npm so the static
 * export stays dependency-free. Each entry is "<emoji> <keyword> <keyword>…";
 * every keyword is searchable.
 */
export interface EmojiEntry {
  char: string;
  keywords: string[];
}

export interface EmojiCategory {
  id: string;
  /** Category name shown in the picker. */
  label: string;
  /** Rendered in the category rail. */
  icon: string;
  emojis: EmojiEntry[];
}

const RAW: Array<[id: string, label: string, icon: string, entries: string]> = [
  [
    "smileys",
    "Smileys & emotion",
    "😀",
    `😀 grin smile happy
😃 smile happy open
😄 happy laugh smile
😁 beaming grin teeth
😆 laugh squint lol
😅 sweat laugh nervous
🤣 rofl rolling laugh
😂 joy tears laugh
🙂 slight-smile
🙃 upside-down silly
😉 wink
😊 blush happy smile
😇 angel halo innocent
🥰 love hearts adore
😍 heart-eyes love
🤩 star-struck amazed
😘 kiss blow-kiss
😗 kiss
😚 kiss closed-eyes
🥲 tear smile happy-cry
😋 yum tasty delicious
😛 tongue
😜 zany wink tongue
🤪 crazy wild goofy
😝 squint tongue
🤑 money dollar rich
🤗 hug hugging
🤭 giggle oops
🤫 shush quiet silence
🤔 think thinking hmm
🤐 zipper silent
🤨 raised-brow skeptical
😐 neutral
😑 expressionless blank
😶 no-mouth speechless
😏 smirk
😒 unamused meh
🙄 eyeroll annoyed
😬 grimace awkward
🤥 lying pinocchio
😌 relieved calm
😔 pensive sad
😪 sleepy tired
🤤 drool
😴 sleep zzz asleep
😷 mask sick
🤒 thermometer sick fever
🤕 bandage hurt injured
🤢 nauseated sick
🤮 vomit puke
🤧 sneeze
🥵 hot overheated
🥶 cold freezing
🥴 woozy dizzy
😵 dizzy knocked-out
🤯 mind-blown shocked
🤠 cowboy hat
🥳 party celebrate
😎 cool sunglasses
🤓 nerd glasses
🧐 monocle inspect
😕 confused
😟 worried
🙁 frown sad
😮 open-mouth surprised
😯 hushed
😲 astonished shocked
😳 flushed embarrassed
🥺 pleading puppy-eyes
😦 frowning
😧 anguished
😨 fearful scared
😰 anxious cold-sweat
😥 sad disappointed
😢 cry sad tear
😭 sobbing bawling cry
😱 scream fear
😖 confounded
😣 persevere
😞 disappointed
😓 downcast sweat
😩 weary exhausted
😫 tired fed-up
🥱 yawn bored
😤 triumph steam huff
😡 pouting angry rage
😠 angry mad
🤬 cursing swearing
😈 devil mischievous
👿 imp devil angry
💀 skull dead
☠️ skull-crossbones danger
💩 poop
🤡 clown
👻 ghost boo
👽 alien ufo
🤖 robot bot
😺 cat grinning
😹 cat laugh
😻 cat love heart-eyes
🙀 cat scared
😿 cat cry
😾 cat angry`,
  ],
  [
    "people",
    "People & hands",
    "👋",
    `👋 wave hi bye
🤚 hand raised back
🖐️ hand fingers-splayed
✋ stop palm hand
🖖 vulcan spock
👌 ok perfect
🤌 pinch italian
🤏 pinch small tiny
✌️ peace victory
🤞 fingers-crossed luck
🤟 love-you
🤘 rock horns
🤙 call-me shaka
👈 left point
👉 right point
👆 up point
👇 down point
☝️ index up point
👍 thumbs-up like yes
👎 thumbs-down dislike no
✊ fist raised
👊 punch fist bump
🤛 left-fist bump
🤜 right-fist bump
👏 clap applause
🙌 raised-hands praise hooray
👐 open-hands
🤲 palms-up please
🤝 handshake deal
🙏 pray thanks please
✍️ writing hand
💅 nail polish
🤳 selfie
💪 muscle biceps strong
🦾 mechanical-arm prosthetic
🧠 brain
👀 eyes looking
👁️ eye
👄 mouth lips
🫀 heart organ anatomical
🧑 person
👶 baby
🧒 child kid
👦 boy
👧 girl
👩 woman
👨 man
🧔 beard bearded-person
👵 old-woman grandma
👴 old-man grandpa
👮 police officer cop
🕵️ detective spy
👷 worker construction
🤴 prince
👸 princess
🧑‍💻 developer programmer coder
🧑‍🚀 astronaut
🧑‍🍳 chef cook
🦸 superhero hero
🦹 villain supervillain
🧙 mage wizard
🧚 fairy
🧛 vampire
🧜 mermaid merperson
🧝 elf
🧞 genie
🧟 zombie
💃 dancer dancing woman
🕺 dancing man
🧗 climbing climber
🏃 running run
🚶 walking walk
🧍 standing stand
🧎 kneeling kneel
👫 couple holding-hands
👪 family
🗣️ speaking talking
👤 silhouette user
🫂 hugging hug people`,
  ],
  [
    "nature",
    "Animals & nature",
    "🌿",
    `🐶 dog puppy
🐱 cat kitten
🐭 mouse
🐹 hamster
🐰 rabbit bunny
🦊 fox
🐻 bear
🐼 panda
🐨 koala
🐯 tiger
🦁 lion
🐮 cow
🐷 pig
🐸 frog
🐵 monkey
🙈 see-no-evil monkey
🙉 hear-no-evil monkey
🙊 speak-no-evil monkey
🐔 chicken
🐧 penguin
🐦 bird
🦆 duck
🦅 eagle
🦉 owl
🦇 bat
🐺 wolf
🐗 boar
🐴 horse
🦄 unicorn
🐝 bee honeybee
🐛 bug caterpillar
🦋 butterfly
🐌 snail
🐞 ladybug
🐜 ant
🕷️ spider
🦂 scorpion
🐢 turtle
🐍 snake
🦎 lizard
🐙 octopus
🦑 squid
🦐 shrimp
🦀 crab
🐡 pufferfish
🐠 tropical-fish
🐟 fish
🐬 dolphin
🐳 whale
🦈 shark
🐊 crocodile
🐅 tiger
🦓 zebra
🦍 gorilla
🐘 elephant
🦏 rhino
🐪 camel
🦒 giraffe
🐃 buffalo
🐄 cow
🐖 pig
🐑 sheep
🐐 goat
🦌 deer
🐕 dog
🐩 poodle
🐈 cat
🐓 rooster
🦃 turkey
🕊️ dove peace
🐇 rabbit
🐁 mouse
🐿️ chipmunk squirrel
🦔 hedgehog
🌵 cactus
🎄 christmas-tree
🌲 evergreen pine
🌳 tree
🌴 palm
🌱 seedling sprout
🌿 herb plant
☘️ shamrock
🍀 clover luck four-leaf
🍁 maple leaf
🍂 fallen-leaf autumn
🍃 leaves wind
🌾 rice sheaf
💐 bouquet flowers
🌷 tulip
🌹 rose
🥀 wilted flower
🌺 hibiscus
🌸 blossom sakura cherry
🌼 daisy flower
🌻 sunflower
🌞 sun face
🌝 moon face
🌛 moon crescent
🌜 moon crescent
🌚 new-moon
🌙 crescent moon
⭐ star
🌟 star2 glowing
✨ sparkles
⚡ zap lightning
🔥 fire flame lit
💥 boom explosion
☄️ comet
🌈 rainbow
☀️ sunny sun
⛅ partly-cloudy
☁️ cloud
🌧️ rain
⛈️ storm thunderstorm
❄️ snowflake snow
⛄ snowman
💧 droplet water
🌊 wave ocean water
🌍 earth world globe
🌋 volcano
🏔️ mountain`,
  ],
  [
    "food",
    "Food & drink",
    "🍕",
    `🍏 green-apple
🍎 apple
🍐 pear
🍊 orange tangerine
🍋 lemon
🍌 banana
🍉 watermelon
🍇 grapes
🍓 strawberry
🫐 blueberry
🍈 melon
🍒 cherries
🍑 peach
🥭 mango
🍍 pineapple
🥥 coconut
🥝 kiwi
🍅 tomato
🥑 avocado
🍆 eggplant
🥔 potato
🥕 carrot
🌽 corn
🌶️ chili pepper spicy
🥒 cucumber
🥬 leafy greens lettuce
🥦 broccoli
🧄 garlic
🧅 onion
🍄 mushroom
🥜 peanuts
🌰 chestnut
🍞 bread
🥐 croissant
🥖 baguette
🥨 pretzel
🧀 cheese
🥚 egg
🍳 fried-egg cooking
🥞 pancakes
🧇 waffle
🥓 bacon
🍔 burger hamburger
🍟 fries
🍕 pizza
🌭 hotdog
🥪 sandwich
🌮 taco
🌯 burrito
🥙 pita wrap
🧆 falafel
🥘 paella pan
🍲 stew soup
🍜 ramen noodles
🍝 spaghetti pasta
🍛 curry rice
🍣 sushi
🍤 tempura shrimp fried
🍱 bento box
🥟 dumpling
🍚 rice
🍙 onigiri rice-ball
🍥 narutomaki fish-cake
🥠 fortune-cookie
🍦 ice-cream soft-serve
🍧 shaved-ice
🍨 ice-cream
🍩 donut
🍪 cookie biscuit
🎂 birthday-cake
🍰 cake slice
🧁 cupcake muffin
🥧 pie
🍫 chocolate
🍬 candy sweet
🍭 lollipop
🍯 honey
🍼 baby-bottle milk
🥛 milk glass
☕ coffee
🍵 tea
🧃 juice box
🥤 soda cup drink
🍺 beer
🍻 cheers beers
🍷 wine
🥂 champagne toast
🍸 cocktail martini
🍹 tropical drink
🥃 whisky
🧊 ice cube
🍴 fork-knife cutlery
🥄 spoon
🍽️ plate dinner`,
  ],
  [
    "activity",
    "Activities",
    "⚽",
    `⚽ soccer football ball
🏀 basketball
🏈 football american
⚾ baseball
🥎 softball
🎾 tennis
🏐 volleyball
🏉 rugby
🥏 frisbee
🎱 8ball pool billiards
🏓 ping-pong table-tennis
🏸 badminton
🥅 goal net
🏒 hockey ice-hockey
🏑 field-hockey
🥍 lacrosse
🏏 cricket
⛳ golf
🏹 archery bow
🎣 fishing
🥊 boxing gloves
🥋 martial-arts karate
🎽 running-shirt
⛸️ skate ice-skating
🎿 ski
🛷 sled
🏂 snowboard
🏋️ weightlifting lifting gym
🤼 wrestling
🤸 cartwheel gymnastics
⛹️ bouncing-ball basketball
🤺 fencing
🏇 horse-racing jockey
🧘 yoga meditation
🏄 surfing surf
🏊 swimming swim
🤽 water-polo
🚣 rowing boat
🧗 climbing
🚴 cycling bike
🚵 mountain-biking
🏆 trophy win champion
🥇 gold first medal
🥈 silver second medal
🥉 bronze third medal
🏅 medal sports
🎖️ military-medal
🎗️ ribbon awareness
🎫 ticket
🎟️ admission ticket
🎪 circus tent
🎭 theater drama masks
🎨 art palette painting
🎬 clapper movie film
🎤 microphone sing
🎧 headphone music
🎼 musical-score sheet-music
🎹 piano keyboard
🥁 drum
🎷 saxophone
🎺 trumpet
🎸 guitar
🎻 violin
🎲 dice game
♟️ chess pawn
🎯 dart bullseye target
🎳 bowling
🎮 gaming controller videogame
🕹️ joystick arcade
🎰 slot machine
🧩 puzzle jigsaw
🪁 kite
🎈 balloon
🎉 party tada celebrate
🎊 confetti ball
🎁 gift present
🎏 carp windsock
🎑 moon-ceremony
🧧 red-envelope`,
  ],
  [
    "objects",
    "Objects & travel",
    "💻",
    `💻 laptop computer
🖥️ desktop computer monitor
🖨️ printer
⌨️ keyboard
🖱️ mouse computer
💽 disk minidisc
💾 floppy save
💿 cd
📀 dvd
📱 phone mobile
☎️ phone telephone
📞 receiver call
📟 pager
📠 fax
📺 tv television
📻 radio
🎙️ studio microphone
⏱️ stopwatch timer
⏰ alarm clock
⌚ watch
⏳ hourglass time
🔋 battery
🔌 plug power
💡 bulb idea light
🔦 flashlight torch
🕯️ candle
🧯 extinguisher fire
🛢️ oil drum barrel
💸 money-wings spending
💵 cash dollar
💴 yen
💶 euro
💷 pound
💰 moneybag money
💳 credit-card
🧾 receipt invoice
💎 gem diamond
⚖️ scales balance justice
🔧 wrench
🔨 hammer
🛠️ tools
⚙️ gear settings
🔩 nut-bolt
⛓️ chains
🔒 lock locked
🔓 unlock unlocked
🔑 key
🗝️ old-key
🚪 door
🪑 chair
🛏️ bed
🚿 shower
🛁 bath tub
🧹 broom sweep
🧺 basket laundry
🧻 toilet-paper
🔍 search magnify find
🔎 search magnify
📡 satellite antenna
📢 loudspeaker announce
📣 megaphone shout
🔔 bell notification
🔕 no-bell mute
📚 books
📖 open-book reading
📓 notebook
📒 ledger
📄 page sheet
📃 document
📑 bookmarks tabs
📊 bar-chart stats
📈 chart-up growth
📉 chart-down decline
📋 clipboard
📌 pushpin pin
📍 round-pin location
📎 paperclip
✂️ scissors cut
🗑️ trash delete bin
📦 package box parcel
📧 email mail
✉️ envelope letter
📨 incoming-mail
📤 outbox sent
📥 inbox received
🗂️ card-index dividers
📁 folder
📂 open-folder
🗓️ calendar
📅 date calendar
🖊️ pen
✏️ pencil
🖌️ paintbrush
📝 memo note writing
🚗 car
🚕 taxi
🚌 bus
🚑 ambulance
🚓 police-car
🚒 fire-engine
🏍️ motorcycle
🚲 bicycle bike
🛴 scooter
✈️ airplane plane
🚀 rocket launch space
🛸 ufo flying-saucer
🚁 helicopter
🚢 ship boat
⛵ sailboat
🚂 train locomotive
🚇 metro subway
🗺️ map
🧭 compass
🏠 house home
🏢 office building
🏥 hospital
🏦 bank
🏫 school
🗼 tower
🗽 statue-of-liberty
⛺ tent camping
🌃 night-city`,
  ],
  [
    "symbols",
    "Symbols",
    "❤️",
    `❤️ heart love red-heart
🧡 orange-heart
💛 yellow-heart
💚 green-heart
💙 blue-heart
💜 purple-heart
🖤 black-heart
🤍 white-heart
🤎 brown-heart
💔 broken-heart
❣️ heart-exclamation
💕 two-hearts
💞 revolving-hearts
💓 beating-heart
💗 growing-heart
💖 sparkling-heart
💘 cupid arrow-heart
💝 gift-heart
💯 hundred perfect score
💢 anger symbol
💬 speech bubble chat
💭 thought bubble
🗯️ right-anger shouting
💤 zzz sleep
✅ check done ok yes
☑️ ballot-check
✔️ heavy-check
❌ cross x no wrong
❎ negative-cross
➕ plus add
➖ minus subtract
➗ divide
✖️ multiply
❓ question
❔ white-question
❗ exclamation
❕ white-exclamation
‼️ double-exclamation
⁉️ interrobang
⚠️ warning caution
🚫 no-entry forbidden
⛔ no-entry-sign blocked
🔞 no-under-18 adult
♻️ recycle
🔰 beginner
⚜️ fleur-de-lis
🔱 trident
📛 name-badge
🔴 red-circle
🟠 orange-circle
🟡 yellow-circle
🟢 green-circle
🔵 blue-circle
🟣 purple-circle
⚫ black-circle
⚪ white-circle
🟥 red-square
🟧 orange-square
🟨 yellow-square
🟩 green-square
🟦 blue-square
🟪 purple-square
⬛ black-square
⬜ white-square
🔶 orange-diamond
🔷 blue-diamond
🔺 triangle-up red
🔻 triangle-down red
▶️ play
⏸️ pause
⏹️ stop
⏺️ record
⏭️ next skip
⏮️ previous
⏩ fast-forward
⏪ rewind
🔀 shuffle
🔁 repeat loop
🔂 repeat-one
🔼 up
🔽 down
⤴️ arrow-up-right
⤵️ arrow-down-right
🔄 refresh sync reload
🆗 ok
🆕 new
🆒 cool
🆓 free
🔝 top
🔜 soon
🔙 back
♾️ infinity
©️ copyright
®️ registered
™️ trademark
#️⃣ hashtag
*️⃣ asterisk star
0️⃣ zero
1️⃣ one
2️⃣ two
3️⃣ three
4️⃣ four
5️⃣ five
6️⃣ six
7️⃣ seven
8️⃣ eight
9️⃣ nine
🔟 ten`,
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

/** Diacritics are dropped so an accented query still matches a plain keyword. */
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
