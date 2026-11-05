import { INTENTS, intentKeys } from './constants.js';
import { userAvatarUrl, guildIconUrl } from './api.js';

const MAX_LOG_ROWS = 400;

const $ = (id) => document.getElementById(id);

/** Tous les noeuds manipules par l application. */
export const el = {
  body: document.body,

  // connexion
  loginScreen: $('login-screen'),
  loginForm: $('login-form'),
  loginBtn: $('login-btn'),
  loginError: $('login-error'),
  token: $('token'),
  tokenToggle: $('token-toggle'),
  intents: $('intents'),
  remember: $('remember'),

  // client
  client: $('client'),
  guildRail: $('guild-rail'),
  guildName: $('guild-name'),
  guildMeta: $('guild-meta'),
  channelList: $('channel-list'),
  channelName: $('channel-name'),
  meAvatar: $('me-avatar'),
  meName: $('me-name'),
  meId: $('me-id'),
  logoutBtn: $('logout-btn'),
  reconnectBtn: $('reconnect-btn'),

  statusPill: $('status-pill'),
  statusText: $('status-text'),
  pingPill: $('ping-pill'),

  paneConnection: $('pane-connection'),
  paneChannel: $('pane-channel'),
  messages: $('messages'),

  logList: $('log-list'),
  logFilter: $('log-filter'),
  logAutoscroll: $('log-autoscroll'),
  logClear: $('log-clear'),

  d: {
    state: $('d-state'),
    session: $('d-session'),
    resume: $('d-resume'),
    seq: $('d-seq'),
    heartbeat: $('d-heartbeat'),
    ping: $('d-ping'),
    bot: $('d-bot'),
    botId: $('d-bot-id'),
    app: $('d-app'),
    gwVersion: $('d-gw-version'),
    shard: $('d-shard'),
    guilds: $('d-guilds'),
    intents: $('d-intents'),
  },
};

const STATE_LABELS = {
  idle: 'Hors ligne',
  connecting: 'Connexion...',
  identifying: 'Identification...',
  resuming: 'Reprise...',
  ready: 'En ligne',
  closed: 'Deconnecte',
  error: 'Erreur',
};

/* ---------------------------- ecran de connexion --------------------------- */

/** Construit les cases a cocher des intents. */
export function renderIntentChoices(selectedKeys) {
  el.intents.textContent = '';
  for (const intent of INTENTS) {
    const label = document.createElement('label');
    label.className = `intent${intent.privileged ? ' intent--priv' : ''}`;
    if (intent.privileged) label.title = 'Intent privilegie : a activer dans le Developer Portal';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = intent.key;
    input.checked = selectedKeys.includes(intent.key);

    const text = document.createElement('span');
    text.textContent = intent.label;

    label.append(input, text);
    el.intents.append(label);
  }
}

export function selectedIntentKeys() {
  return [...el.intents.querySelectorAll('input:checked')].map((i) => i.value);
}

export function showLoginError(message) {
  el.loginError.textContent = message ?? '';
  el.loginError.hidden = !message;
}

export function setLoginBusy(busy) {
  el.loginBtn.disabled = busy;
  el.loginBtn.textContent = busy ? 'Connexion...' : 'Se connecter';
}

export function showScreen(name) {
  el.body.dataset.screen = name;
  el.loginScreen.hidden = name !== 'login';
  el.client.hidden = name !== 'client';
}

/* --------------------------------- entetes -------------------------------- */

export function renderMe(user) {
  el.meName.textContent = user.username;
  el.meId.textContent = user.id;
  el.meAvatar.src = userAvatarUrl(user, 64);
  el.meAvatar.alt = `Avatar de ${user.username}`;
  el.d.bot.textContent = user.discriminator && user.discriminator !== '0'
    ? `${user.username}#${user.discriminator}`
    : user.username;
  el.d.botId.textContent = user.id;
}

export function renderApplication(app) {
  if (!app) {
    el.d.app.textContent = 'indisponible';
    return;
  }
  // Via READY (REST bloque), l application n a pas de nom, seulement un id.
  el.d.app.textContent = app.name ? `${app.name} (${app.id})` : app.id;
}

