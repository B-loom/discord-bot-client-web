import { OP, GATEWAY_VERSION, CLOSE_CODES } from './constants.js';

const MAX_BACKOFF_MS = 30_000;
const DEFAULT_GATEWAY_URL = 'wss://gateway.discord.gg';

/**
 * Client du Gateway Discord (WebSocket).
 *
 * Le WebSocket n est pas soumis au CORS : la connexion part directement du
 * navigateur. Le client gere le HELLO, le heartbeat, l IDENTIFY, la reprise de
 * session (RESUME), les sessions invalides et la reconnexion avec backoff.
 *
 * Les evenements des sockets abandonnes sont ignores : chaque gestionnaire
 * verifie que son socket est toujours le socket courant.
 *
 * Evenements : 'state', 'dispatch', 'log', 'ping', 'fatal'.
 */
export class Gateway {
  #token;
  #intents;
  #shard;

  #ws = null;
  #url = DEFAULT_GATEWAY_URL;
  #resumeUrl = null;

  #heartbeatTimer = null;
  #heartbeatStartTimer = null;
  #heartbeatInterval = null;
  #heartbeatSentAt = null;
  #ackPending = false;

  #sessionId = null;
  #sequence = null;
  #attempt = 0;
  #reconnectTimer = null;

  #state = 'idle';
  #listeners = new Map();

  constructor({ token, intents, url, shard = [0, 1] }) {
    this.#token = token;
    this.#intents = intents;
    this.#shard = shard;
    if (url) this.#url = url;
  }

  /* --------------------------- mini event emitter -------------------------- */

