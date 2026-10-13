# Seats

The host's Pi runs every seat. Each seat has an AI: its strategy model plans
the turn and Jev picks. Who pilots the seat decides what happens to the AI's
picks. With no pilot, they are played. With a person or an agent piloting,
they are suggestions the pilot accepts or overrides.

## The game config

Before play, the host sets each seat:

- its deck and its look in pictures;
- its pilot, its AI (`/magic seat <n> ai`) or a player (`/magic seat <n> player`);
- its models: decide, pregame and strategy, over the roster file's
  (`/magic seat <n> model <role> <pattern|default>`). Two seats with different
  models are two models playing each other. The judge and the commentator are
  the table's;
- whose OpenRouter key pays for its calls: the game's, its player's own, or one
  the host names as an environment variable (`/magic seat <n> key game|$NAME`).

Every seat agrees to this config twice before a card is dealt: to prepare, and
to begin. A seat its AI pilots agrees when asked; a player answers when they
answer. The journal header records each seat's pilot, models and whose key
paid, never a key. A seat agreed to pay with its own key never falls back to
the game's.

## Seat codes

Each seat has a code: 32 random bytes. Whoever holds it sees that seat and
acts for it. Nothing else is checked: no account, no email. The host holds
every code and can pilot any seat from its own terminal with
`/magic pilot <n>`; its start and begin then agree for that seat.

Holding a code of a seat set up for its AI is a takeover: switching the seat
to suggest or manual mode takes it from the AI, and switching back to auto
hands it back. The ledger records every pick the pilot makes as `by: person`,
so a takeover shows in the journal and the replay.

## The seat's page

When the host's Pi shows its games (`/magic watch local|public`), each seat
has a page at `<address>/seat/#<code>`; `/magic seat <n> link` prints it. The
code sits after the `#`, which a browser never sends, and the page sends it as
a bearer token. Without a code the server changes nothing.

Before play the page shows the table as set, every seat's models and whose
key pays. The player chooses their own seat's models, gives their OpenRouter
key, and agrees when asked; the table's config holds still while it is being
agreed to. During play the page draws the seat's own board, beside the
question its pilot is asked, and the player answers from there. Each question
is numbered, and an answer to an older one is refused, so two tabs or a late
click never answer the wrong question. The page asks the host again as soon as
it is answered, and the host holds the request until something the seat may
see changes.

## The clock

The table's clock is a table rule, 120 seconds a decision unless the host sets
another with `/magic clock`. It runs while a player is shown a question, never
while the AI works out its suggestion. A player who does not answer in time
concedes their seat: the AI never answers in their place. Pausing stops the
clock, and continuing gives the player their full time again.

## What a seat sees

Its own projection of the table: its hand, every public zone, other seats'
hidden cards as counts. The seed and the library order never reach it.
