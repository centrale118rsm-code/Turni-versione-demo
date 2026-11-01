/*
 * VERSIONE DIMOSTRATIVA — dati di esempio.
 *
 * Alla prima apertura (o dopo "Ripristina dati demo") crea nel browser un reparto finto:
 * 20 operatori con nomi inventati, il calendario dell'anno in corso (ciclo dei turnisti
 * Pomeriggio › Mattina › Notte › Smonto › Riposo, diurnisti dal lunedì al venerdì),
 * ferie estive e invernali, qualche malattia e permesso, le reperibilità.
 * Tutto è generato qui: nessun dato reale.
 */
(function () {
    'use strict';
    if (!window.DEMO_DB) return;
    var YEAR = new Date().getFullYear();
    try {
        var raw = JSON.parse(localStorage.getItem('demo_turni_db_v2') || 'null');
        var st = raw && raw.reparto_config && raw.reparto_config.settings;
        if (st && +st.activeYear === YEAR) return;          // dati demo già presenti e dell'anno giusto
        if (raw) { localStorage.removeItem('demo_turni_db_v2'); }   // anno nuovo: si riparte da dati freschi
    } catch (e) {}

    var MONTHS = ['GENNAIO', 'FEBBRAIO', 'MARZO', 'APRILE', 'MAGGIO', 'GIUGNO', 'LUGLIO', 'AGOSTO', 'SETTEMBRE', 'OTTOBRE', 'NOVEMBRE', 'DICEMBRE'];
    var TURNISTI = ['BIANCHI', 'ROSSI', 'FERRARI', 'ESPOSITO', 'RICCI', 'MARINO', 'GRECO', 'BRUNO', 'GALLO', 'CONTI',
                    'COSTA', 'GIORDANO', 'RIZZO', 'MORETTI', 'FONTANA', 'SANTORO'];
    var DIURNISTI = ['MARCHETTI', 'LEONE', 'VITALE'];
    var COORD = 'LOMBARDI';
    var NAMES = [COORD].concat(DIURNISTI, TURNISTI);
    var CYCLE = ['P', 'M', 'N', 'SM', 'R'];

    // generatore pseudo-casuale con seme fisso: la demo è sempre uguale
    var seed = 20260101;
    function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
    function pick(a) { return a[Math.floor(rnd() * a.length)]; }

    function holidays(y) {
        var H = { '0-1': 1, '0-6': 1, '3-25': 1, '4-1': 1, '5-2': 1, '7-15': 1, '10-1': 1, '11-8': 1, '11-25': 1, '11-26': 1 };
        var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
        var g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
        var l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
        var em = Math.floor((h + l - 7 * m + 114) / 31) - 1, ed = ((h + l - 7 * m + 114) % 31) + 1;
        var es = new Date(y, em, ed), el = new Date(y, em, ed + 1);
        H[es.getMonth() + '-' + es.getDate()] = 1; H[el.getMonth() + '-' + el.getDate()] = 1;
        return H;
    }
    function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

    var docs = {}, rep = {}, cessioni = {}, absentNight = {};
    var EPOCH = new Date(YEAR, 0, 1).getTime();
    function dayIndex(d) { return Math.round((d.getTime() - EPOCH) / 864e5); }

    // ── assenze programmate: ferie estive (2 settimane), invernali (1 settimana), malattie, permessi ──
    var absences = {};   // name -> { dayIdx: subV }
    function addAbs(name, from, len, code) { var A = absences[name] = absences[name] || {}; for (var i = 0; i < len; i++) A[from + i] = code; }
    NAMES.forEach(function (n, i) {
        var summer = dayIndex(new Date(YEAR, 5, 8)) + (i * 6) % 84;            // giugno-agosto, a scaglioni
        addAbs(n, summer, 14, 'f');
        var winter = dayIndex(new Date(YEAR, 0, 12)) + (i * 9) % 70;           // gennaio-marzo
        addAbs(n, winter, 6, 'f');
        if (i % 4 === 1) addAbs(n, dayIndex(new Date(YEAR, 11, 20)) + (i % 3) * 3, 4, 'f');   // qualcuno a Natale
        if (rnd() < 0.55) addAbs(n, Math.floor(rnd() * 330) + 10, 2 + Math.floor(rnd() * 4), 'm');   // malattia
        if (rnd() < 0.5) addAbs(n, Math.floor(rnd() * 340) + 5, 1, 'p');       // permesso
        if (rnd() < 0.25) addAbs(n, Math.floor(rnd() * 340) + 5, 1, 'c');      // permesso studio
        if (rnd() < 0.2) addAbs(n, Math.floor(rnd() * 300) + 20, 1, 'r');      // recupero
    });

    function put(y, mi, key, val) {
        var id = 'turni_' + y + '-' + String(mi + 1).padStart(2, '0');
        var doc = docs[id] = docs[id] || { cells: {}, updatedAt: new Date(EPOCH).toISOString() };
        doc.cells[key] = val;
    }

    // ── calendario: anno in corso + primi 2 mesi dell'anno dopo ──
    var end = new Date(YEAR + 1, 2, 2);   // fino al 1° marzo: solo per lo smonto dopo l'ultima notte di febbraio
    var H = {}; H[YEAR] = holidays(YEAR); H[YEAR + 1] = holidays(YEAR + 1);
    // i turnisti cambiano gruppo ogni tanto (un riposo in più per uno, un pomeriggio in meno per un
    // altro), così le coppie non sono sempre le stesse e "Chi lavora con chi" ha senso
    var off = TURNISTI.map(function (_, t) { return (t * 3) % 5; }), pend = TURNISTI.map(function () { return 0; });
    function codeOf(t, di) { return CYCLE[((di + off[t]) % 5 + 5) % 5]; }
    for (var d = new Date(YEAR, 0, 1); d < end; d.setDate(d.getDate() + 1)) {
        var y = d.getFullYear(), mi = d.getMonth(), dn = d.getDate(), di = dayIndex(d), wd = d.getDay();
        var fest = wd === 0 || wd === 6 || !!H[y][mi + '-' + dn];
        var week = Math.floor((di + new Date(YEAR, 0, 1).getDay()) / 7);
        var dayKey = MONTHS[mi] + '-' + dn;
        var repCand = [];
        if (di >= 10 && di % 19 === 10) {
            var a = Math.floor(rnd() * TURNISTI.length), target = (off[a] + 4) % 5;
            var bs = TURNISTI.map(function (_, t) { return t; }).filter(function (t) { return t !== a && ((off[t] % 5) + 5) % 5 === target && !pend[t]; });
            if (bs.length && !pend[a]) { pend[a] = -1; pend[pick(bs)] = 1; }
        }
        TURNISTI.forEach(function (_, t) { if (pend[t] && codeOf(t, di - 1) === 'R') { off[t] += pend[t]; pend[t] = 0; } });
        NAMES.forEach(function (n, i) {
            var cell = { v: '', subV: '' };
            var t = TURNISTI.indexOf(n);
            if (t >= 0) {
                cell.v = codeOf(t, di);
                if (cell.v === 'M' || cell.v === 'P') repCand.push(n);
            } else if (n === COORD) {
                cell.v = fest ? 'r' : 'm';
            } else {
                var dd = DIURNISTI.indexOf(n);
                cell.v = fest ? 'r' : ((week + dd) % 2 ? 'p' : 'm');
            }
            if (t < 0 && wd !== 0 && wd !== 6 && H[y][mi + '-' + dn]) { cell.v = ''; cell.subV = 'nl'; }   // festivo infrasettimanale
            var ab = absences[n] && absences[n][di];
            var off = cell.v === 'r' || cell.v === 'R' || cell.v === 'SM';
            if (cell.v === 'SM' && absentNight[n]) cell.v = 'R';     // notte non fatta: niente smonto
            absentNight[n] = false;
            if (ab && y === YEAR && !off) {                           // assenza al posto del turno
                if (cell.v === 'N') absentNight[n] = true;
                cell.v = ''; cell.subV = ab;
            }
            if (y > YEAR && mi === 2 && cell.v !== 'SM') return;
            put(y, mi, n + '__' + dayKey, cell);
        });
        // una reperibilità al giorno, a rotazione tra chi è di mattina o pomeriggio
        if (y === YEAR && repCand.length) rep[iso(d)] = repCand[di % repCand.length];
    }
    // il coordinatore sostituito dal più anziano dei diurnisti nei giorni di ferie del coordinatore
    Object.keys(absences[COORD] || {}).forEach(function (k) {
        var dd = new Date(YEAR, 0, 1 + (+k)); if (dd.getFullYear() !== YEAR) return;
        var key = DIURNISTI[0] + '__' + MONTHS[dd.getMonth()] + '-' + dd.getDate();
        var id = 'turni_' + YEAR + '-' + String(dd.getMonth() + 1).padStart(2, '0');
        var c = docs[id] && docs[id].cells[key];
        if (c && !c.subV && c.v === 'm') { c.v = ''; c.subV = 'z'; }
    });
    // qualche permesso notte
    ['ROSSI', 'GRECO', 'FONTANA'].forEach(function (n, i) {
        var base = 40 + i * 97;
        for (var k = base; k < base + 10; k++) {
            var dd = new Date(YEAR, 0, 1 + k), id = 'turni_' + YEAR + '-' + String(dd.getMonth() + 1).padStart(2, '0');
            var c = docs[id].cells[n + '__' + MONTHS[dd.getMonth()] + '-' + dd.getDate()];
            if (c.v === 'N' && !c.subV) { c.v = ''; c.subV = 'pn'; break; }
        }
    });
    // qualche fascia di reperibilità ceduta a un collega (come dal portale richieste)
    var repDays = Object.keys(rep).sort();
    for (var r = 30; r < repDays.length; r += 23) {
        var day = repDays[r], tit = rep[day], other = pick(TURNISTI.filter(function (x) { return x !== tit; }));
        var slot = 2 + (r % 2);
        cessioni[day + '_' + slot] = { date: day, slotIndex: slot, timeSlot: slot === 2 ? '13:00-20:00' : '20:00-00:00', originalDriver: tit, newDriver: other, requestId: 'demo', updatedAt: new Date(EPOCH).toISOString() };
    }

    var today = iso(new Date());
    var settings = {
        dataSource: 'firebase',
        activeYear: YEAR,
        archivedYears: [],
        coordinatorName: COORD,
        operatorConfig: {
            baseNames: NAMES.slice(), order: [], hidden: {}, removed: {}, added: [],
            contract: {},
            allow: {}
        },
        welcome: { active: true, title: 'VERSIONE DIMOSTRATIVA', text: 'Questa è una demo con un reparto inventato: va bene per infermieri, medici o OSS.\nPuoi modificare tutto: i dati restano solo su questo dispositivo.\nArea coordinatore: password demo', duration: 6 },
        coordMessages: [
            { id: 'demo1', title: 'Riunione di reparto', text: 'Giovedì alle 14:00 in sala riunioni: nuovo protocollo consegne. Presenza consigliata per chi è di turno.', secs: 5, from: today, to: iso(new Date(Date.now() + 20 * 864e5)), active: true, by: COORD, updatedAt: new Date().toISOString() }
        ],
        demoSeededAt: new Date().toISOString()
    };
    docs.settings = settings;
    docs.reperibilita = { turni: rep, cessioni: cessioni, updatedAt: new Date(EPOCH).toISOString() };

    window.DEMO_DB.seed({ reparto_config: docs });
    try { localStorage.setItem('data_source_', 'firebase'); } catch (e) {}
})();
