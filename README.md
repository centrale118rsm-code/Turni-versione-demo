# Turni di Reparto — versione dimostrativa

Web app per gestire i turni del personale di un reparto (infermieri, medici, OSS o altre figure): calendario condiviso, area coordinatore,
conteggio ore e assenze, reperibilità, ferie e permessi, equità dell'anno, stampa e PDF.

Questa è la **versione demo**: reparto e nomi sono inventati e **non c'è nessun server**.

## Come funziona la demo

- `demo-firebase.js` sostituisce Firebase: salva tutto nel browser di chi la apre (localStorage).
  Nessun dato esce dal dispositivo e ogni visitatore ha la sua copia.
- `demo-data.js` alla prima apertura crea un reparto di esempio: 20 operatori (16 turnisti con il
  ciclo Pomeriggio › Mattina › Notte › Smonto › Riposo, 3 diurnisti e il coordinatore), il calendario
  dell'anno in corso con ferie, malattie, permessi e reperibilità.
- Menu › Impostazioni › **Ripristina dati demo** riporta tutto come all'inizio.

Password della demo:

| Area | Password |
|---|---|
| Area coordinatore | `demo` |
| Area admin | `admin` |

## Cosa non c'è nella demo

- Notifiche sul telefono ad app chiusa e calendario che si aggiorna da solo (richiedono il motore su server).
- Portale richieste collegato (ferie, cambi turno, cessioni di reperibilità).
- Dati condivisi tra più telefoni: nella demo ognuno vede solo le proprie modifiche.

## Pubblicazione

Basta GitHub Pages sul ramo `main` (cartella principale): i file sono statici.

## Passare a un reparto vero

Si crea un progetto Firebase dedicato al reparto, si compila `firebaseConfig` in `index.html`
e al posto dei due script `demo-*.js` in `<head>` si rimettono le librerie Firebase:

```html
<script src="https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore-compat.js"></script>
```

Vanno poi cambiate le password (`ADMIN_PASSWORD`, `COORD_PASSWORD`) e pubblicate le regole Firestore.
