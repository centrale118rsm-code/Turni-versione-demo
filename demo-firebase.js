/*
 * VERSIONE DIMOSTRATIVA — finto Firebase che salva tutto nel browser (localStorage).
 *
 * L'app usa le API "compat" di Firebase (firebase.firestore(), firebase.auth()). Questo file
 * ne imita la parte che serve, così l'app funziona identica ma:
 *   • nessun dato esce dal dispositivo (niente server, niente chiavi);
 *   • ogni visitatore ha la sua copia dei dati di esempio e può modificarla liberamente;
 *   • "Ripristina dati demo" (o localStorage.clear()) riporta tutto come all'inizio.
 *
 * Per usare l'app sul serio con un vero progetto Firebase vedi README.md.
 */
(function () {
    'use strict';
    var STORE_KEY = 'demo_turni_db_v2';
    var mem = null;

    // ── serializzazione (i Timestamp diventano {__ts: ms}) ─────────────────────
    function Timestamp(ms) { this._ms = Math.round(ms); this.seconds = Math.floor(ms / 1000); this.nanoseconds = (ms % 1000) * 1e6; }
    Timestamp.prototype.toMillis = function () { return this._ms; };
    Timestamp.prototype.toDate = function () { return new Date(this._ms); };
    Timestamp.prototype.isEqual = function (o) { return o instanceof Timestamp && o._ms === this._ms; };
    Timestamp.prototype.valueOf = function () { return String(this._ms).padStart(16, '0'); };
    Timestamp.fromMillis = function (ms) { return new Timestamp(ms); };
    Timestamp.fromDate = function (d) { return new Timestamp(d.getTime()); };
    Timestamp.now = function () { return new Timestamp(Date.now()); };

    function enc(v) {
        if (v instanceof Timestamp) return { __ts: v._ms };
        if (v instanceof Date) return { __ts: v.getTime() };
        if (v instanceof FV) return v._kind === 'ts' ? { __ts: Date.now() } : applyFV(undefined, v);
        if (Array.isArray(v)) return v.map(enc);
        if (v && typeof v === 'object') { var o = {}; Object.keys(v).forEach(function (k) { o[k] = enc(v[k]); }); return o; }
        return v;
    }
    function dec(v) {
        if (Array.isArray(v)) return v.map(dec);
        if (v && typeof v === 'object') {
            if (Object.keys(v).length === 1 && typeof v.__ts === 'number') return new Timestamp(v.__ts);
            var o = {}; Object.keys(v).forEach(function (k) { o[k] = dec(v[k]); }); return o;
        }
        return v;
    }
    function load() {
        if (mem) return mem;
        try { mem = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { mem = null; }
        if (!mem || typeof mem !== 'object') mem = {};
        return mem;
    }
    var saveTimer = null;
    function persist() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(function () {
            try { localStorage.setItem(STORE_KEY, JSON.stringify(mem)); }
            catch (e) { console.warn('Demo: spazio del browser esaurito, i dati restano solo fino alla chiusura.', e); }
        }, 50);
    }
    function clone(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }

    // ── valori speciali ───────────────────────────────────────────────────────
    function FV(kind, arg) { this._kind = kind; this._arg = arg; }
    var FieldValue = {
        serverTimestamp: function () { return new FV('ts'); },
        delete: function () { return new FV('del'); },
        arrayUnion: function () { return new FV('union', [].slice.call(arguments)); },
        arrayRemove: function () { return new FV('remove', [].slice.call(arguments)); },
        increment: function (n) { return new FV('inc', n); }
    };
    function FieldPath() { this._segs = [].slice.call(arguments); }
    FieldPath.documentId = function () { var p = new FieldPath('__name__'); p._docId = true; return p; };

    function applyFV(cur, v) {
        if (!(v instanceof FV)) return enc(v);
        switch (v._kind) {
            case 'ts': return { __ts: Date.now() };
            case 'union': { var a = Array.isArray(cur) ? cur.slice() : []; v._arg.forEach(function (x) { var e = enc(x), s = JSON.stringify(e); if (!a.some(function (y) { return JSON.stringify(y) === s; })) a.push(e); }); return a; }
            case 'remove': { var r = Array.isArray(cur) ? cur.slice() : [], rm = v._arg.map(function (x) { return JSON.stringify(enc(x)); }); return r.filter(function (y) { return rm.indexOf(JSON.stringify(y)) === -1; }); }
            case 'inc': return (typeof cur === 'number' ? cur : 0) + v._arg;
        }
    }
    function isPlain(v) { return v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof FV) && !(v instanceof Timestamp) && !(v instanceof Date); }
    // scrittura profonda: con merge le mappe si fondono, senza merge si sostituiscono
    function writeInto(target, data, merge) {
        Object.keys(data).forEach(function (k) {
            var v = data[k];
            if (v instanceof FV && v._kind === 'del') { delete target[k]; return; }
            if (merge && isPlain(v)) {
                if (!isPlain(target[k]) || (target[k] && target[k].__ts !== undefined)) target[k] = {};
                writeInto(target[k], v, true);
            } else target[k] = applyFV(target[k], isPlain(v) ? stripDeletes(v) : v);
        });
    }
    function stripDeletes(o) { var r = {}; Object.keys(o).forEach(function (k) { var v = o[k]; if (v instanceof FV && v._kind === 'del') return; r[k] = isPlain(v) ? stripDeletes(v) : v; }); return r; }
    function setPath(target, segs, v) {
        var t = target;
        for (var i = 0; i < segs.length - 1; i++) { if (!isPlain(t[segs[i]]) || t[segs[i]].__ts !== undefined) t[segs[i]] = {}; t = t[segs[i]]; }
        var last = segs[segs.length - 1];
        if (v instanceof FV && v._kind === 'del') delete t[last];
        else t[last] = applyFV(t[last], isPlain(v) ? stripDeletes(v) : v);
    }
    function getPath(obj, field) {
        var segs = field instanceof FieldPath ? field._segs : String(field).split('.');
        var t = obj; for (var i = 0; i < segs.length; i++) { if (t == null) return undefined; t = t[segs[i]]; } return t;
    }

    // ── ascoltatori ──────────────────────────────────────────────────────────
    var listeners = [];   // { test(coll,id) , fire() }
    var notifyQueued = {};
    function notify(coll, id) {
        listeners.slice().forEach(function (l) { if (l.coll === coll && (l.id === undefined || l.id === id)) { if (!notifyQueued[l.n]) { notifyQueued[l.n] = true; setTimeout(function () { delete notifyQueued[l.n]; if (l.alive) l.fire(); }, 0); } } });
    }
    var lnSeq = 0;

    // ── documenti ────────────────────────────────────────────────────────────
    function rawDoc(coll, id) { var db = load(); return db[coll] && db[coll][id]; }
    function DocSnap(ref, data) {
        this.id = ref.id; this.ref = ref; this.exists = data !== undefined;
        this._d = data; this.metadata = { fromCache: false, hasPendingWrites: false };
    }
    DocSnap.prototype.data = function () { return this._d === undefined ? undefined : dec(clone(this._d)); };
    DocSnap.prototype.get = function (f) { return this._d === undefined ? undefined : dec(clone(getPath(this._d, f))); };

    function DocRef(coll, id) { this._coll = coll; this.id = id || autoId(); this.path = coll + '/' + this.id; }
    function autoId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 12); }
    DocRef.prototype._snap = function () { return new DocSnap(this, rawDoc(this._coll, this.id)); };
    DocRef.prototype._set = function (data, opts) {
        var db = load(); db[this._coll] = db[this._coll] || {};
        var merge = !!(opts && (opts.merge || opts.mergeFields));
        var cur = merge && db[this._coll][this.id] ? db[this._coll][this.id] : {};
        writeInto(cur, data, merge);
        db[this._coll][this.id] = cur; persist(); notify(this._coll, this.id);
    };
    DocRef.prototype._update = function (args) {
        var db = load(); var cur = db[this._coll] && db[this._coll][this.id];
        if (!cur) { var e = new Error('No document to update: ' + this.path); e.code = 'not-found'; throw e; }
        if (args.length === 1 && isPlain(args[0])) Object.keys(args[0]).forEach(function (k) { setPath(cur, k.split('.'), args[0][k]); });
        else for (var i = 0; i < args.length; i += 2) { var f = args[i]; setPath(cur, f instanceof FieldPath ? f._segs : String(f).split('.'), args[i + 1]); }
        persist(); notify(this._coll, this.id);
    };
    DocRef.prototype._delete = function () { var db = load(); if (db[this._coll]) delete db[this._coll][this.id]; persist(); notify(this._coll, this.id); };
    DocRef.prototype.get = function () { var s = this._snap(); return Promise.resolve(s); };
    DocRef.prototype.set = function (d, o) { try { this._set(d, o); return Promise.resolve(); } catch (e) { return Promise.reject(e); } };
    DocRef.prototype.update = function () { try { this._update([].slice.call(arguments)); return Promise.resolve(); } catch (e) { return Promise.reject(e); } };
    DocRef.prototype.delete = function () { this._delete(); return Promise.resolve(); };
    DocRef.prototype.collection = function (name) { return new Query(this.path + '/' + name); };
    DocRef.prototype.onSnapshot = function () {
        var a = [].slice.call(arguments); if (a[0] && typeof a[0] === 'object' && typeof a[0].next !== 'function' && typeof a[0] !== 'function') a.shift();
        var cb = typeof a[0] === 'function' ? a[0] : (a[0] && a[0].next), self = this;
        var l = { n: ++lnSeq, coll: this._coll, id: this.id, alive: true, last: null, fire: function () { var s = self._snap(), j = JSON.stringify(s._d); if (j === l.last) return; l.last = j; try { cb(s); } catch (e) { console.error(e); } } };
        listeners.push(l); setTimeout(function () { if (l.alive) l.fire(); }, 0);
        return function () { l.alive = false; listeners = listeners.filter(function (x) { return x !== l; }); };
    };

    // ── query ────────────────────────────────────────────────────────────────
    function Query(coll, filters, order, lim) { this._coll = coll; this._f = filters || []; this._o = order || []; this._l = lim || 0; this.id = coll.split('/').pop(); }
    Query.prototype.doc = function (id) { return new DocRef(this._coll, id); };
    Query.prototype.add = function (d) { var r = new DocRef(this._coll); return r.set(d).then(function () { return r; }); };
    Query.prototype.where = function (f, op, v) { return new Query(this._coll, this._f.concat([[f, op, v]]), this._o, this._l); };
    Query.prototype.orderBy = function (f, dir) { return new Query(this._coll, this._f, this._o.concat([[f, dir || 'asc']]), this._l); };
    Query.prototype.limit = function (n) { return new Query(this._coll, this._f, this._o, n); };
    function cmpVal(a, b) {
        if (a && a.__ts !== undefined) a = a.__ts; if (b && b.__ts !== undefined) b = b.__ts;
        if (a instanceof Timestamp) a = a._ms; if (b instanceof Timestamp) b = b._ms;
        if (a === b) return 0; if (a === undefined || a === null) return -1; if (b === undefined || b === null) return 1;
        return a < b ? -1 : 1;
    }
    Query.prototype._run = function () {
        var self = this, db = load(), all = db[this._coll] || {};
        var ids = Object.keys(all).filter(function (id) {
            return self._f.every(function (f) {
                var val = (f[0] instanceof FieldPath && f[0]._docId) ? id : getPath(all[id], f[0]);
                if (val === undefined && !(f[0] instanceof FieldPath && f[0]._docId)) return false;
                var c = cmpVal(val, f[2]);
                switch (f[1]) { case '==': return c === 0; case '!=': return c !== 0; case '<': return c < 0; case '<=': return c <= 0; case '>': return c > 0; case '>=': return c >= 0;
                    case 'in': return f[2].some(function (x) { return cmpVal(val, x) === 0; }); case 'array-contains': return Array.isArray(val) && val.some(function (x) { return cmpVal(x, f[2]) === 0; }); }
                return true;
            });
        });
        this._o.forEach(function () {});
        if (this._o.length) ids.sort(function (x, y) {
            for (var i = 0; i < self._o.length; i++) { var o = self._o[i], c = cmpVal(getPath(all[x], o[0]), getPath(all[y], o[0])); if (c) return o[1] === 'desc' ? -c : c; }
            return 0;
        });
        if (this._l) ids = ids.slice(0, this._l);
        var docs = ids.map(function (id) { return new DocSnap(new DocRef(self._coll, id), all[id]); });
        return { docs: docs, size: docs.length, empty: !docs.length, metadata: { fromCache: false, hasPendingWrites: false },
            forEach: function (fn) { docs.forEach(fn); }, docChanges: function () { return docs.map(function (d) { return { type: 'added', doc: d }; }); } };
    };
    Query.prototype.get = function () { return Promise.resolve(this._run()); };
    Query.prototype.onSnapshot = function () {
        var a = [].slice.call(arguments); if (a[0] && typeof a[0] === 'object' && typeof a[0].next !== 'function') a.shift();
        var cb = typeof a[0] === 'function' ? a[0] : (a[0] && a[0].next), self = this;
        var l = { n: ++lnSeq, coll: this._coll, alive: true, fire: function () { try { cb(self._run()); } catch (e) { console.error(e); } } };
        listeners.push(l); setTimeout(function () { if (l.alive) l.fire(); }, 0);
        return function () { l.alive = false; listeners = listeners.filter(function (x) { return x !== l; }); };
    };

    // ── scritture multiple e transazioni ──────────────────────────────────────
    function Batch() { this._ops = []; }
    Batch.prototype.set = function (r, d, o) { this._ops.push(function () { r._set(d, o); }); return this; };
    Batch.prototype.update = function (r) { var a = [].slice.call(arguments, 1); this._ops.push(function () { r._update(a); }); return this; };
    Batch.prototype.delete = function (r) { this._ops.push(function () { r._delete(); }); return this; };
    Batch.prototype.commit = function () { var ops = this._ops; return new Promise(function (res, rej) { setTimeout(function () { try { ops.forEach(function (f) { f(); }); res(); } catch (e) { rej(e); } }, 60); }); };

    var firestoreInst = {
        collection: function (n) { return new Query(n); },
        doc: function (p) { var s = p.split('/'); return new DocRef(s.slice(0, -1).join('/'), s[s.length - 1]); },
        batch: function () { return new Batch(); },
        runTransaction: function (fn) {
            var b = new Batch();
            var t = { get: function (r) { return r.get(); }, set: function (r, d, o) { b.set(r, d, o); return t; }, update: function () { b.update.apply(b, arguments); return t; }, delete: function (r) { b.delete(r); return t; } };
            return Promise.resolve(fn(t)).then(function (v) { return b.commit().then(function () { return v; }); });
        },
        enablePersistence: function () { return Promise.resolve(); },
        settings: function () {}, enableNetwork: function () { return Promise.resolve(); }, disableNetwork: function () { return Promise.resolve(); },
        waitForPendingWrites: function () { return Promise.resolve(); }
    };

    // ── utente anonimo locale ────────────────────────────────────────────────
    var uid = null; try { uid = localStorage.getItem('demo_uid'); } catch (e) {}
    if (!uid) { uid = 'demo_' + autoId(); try { localStorage.setItem('demo_uid', uid); } catch (e) {} }
    var authInst = {
        currentUser: null,
        signInAnonymously: function () { authInst.currentUser = { uid: uid, isAnonymous: true }; return Promise.resolve({ user: authInst.currentUser }); },
        onAuthStateChanged: function (cb) { setTimeout(function () { cb(authInst.currentUser); }, 0); return function () {}; },
        signOut: function () { authInst.currentUser = null; return Promise.resolve(); }
    };

    function firestore() { return firestoreInst; }
    firestore.FieldValue = FieldValue; firestore.FieldPath = FieldPath; firestore.Timestamp = Timestamp;

    window.firebase = {
        DEMO: true,
        initializeApp: function () { return { name: '[DEMO]' }; },
        firestore: firestore,
        auth: function () { return authInst; },
        apps: []
    };

    // ── strumenti della demo ──────────────────────────────────────────────────
    window.DEMO_DB = {
        isEmpty: function () { return !Object.keys(load()).length; },
        seed: function (collections) { mem = enc(collections); try { localStorage.setItem(STORE_KEY, JSON.stringify(mem)); } catch (e) {} },
        reset: function () {
            try {
                Object.keys(localStorage).forEach(function (k) { localStorage.removeItem(k); });
                sessionStorage.clear();
            } catch (e) {}
            location.reload();
        }
    };
})();