  on(event, handler) {
    if (!this.#listeners.has(event)) this.#listeners.set(event, new Set());
    this.#listeners.get(event).add(handler);
    return () => this.#listeners.get(event)?.delete(handler);
  }

  #emit(event, payload) {
    for (const handler of this.#listeners.get(event) ?? []) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[gateway] listener ${event}`, err);
      }
    }
  }

  #log(kind, name, text) {
    this.#emit('log', { kind, name, text, at: Date.now() });
  }

  /* -------------------------------- getters ------------------------------- */

  get state() { return this.#state; }
  get sessionId() { return this.#sessionId; }
  get sequence() { return this.#sequence; }
  get resumeUrl() { return this.#resumeUrl; }
  get heartbeatInterval() { return this.#heartbeatInterval; }
  get intents() { return this.#intents; }
  get shard() { return this.#shard; }

  #setState(state, detail) {
    this.#state = state;
    this.#emit('state', { state, detail });
  }

  /* ------------------------------- connexion ------------------------------ */

  connect() {
    clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = null;

    const resuming = Boolean(this.#sessionId);
    const base = resuming && this.#resumeUrl ? this.#resumeUrl : this.#url;
    const url = `${base}/?v=${GATEWAY_VERSION}&encoding=json`;

    this.#setState(resuming ? 'resuming' : 'connecting');
    this.#log('info', 'GATEWAY', `${resuming ? 'Reprise' : 'Connexion'} vers ${base}`);

    let ws;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      this.#log('error', 'GATEWAY', `WebSocket impossible : ${err.message}`);
      this.#scheduleReconnect();
      return;
    }

    this.#ws = ws;

    // `current` ecarte les evenements d un socket deja remplace ou abandonne.
    const current = () => this.#ws === ws;

    ws.addEventListener('open', () => {
      if (!current()) return;
      this.#log('ok', 'GATEWAY', 'Socket ouvert, attente du HELLO.');
    });

    ws.addEventListener('message', (event) => {
      if (!current()) return;
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch {
        this.#log('error', 'GATEWAY', 'Payload illisible recu.');
        return;
      }
      this.#handle(payload, ws);
    });

    ws.addEventListener('error', () => {
      // L evenement 'error' ne porte aucun detail exploitable : la raison
      // reelle arrive dans 'close'.
      if (!current()) return;
      this.#log('warn', 'GATEWAY', 'Erreur de socket.');
    });

    ws.addEventListener('close', (event) => {
      if (!current()) return;
      this.#onClose(event);
    });
  }

  /** Ferme la connexion et oublie la session. */
  disconnect(code = 1000) {
    this.#abandonSocket(code);
    this.#clearSession();
    this.#attempt = 0;
    this.#setState('closed');
    this.#log('info', 'GATEWAY', 'Deconnecte.');
  }

  /** Force une session neuve, sans reprise. */
  reconnect() {
    this.#abandonSocket(1000);
    this.#clearSession();
    this.#attempt = 0;
    this.connect();
  }

  /**
   * Detache le socket courant : ses evenements seront ignores, puis il est
   * ferme. C est ce qui evite qu un `close` tardif declenche une seconde
   * reconnexion en parallele.
   */
  #abandonSocket(code) {
    clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = null;
    this.#stopHeartbeat();

    const ws = this.#ws;
    this.#ws = null;
    if (ws && ws.readyState <= WebSocket.OPEN) ws.close(code);
  }

  #clearSession() {
    this.#sessionId = null;
    this.#sequence = null;
    this.#resumeUrl = null;
  }

  #send(op, d) {
    if (this.#ws?.readyState !== WebSocket.OPEN) return false;
    this.#ws.send(JSON.stringify({ op, d }));
    return true;
  }

  /* -------------------------------- payloads ------------------------------ */

  #handle({ op, d, s, t }, ws) {
    if (typeof s === 'number') this.#sequence = s;

    switch (op) {
      case OP.HELLO:
        this.#heartbeatInterval = d.heartbeat_interval;
        this.#log('info', 'HELLO', `Heartbeat toutes les ${Math.round(d.heartbeat_interval / 1000)}s.`);
        this.#startHeartbeat(d.heartbeat_interval, ws);
        if (this.#sessionId) this.#resume();
        else this.#identify();
        break;

      case OP.HEARTBEAT:
        // Discord demande un battement immediat.
        this.#beat();
        break;

      case OP.HEARTBEAT_ACK: {
        this.#ackPending = false;
        if (this.#heartbeatSentAt) this.#emit('ping', Date.now() - this.#heartbeatSentAt);
        break;
      }

      case OP.RECONNECT:
        this.#log('warn', 'RECONNECT', 'Discord demande une reconnexion, reprise de la session.');
        this.#reopenKeepingSession(4000);
        break;

      case OP.INVALID_SESSION:
        this.#onInvalidSession(d === true, ws);
        break;

      case OP.DISPATCH:
        this.#onDispatch(t, d);
        break;

      default:
        this.#log('warn', 'GATEWAY', `Opcode non gere : ${op}`);
    }
  }

  #onDispatch(type, data) {
    if (type === 'READY') {
      this.#sessionId = data.session_id;
      this.#resumeUrl = data.resume_gateway_url ?? null;
      this.#attempt = 0;
      this.#setState('ready', data);
      this.#log('ok', 'READY', `Connecte en tant que ${data.user.username} (${data.guilds.length} serveur(s)).`);
    } else if (type === 'RESUMED') {
      this.#attempt = 0;
      this.#setState('ready');
      this.#log('ok', 'RESUMED', 'Session reprise, aucun evenement perdu.');
    }

    this.#emit('dispatch', { t: type, d: data, s: this.#sequence });
  }

  #identify() {
    this.#setState('identifying');
    this.#log('info', 'IDENTIFY', `Intents : ${this.#intents}, shard ${this.#shard.join('/')}.`);
    this.#send(OP.IDENTIFY, {
      token: this.#token,
      intents: this.#intents,
      shard: this.#shard,
      compress: false,
      large_threshold: 250,
      properties: {
        os: navigator.platform || 'web',
        browser: 'discord-bot-client-web',
        device: 'discord-bot-client-web',
      },
    });
  }

  #resume() {
    this.#log('info', 'RESUME', `Reprise de la session ${this.#sessionId} a la sequence ${this.#sequence}.`);
    this.#send(OP.RESUME, {
      token: this.#token,
      session_id: this.#sessionId,
      seq: this.#sequence,
    });
  }

  #onInvalidSession(resumable, ws) {
    this.#log('warn', 'INVALID_SESSION', resumable
      ? 'Session invalide mais reprenable.'
      : 'Session invalide, nouvelle identification.');

    if (!resumable) this.#clearSession();

    // Discord impose une attente aleatoire de 1 a 5 secondes.
    setTimeout(() => {
      if (this.#ws !== ws || ws.readyState !== WebSocket.OPEN) return;
      if (this.#sessionId) this.#resume();
      else this.#identify();
    }, 1000 + Math.random() * 4000);
  }

  /* ------------------------------- heartbeat ------------------------------ */

  #startHeartbeat(interval, ws) {
    this.#stopHeartbeat();
    this.#ackPending = false;

    // Premier battement decale d un facteur aleatoire, comme demande par Discord.
    this.#heartbeatStartTimer = setTimeout(() => {
      this.#heartbeatStartTimer = null;
      if (this.#ws !== ws || ws.readyState !== WebSocket.OPEN) return;
      this.#beat();
      this.#heartbeatTimer = setInterval(() => this.#beat(), interval);
    }, interval * Math.random());
  }

  #stopHeartbeat() {
    clearInterval(this.#heartbeatTimer);
    clearTimeout(this.#heartbeatStartTimer);
    this.#heartbeatTimer = null;
    this.#heartbeatStartTimer = null;
    this.#ackPending = false;
  }

  #beat() {
    if (this.#ackPending) {
      // Aucun ACK depuis le dernier battement : connexion zombie.
      this.#log('warn', 'HEARTBEAT', 'Pas d ACK recu, connexion consideree morte.');
      this.#reopenKeepingSession(4000);
      return;
    }
    this.#heartbeatSentAt = Date.now();
    this.#ackPending = this.#send(OP.HEARTBEAT, this.#sequence);
  }

  /* ------------------------------ reconnexion ----------------------------- */

  /** Coupe le socket en gardant la session, pour repartir en RESUME. */
  #reopenKeepingSession(code) {
    this.#abandonSocket(code);
    this.#scheduleReconnect();
  }

  #onClose(event) {
    this.#stopHeartbeat();
    this.#ws = null;

    const info = CLOSE_CODES[event.code];
    const label = `${event.code}${event.reason ? ` ${event.reason}` : ''}`;

    if (info?.fatal) {
      this.#setState('error', info.text);
      this.#log('error', 'CLOSE', `${label} - ${info.text}`);
      this.#emit('fatal', { code: event.code, text: info.text });
      return;
    }

    // 4007 et 4009 invalident la session : il faut repartir de zero.
    if (event.code === 4007 || event.code === 4009) this.#clearSession();

    this.#log('warn', 'CLOSE', `${label}${info ? ` - ${info.text}` : ''}`);
    this.#scheduleReconnect();
  }

  #scheduleReconnect() {
    clearTimeout(this.#reconnectTimer);
    this.#attempt += 1;
    const base = Math.min(1000 * 2 ** (this.#attempt - 1), MAX_BACKOFF_MS);
    const delay = Math.round(base * (0.8 + Math.random() * 0.4));
    const seconds = Math.round(delay / 1000);

    this.#setState('connecting', `Nouvelle tentative dans ${seconds}s`);
    this.#log('info', 'GATEWAY', `Tentative ${this.#attempt} dans ${seconds}s.`);
    this.#reconnectTimer = setTimeout(() => this.connect(), delay);
  }
}
