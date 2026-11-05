import { INTENTS, PRIVILEGED_FLAGS, intentMask } from './constants.js';
import { DiscordApi, ApiError } from './api.js';
import { Gateway } from './gateway.js';
import { Store, session } from './store.js';
import * as ui from './ui.js';

const store = new Store();

let api = null;
let gateway = null;
let activeIntents = 0;
let hasGuildsIntent = false;
let sessionTicker = null;

/* ================================ demarrage =============================== */

function boot() {
  const savedIntents = session.readIntents();
  ui.renderIntentChoices(savedIntents ?? INTENTS.filter((i) => i.default).map((i) => i.key));

  const savedToken = session.readToken();
  if (savedToken) {
    ui.el.token.value = savedToken;
    ui.el.remember.checked = true;
  }

  wireLoginScreen();
  wireClientScreen();
  wireStore();
  ui.showScreen('login');
}

function wireLoginScreen() {
  ui.el.loginForm.addEventListener('submit', (event) => {
    event.preventDefault();
    login(ui.el.token.value.trim());
  });

  ui.el.tokenToggle.addEventListener('click', () => {
    const shown = ui.el.token.type === 'text';
    ui.el.token.type = shown ? 'password' : 'text';
    ui.el.tokenToggle.setAttribute('aria-label', shown ? 'Afficher le token' : 'Masquer le token');
  });
}

function wireClientScreen() {
  ui.el.logoutBtn.addEventListener('click', logout);
  ui.el.reconnectBtn.addEventListener('click', () => gateway?.reconnect());
  ui.el.logClear.addEventListener('click', ui.clearLog);
  ui.el.logFilter.addEventListener('input', () => ui.applyLogFilter());
}

function wireStore() {
  store.subscribe((scope) => {
    if (scope === 'guilds' || scope === 'selection') {
      ui.renderGuilds(store, selectGuild, () => store.clearSelection());
    }
    if (scope === 'guilds' || scope === 'channels' || scope === 'selection') {
      ui.renderChannels(store, (id) => store.selectChannel(id));
    }
    if (scope === 'selection') ui.renderPane(store);
    if (scope === 'messages') ui.renderMessages(store);
  });
}

/* ================================ connexion =============================== */

async function login(token) {
  if (!token) {
    ui.showLoginError('Entre le token de ton bot.');
    return;
  }

  ui.showLoginError(null);
  ui.setLoginBusy(true);

  try {
    api = new DiscordApi(token);

    // L API REST de Discord n envoie PAS d en-tetes CORS pour les bots : dans
    // un navigateur normal, ces requetes sont bloquees. On les traite donc
    // comme optionnelles (best-effort). Ce n est pas grave : c est le Gateway
    // (WebSocket, non soumis au CORS) qui valide reellement le token via la
    // fermeture 4004, et l identite du bot arrive dans l evenement READY.

    // 1. Informations optionnelles via REST (ignorees si bloquees).
    const me = await api.me().catch(() => null);
    const application = await api.application().catch(() => null);
    const gatewayInfo = await api.gatewayBot().catch(() => null);

    // 2. Quels intents privilegies sont reellement autorises ?
    //    Sans les flags de l application (REST bloque), on retire par securite
    //    les intents privilegies pour garantir une connexion sans 4014.
    const requestedKeys = ui.selectedIntentKeys();
    const { keys, blocked } = allowedIntents(requestedKeys, application?.flags ?? 0);
    activeIntents = intentMask(keys);
    hasGuildsIntent = keys.includes('GUILDS');

    // Memorisation des preferences.
    session.saveIntents(requestedKeys);
    if (ui.el.remember.checked) session.saveToken(token);
    else session.clearToken();

    store.reset();
    store.me = me;
    store.application = application;

    ui.showScreen('client');
    if (me) ui.renderMe(me);
    ui.renderApplication(application);
    ui.renderActiveIntents(activeIntents);
    ui.renderStatus('connecting');
    ui.renderGuilds(store, selectGuild, () => store.clearSelection());
    ui.renderChannels(store, (id) => store.selectChannel(id));
    ui.renderPane(store);

    if (me) {
      ui.appendLog({
        kind: 'ok',
        name: 'TOKEN',
        text: `Token valide pour ${me.username} (${me.id}).`,
        at: Date.now(),
      });
    } else {
      ui.appendLog({
        kind: 'info',
        name: 'REST',
        text: 'API REST Discord injoignable depuis le navigateur (CORS) : connexion via le Gateway. Le token sera valide a l identification, l identite du bot arrivera avec READY.',
        at: Date.now(),
      });
    }

    const limit = gatewayInfo?.session_start_limit;
    if (gatewayInfo && limit) {
      ui.appendLog({
        kind: 'info',
        name: 'GATEWAY/BOT',
        text: `${gatewayInfo.url} - ${gatewayInfo.shards} shard(s) recommande(s), ${limit.remaining}/${limit.total} sessions restantes.`,
        at: Date.now(),
      });
    }

    for (const key of blocked) {
      const intent = INTENTS.find((i) => i.key === key);
      ui.appendLog({
        kind: 'warn',
        name: 'INTENTS',
        text: `${intent?.label ?? key} ignore : l intent n est pas active dans le Developer Portal. Sans ca Discord refuserait la connexion (4014).`,
        at: Date.now(),
      });
    }

    if (gatewayInfo && gatewayInfo.shards > 1) {
      ui.appendLog({
        kind: 'warn',
        name: 'SHARDING',
        text: `Discord recommande ${gatewayInfo.shards} shards. La 1.0.0 n ouvre que le shard 0 : une partie des serveurs ne remontera pas.`,
        at: Date.now(),
      });
    }

    // Sans gatewayInfo (REST bloque), le Gateway utilise son URL par defaut.
    startGateway(token, gatewayInfo?.url);

    // La liste REST des serveurs n a de sens que si le REST est joignable.
    if (!hasGuildsIntent && me) await loadGuildsFromRest();
  } catch (err) {
    api = null;
    ui.showLoginError(describeError(err));
    console.error('[login]', err);
  } finally {
    ui.setLoginBusy(false);
  }
}