export function renderStatus(state, detail) {
  el.statusPill.dataset.state = state;
  el.statusText.textContent = STATE_LABELS[state] ?? state;
  el.d.state.textContent = detail ? `${STATE_LABELS[state] ?? state} - ${detail}` : (STATE_LABELS[state] ?? state);
}

export function renderPing(ms) {
  el.pingPill.textContent = `${ms} ms`;
  el.d.ping.textContent = `${ms} ms`;
}

export function renderSession(gateway, ready) {
  el.d.session.textContent = gateway.sessionId ?? '-';
  el.d.resume.textContent = gateway.resumeUrl ?? '-';
  el.d.seq.textContent = gateway.sequence ?? '-';
  el.d.heartbeat.textContent = gateway.heartbeatInterval
    ? `${Math.round(gateway.heartbeatInterval / 1000)} s`
    : '-';
  el.d.shard.textContent = gateway.shard.join(' / ');
  if (ready?.v) el.d.gwVersion.textContent = `v${ready.v}`;
}

export function renderActiveIntents(mask) {
  el.d.intents.textContent = '';
  const keys = intentKeys(mask);
  if (!keys.length) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = 'aucun';
    el.d.intents.append(chip);
    return;
  }
  for (const key of keys) {
    const intent = INTENTS.find((i) => i.key === key);
    const chip = document.createElement('span');
    chip.className = `chip${intent?.privileged ? ' chip--priv' : ''}`;
    chip.textContent = intent?.label ?? key;
    el.d.intents.append(chip);
  }
}

/* -------------------------------- serveurs -------------------------------- */

export function renderGuilds(store, onSelect, onHome) {
  el.guildRail.textContent = '';
  const guilds = store.sortedGuilds();
  el.d.guilds.textContent = String(guilds.length);

  // Bouton d accueil : ramene sur la vue connexion / diagnostic.
  const home = document.createElement('button');
  home.type = 'button';
  home.className = 'guild';
  home.title = 'Etat de la connexion';
  home.classList.toggle('is-active', !store.selectedChannelId);
  const homeIcon = document.createElement('img');
  homeIcon.src = 'assets/icon.svg';
  homeIcon.alt = '';
  home.append(homeIcon);
  home.addEventListener('click', () => onHome?.());
  el.guildRail.append(home);

  for (const guild of guilds) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'guild';
    btn.title = guild.name;
    btn.classList.toggle('is-active', guild.id === store.selectedGuildId && Boolean(store.selectedChannelId));

    const iconUrl = guildIconUrl(guild, 96);
    if (iconUrl) {
      const img = document.createElement('img');
      img.src = iconUrl;
      img.alt = '';
      btn.append(img);
    } else {
      btn.textContent = initials(guild.name);
    }

    btn.addEventListener('click', () => onSelect(guild.id));
    el.guildRail.append(btn);
  }
}

export function renderChannels(store, onSelect) {
  const guild = store.guilds.get(store.selectedGuildId);
  el.channelList.textContent = '';

  if (!guild) {
    el.guildName.textContent = 'Aucun serveur';
    el.guildMeta.textContent = '';
    el.channelList.append(emptyNote('Selectionne un serveur a gauche.'));
    return;
  }

  el.guildName.textContent = guild.name;
  el.guildMeta.textContent = guild.memberCount ? `${guild.memberCount} membres` : guild.id;

  const channels = store.textChannels(guild.id);
  if (!channels.length) {
    el.channelList.append(emptyNote(
      guild.unavailable
        ? 'Serveur encore indisponible.'
        : 'Aucun salon textuel visible. L intent Guilds est-il actif ?',
    ));
    return;
  }

  const title = document.createElement('p');
  title.className = 'cat';
  title.textContent = `Salons textuels - ${channels.length}`;
  el.channelList.append(title);

  for (const channel of channels) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chan';
    btn.classList.toggle('is-active', channel.id === store.selectedChannelId);

    const icon = document.createElement('span');
    icon.className = 'chan__icon';
    icon.textContent = '#';

    const name = document.createElement('span');
    name.className = 'chan__name';
    name.textContent = channel.name;

    btn.append(icon, name);
    btn.addEventListener('click', () => onSelect(channel.id));
    el.channelList.append(btn);
  }
}

