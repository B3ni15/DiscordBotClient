# disbotclient

Discord kliens a botodhoz, ami teljes egészében a böngészőben fut.
[disbotclient.xyz](https://disbotclient.xyz)

Nincs backend. A bot tokened a böngésződ `localStorage`-ában marad, a kérések
közvetlenül a Discord API-jához mennek — se proxy, se adatbázis, se naplózás.

## Mit tud

- Szerverek, csatornák, üzenetelőzmény
- Élő események a Discord gatewayen (új üzenet, szerkesztés, törlés, reakció, gépelés)
- Üzenetküldés csatolmánnyal
- Taglista

## Futtatás

```bash
npm install
npm run dev
```

Statikus build (bárhol elfut, ami fájlokat szolgál ki):

```bash
npm run build   # -> out/
```

## Token

A tokent a [Developer Portal](https://discord.com/developers/applications) Bot
fülén találod. Ugyanott kapcsold be a `MESSAGE CONTENT` és `SERVER MEMBERS`
intentet, különben az üzenetek szövege üresen érkezik és a taglista üres marad.
Ha egyik sincs bekapcsolva, a kliens automatikusan a privilegizált intentek
nélkül csatlakozik.

Csak **bot** tokent használj. A felhasználói fiók tokenje ("selfbot") sérti a
Discord felhasználási feltételeit, és a kliens nem is támogatja.

## Korlátok

Ezek a bot tokenből következnek, nem a kliensből:

- Nincs DM-lista; DM-et csak felhasználói azonosítóval lehet nyitni
- Nincs szerver oldali üzenetkeresés
- A bot csak azokat a szervereket látja, ahová meghívtad
- Hangcsatorna egyelőre nincs

## Licenc

MIT