function startGateway(token, url) {
  gateway = new Gateway({ token, intents: activeIntents, url });

  gateway.on('log', ui.appendLog);
  gateway.on('ping', ui.renderPing);

  gateway.on('state', ({ state, detail }) => {
    ui.renderStatus(state, detail);
    ui.renderSession(gateway);
  });

  gateway.on('dispatch', onDispatch);

  gateway.on('fatal', ({ text }) => {
    stopSessionTicker();
    // Un token ou des intents refuses : retour a l ecran de connexion.
    ui.showScreen('login');
    ui.showLoginError(text);
  });

  gateway.connect();
  startSessionTicker();
}

/** Rafraichit les compteurs de session sans redessiner a chaque evenement. */
function startSessionTicker() {
  stopSessionTicker();
  sessionTicker = setInterval(() => {
    if (gateway) ui.renderSession(gateway);
  }, 1000);
}

function stopSessionTicker() {
  clearInterval(sessionTicker);
  sessionTicker = null;
}

function logout() {
  stopSessionTicker();
  gateway?.disconnect();
  gateway = null;
  api = null;
  activeIntents = 0;
  store.reset();
  session.clearToken();
  ui.clearLog();
  ui.el.token.value = '';
  ui.el.remember.checked = false;
  ui.showScreen('login');
  ui.showLoginError(null);
}

/* ============================== evenements ================================ */

function onDispatch({ t, d }) {
  switch (t) {
    case 'READY':
      // Quand le REST est bloque (CORS), l identite du bot n a pas pu etre
      // chargee avant : on la recupere ici, dans le payload READY.
      if (!store.me && d.user) {
        store.me = d.user;
        ui.renderMe(d.user);
        ui.appendLog({
          kind: 'ok',
          name: 'TOKEN',
          text: `Token valide : connecte en tant que ${d.user.username} (${d.user.id}).`,
          at: Date.now(),
        });
      }
      if (!store.application && d.application) {
        store.application = d.application;
        ui.renderApplication(d.application);
      }
      ui.renderSession(gateway, d);
      for (const guild of d.guilds) store.upsertGuild(guild);
      break;

    case 'GUILD_CREATE':
    case 'GUILD_UPDATE':
      store.upsertGuild(d);
      break;

    case 'GUILD_DELETE':
      // `unavailable` = panne cote Discord, le bot est toujours membre.
      if (d.unavailable) store.upsertGuild(d);
      else store.removeGuild(d.id);
      break;

    case 'CHANNEL_CREATE':
    case 'CHANNEL_UPDATE':
      store.upsertChannel(d);
      break;

    case 'CHANNEL_DELETE':
      store.removeChannel(d);
      break;

    case 'THREAD_CREATE':
    case 'THREAD_UPDATE':
      store.upsertChannel(d);
      break;

    case 'MESSAGE_CREATE':
      store.addMessage(d);
      break;

    default:
      break;
  }

  // READY et RESUMED sont deja journalises par le Gateway lui-meme.
  if (t !== 'READY' && t !== 'RESUMED') {
    ui.appendLog({ kind: 'event', name: t, text: summarize(t, d), at: Date.now() });
  }
}