/* -------------------------------- messages -------------------------------- */

export function renderPane(store) {
  const onChannel = Boolean(store.selectedChannelId);
  el.paneConnection.hidden = onChannel;
  el.paneChannel.hidden = !onChannel;

  const channel = store.selectedChannelId ? store.channel(store.selectedChannelId) : null;
  el.channelName.textContent = channel?.name ?? 'connexion';

  if (onChannel) renderMessages(store);
}

export function renderMessages(store) {
  const list = store.channelMessages(store.selectedChannelId);
  el.messages.textContent = '';

  if (!list.length) {
    el.messages.append(emptyNote('Aucun message recu depuis la connexion. Ecris dans ce salon pour le voir arriver en direct.'));
    return;
  }

  for (const message of list) el.messages.append(messageRow(message));
  el.paneChannel.scrollTop = el.paneChannel.scrollHeight;
}

function messageRow(message) {
  const li = document.createElement('li');
  li.className = 'msg';

  const avatar = document.createElement('img');
  avatar.className = 'msg__avatar';
  avatar.src = userAvatarUrl(message.author, 80);
  avatar.alt = '';
  li.append(avatar);

  const body = document.createElement('div');

  const head = document.createElement('div');
  head.className = 'msg__head';

  const author = document.createElement('span');
  author.className = 'msg__author';
  author.textContent = message.member?.nick || message.author.global_name || message.author.username;
  head.append(author);

  if (message.author.bot) {
    const badge = document.createElement('span');
    badge.className = 'msg__bot';
    badge.textContent = 'bot';
    head.append(badge);
  }

  const time = document.createElement('span');
  time.className = 'msg__time';
  time.textContent = new Date(message.timestamp).toLocaleString('fr-FR');
  head.append(time);

  const text = document.createElement('div');
  text.className = 'msg__body';
  text.textContent = message.content
    || '(contenu vide : l intent Message Content est-il actif ?)';

  body.append(head, text);

  const extras = [];
  if (message.attachments?.length) extras.push(`${message.attachments.length} piece(s) jointe(s)`);
  if (message.embeds?.length) extras.push(`${message.embeds.length} embed(s)`);
  if (extras.length) {
    const note = document.createElement('div');
    note.className = 'msg__attach';
    note.textContent = extras.join(' - ');
    body.append(note);
  }

  li.append(body);
  return li;
}

/* --------------------------------- journal -------------------------------- */

export function appendLog({ kind, name, text, at }) {
  const li = document.createElement('li');
  li.className = 'ev';
  li.dataset.kind = kind;
  li.dataset.name = name;

  const time = document.createElement('span');
  time.className = 'ev__time';
  time.textContent = new Date(at).toLocaleTimeString('fr-FR');

  const label = document.createElement('span');
  label.className = 'ev__name';
  label.textContent = name;
  label.title = name;

  const detail = document.createElement('span');
  detail.className = 'ev__text';
  detail.textContent = text;

  li.append(time, label, detail);
  applyLogFilter(li);
  el.logList.append(li);

  while (el.logList.children.length > MAX_LOG_ROWS) el.logList.firstElementChild.remove();
  if (el.logAutoscroll.checked) el.logList.scrollTop = el.logList.scrollHeight;
}

export function applyLogFilter(row) {
  const query = el.logFilter.value.trim().toLowerCase();
  const rows = row ? [row] : [...el.logList.children];
  for (const item of rows) {
    item.hidden = Boolean(query) && !item.textContent.toLowerCase().includes(query);
  }
}

export function clearLog() {
  el.logList.textContent = '';
}

/* --------------------------------- helpers -------------------------------- */

function emptyNote(text) {
  const p = document.createElement('p');
  p.className = 'empty';
  p.textContent = text;
  return p;
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => [...word][0].toUpperCase())
    .join('');
}
