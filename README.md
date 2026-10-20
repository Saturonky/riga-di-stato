# riga-di-stato

Una Mod per Claude Code che sostituisce la status line a script con una riga di stato essenziale e un pannello, `/contesto`, che mostra che cosa occupa la finestra di contesto e in che ordine ci è entrato.

## Installazione

Al prompt di una sessione nel terminale:

```
/plugin install riga-di-stato --marketplace Saturonky/riga-di-stato
```

Da una shell:

```
claude plugin install riga-di-stato --marketplace Saturonky/riga-di-stato
```

Nell'app desktop, dove `/plugin` non funziona: clic su **+** accanto al riquadro del prompt, poi **Plugins**, **Add marketplace** con `Saturonky/riga-di-stato`, poi **Add plugin**.

Si risponde `y` per aggiungere il marketplace e si sceglie lo scope (utente, il primo). La Mod è attiva subito. Se in `settings.json` c'è già una `statusLine` a comando, conviene toglierla, per non avere due righe.

## Requisiti e limiti

- **Claude Code con le Mod.** È scritta e provata su Claude Code 2.1.304. L'API delle Mod (gli hook in TypeScript) è in accesso anticipato e cambia tra una versione e l'altra: con una versione più vecchia la Mod può non caricarsi o caricarsi in parte. Il manifest non ha un campo per imporre una versione minima: conviene aggiornare Claude Code prima di installarla.
- **Policy dell'organizzazione.** Un'organizzazione può disattivare le Mod: in quel caso il plugin risulta installato ma non fa nulla.
- **Pannello di fianco alla chat.** Serve il layout fullscreen di Claude Code e un terminale largo almeno 110 colonne. Altrimenti, per esempio dentro tmux, con `CLAUDE_CODE_NO_FLICKER=0`, in un terminale stretto o nel terminale integrato di un editor, il pannello è un blocco sopra il prompt, alto quanto il suo contenuto fino al 60% del terminale (il riepilogo è sempre intero). `/contesto` dice che cosa manca per averlo di fianco alla chat, e quando sotto il bordo c'è altro l'ultima riga visibile lo segnala (`↓ altre N righe`): si scorre con un clic sul pannello e le frecce. Una dimensione scelta a mano trascinando il bordo vale più di quella chiesta dalla Mod.
- **Dati dall'installazione in poi.** La Mod registra ciò che entra nel contesto mentre è attiva. Le sezioni del system prompt compaiono dalla richiesta successiva; il primo messaggio e i file `CLAUDE.md` solo in una conversazione nuova (`/clear` o una nuova sessione). Installata a sessione avviata, mostra meno dati finché non si riparte.
- **Terminale.** La riga di stato usa alcune emoji e caratteri Unicode (`⎇`, `█`, `▏`): un font che non li ha li disegna male.

## La riga di stato

Sempre quattro cose: cartella e ramo git, contesto (percentuale e token sulla finestra), costo della sessione, modello.

```
progetto  ⎇ main    🟢 12%  120k / 1M    $1.50    Opus 5.5
```

Gli allarmi compaiono solo quando vanno guardati:

- `⚠ compact tra 55k`: mancano meno del 15% dei token alla soglia di autocompact;
- `⚠ limite 5h 86%`: un limite d'uso (5 ore, 7 giorni) dall'80%;
- `⚠ cache 32%`: cache hit sotto il 50% su una richiesta da almeno 50k token.

La riga si adatta alla larghezza del terminale: quando non c'è posto, i segmenti meno importanti si accorciano e poi spariscono. Il contesto resta sempre.

## Il pannello `/contesto`

`/contesto` apre e chiude il pannello; Esc a prompt vuoto lo chiude. `/contesto categorie` (o `ordine`, `cronologia`, `limiti`) lo apre già su una sezione.

In alto un riepilogo: contesto, ultima richiesta (cache hit, crescita del contesto, output), sessione (costo, richieste, righe modificate) e gli allarmi. Sotto, quattro sezioni, una aperta alla volta, con i tasti `1`-`4`:

1. **Categorie**: la finestra divisa come la divide `/context`.
2. **Ordine di caricamento**: le sezioni del system prompt, con il confine della cache; gli strumenti, gli MCP caricati e differiti, i subagent, le skill e i comandi; i blocchi del primo messaggio con i file `CLAUDE.md` nell'ordine in cui vengono letti; la conversazione per tipo di ingresso.
3. **Cronologia**: le righe più pesanti e gli ultimi ingressi, con le richieste all'API e quanto ha fatto crescere il contesto ciascuna.
4. **Limiti**: i limiti d'uso con la barra e l'ora in cui ripartono.

Nel layout fullscreen, da 110 colonne, il pannello sta di fianco alla chat a tutta altezza; altrimenti è un blocco basso sopra il prompt. Il contenuto non supera le 72 colonne.

I pesi delle singole righe sono stime, a circa 4 caratteri per token; il totale del contesto è quello riportato dall'API. Le righe modificate si contano dagli input di Edit e Write.

## Come funziona

La Mod osserva soltanto: ogni hook passa avanti l'evento invariato.

| Evento | Che cosa registra |
| --- | --- |
| `prompt.compose` | le sezioni del system prompt, in ordine |
| `prompt.context` | i blocchi del primo messaggio e i file di istruzioni |
| `session.append` | ogni riga che entra nella conversazione |
| `turn.step` | l'uso di ogni richiesta all'API |
| `tool.call` (Edit, Write) | le righe aggiunte e rimosse |

## Sviluppo

```
claude plugin validate .
claude plugin test .
```

## Licenza

MIT