/** Resume un evenement en une ligne lisible. */
function summarize(type, d) {
  switch (type) {
    case 'GUILD_CREATE':
      return `${d.name} - ${d.channels?.length ?? 0} salon(s), ${d.member_count ?? '?'} membre(s)`;
    case 'GUILD_UPDATE':
    case 'GUILD_DELETE':
      return d.name ?? d.id;
    case 'CHANNEL_CREATE':
    case 'CHANNEL_UPDATE':
    case 'CHANNEL_DELETE':
    case 'THREAD_CREATE':
    case 'THREAD_UPDATE':
      return `#${d.name} (type ${d.type})`;
    case 'MESSAGE_CREATE': {
      const channel = store.channel(d.channel_id);
      const where = channel ? `#${channel.name}` : d.channel_id;
      const body = d.content ? d.content.slice(0, 90) : '(sans contenu)';
      return `${where} - ${d.author.username}: ${body}`;
    }
    case 'MESSAGE_UPDATE':
    case 'MESSAGE_DELETE':
      return `message ${d.id}`;
    case 'PRESENCE_UPDATE':
      return `${d.user?.id} -> ${d.status}`;
    case 'TYPING_START':
      return `${d.user_id} tape dans ${d.channel_id}`;
    case 'GUILD_MEMBER_ADD':
    case 'GUILD_MEMBER_REMOVE':
      return d.user?.username ?? d.user?.id ?? '';
    case 'INTERACTION_CREATE':
      return `${d.data?.name ?? d.type} par ${d.member?.user?.username ?? d.user?.username ?? '?'}`;
    default:
      return d && typeof d === 'object' && d.id ? String(d.id) : '';
  }
}

async function selectGuild(guildId) {
  store.selectGuild(guildId);

  // Sans l intent Guilds, GUILD_CREATE n arrive pas : on va chercher les salons.
  const guild = store.guilds.get(guildId);
  if (!guild || guild.channels.size || !api) return;

  try {
    const channels = await api.guildChannels(guildId);
    store.setGuildChannels(guildId, channels);
    store.selectGuild(guildId);
  } catch (err) {
    ui.appendLog({
      kind: 'error',
      name: 'REST',
      text: `Salons de ${guild.name} illisibles : ${err.message}`,
      at: Date.now(),
    });
  }
}

/** Liste les serveurs via REST quand l intent Guilds n est pas demande. */
async function loadGuildsFromRest() {
  try {
    const guilds = await api.guilds();
    for (const guild of guilds) store.upsertGuild(guild);
    ui.appendLog({
      kind: 'info',
      name: 'REST',
      text: `${guilds.length} serveur(s) listes via l API REST (intent Guilds inactif).`,
      at: Date.now(),
    });
  } catch (err) {
    ui.appendLog({ kind: 'error', name: 'REST', text: err.message, at: Date.now() });
  }
}

/* ================================= helpers ================================ */

/**
 * Retire les intents privilegies que l application n a pas le droit d utiliser,
 * pour eviter une fermeture 4014 du Gateway.
 */
function allowedIntents(requestedKeys, appFlags) {
  const keys = [];
  const blocked = [];

  for (const key of requestedKeys) {
    const flags = PRIVILEGED_FLAGS[key];
    if (flags && !flags.some((flag) => (appFlags & flag) !== 0)) blocked.push(key);
    else keys.push(key);
  }

  return { keys, blocked };
}

function describeError(err) {
  if (err instanceof ApiError) return err.message;
  if (err instanceof TypeError) {
    return 'Discord est injoignable depuis ce navigateur. Verifie ta connexion, et qu aucune extension ou bloqueur ne filtre discord.com.';
  }
  return err?.message || 'Echec de la connexion.';
}

// Expose pour inspection depuis la console du navigateur.
window.dbcw = { store, get gateway() { return gateway; } };

boot();
