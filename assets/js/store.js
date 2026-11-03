import { TEXT_CHANNEL_TYPES } from './constants.js';

const TOKEN_KEY = 'dbcw.token';
const INTENTS_KEY = 'dbcw.intents';
const MAX_MESSAGES_PER_CHANNEL = 100;

/** Token et intents retenus dans le navigateur, si l utilisateur l a demande. */
export const session = {
  readToken() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  saveToken(token) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* mode prive ou stockage bloque : on continue sans retenir */
    }
  },
  clearToken() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch { /* rien a faire */ }
  },
  readIntents() {
    try {
      const raw = localStorage.getItem(INTENTS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  saveIntents(keys) {
    try {
      localStorage.setItem(INTENTS_KEY, JSON.stringify(keys));
    } catch { /* rien a faire */ }
  },
};

/** Etat du client en memoire. Aucune donnee Discord n est persistee. */
export class Store {
  me = null;
  application = null;
  guilds = new Map();
  messages = new Map();
  selectedGuildId = null;
  selectedChannelId = null;

  #listeners = new Set();

  /** S abonne aux changements. Retourne la fonction de desabonnement. */
  subscribe(handler) {
    this.#listeners.add(handler);
    return () => this.#listeners.delete(handler);
  }

  /** Notifie les abonnes d un changement cible. */
  emit(scope) {
    for (const handler of this.#listeners) handler(scope);
  }

  reset() {
    this.me = null;
    this.application = null;
    this.guilds.clear();
    this.messages.clear();
    this.selectedGuildId = null;
    this.selectedChannelId = null;
  }

  /* -------------------------------- serveurs ------------------------------ */

  upsertGuild(guild) {
    const existing = this.guilds.get(guild.id);
    const channels = existing?.channels ?? new Map();

    for (const channel of guild.channels ?? []) channels.set(channel.id, channel);
    for (const thread of guild.threads ?? []) channels.set(thread.id, thread);

    this.guilds.set(guild.id, {
      id: guild.id,
      name: guild.name ?? existing?.name ?? 'Serveur indisponible',
      icon: guild.icon ?? existing?.icon ?? null,
      unavailable: guild.unavailable === true,
      memberCount: guild.member_count ?? existing?.memberCount ?? null,
      channels,
    });

    this.emit('guilds');
  }

  removeGuild(id) {
    this.guilds.delete(id);
    if (this.selectedGuildId === id) {
      this.selectedGuildId = null;
      this.selectedChannelId = null;
    }
    this.emit('guilds');
  }

  setGuildChannels(guildId, channels) {
    const guild = this.guilds.get(guildId);
    if (!guild) return;
    for (const channel of channels) guild.channels.set(channel.id, channel);
    this.emit('channels');
  }

  upsertChannel(channel) {
    if (!channel.guild_id) return;
    const guild = this.guilds.get(channel.guild_id);
    if (!guild) return;
    guild.channels.set(channel.id, channel);
    this.emit('channels');
  }

  removeChannel(channel) {
    const guild = this.guilds.get(channel.guild_id);
    if (!guild) return;
    guild.channels.delete(channel.id);
    if (this.selectedChannelId === channel.id) this.selectedChannelId = null;
    this.emit('channels');
  }

  /** Salons textuels d un serveur, tries comme dans Discord. */
  textChannels(guildId) {
    const guild = this.guilds.get(guildId);
    if (!guild) return [];
    return [...guild.channels.values()]
      .filter((c) => TEXT_CHANNEL_TYPES.has(c.type))
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name));
  }

  /** Serveurs tries par nom. */
  sortedGuilds() {
    return [...this.guilds.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  channel(channelId) {
    for (const guild of this.guilds.values()) {
      const found = guild.channels.get(channelId);
      if (found) return found;
    }
    return null;
  }

  /* -------------------------------- messages ------------------------------ */

  addMessage(message) {
    const list = this.messages.get(message.channel_id) ?? [];
    list.push(message);
    if (list.length > MAX_MESSAGES_PER_CHANNEL) list.shift();
    this.messages.set(message.channel_id, list);
    if (message.channel_id === this.selectedChannelId) this.emit('messages');
  }

  channelMessages(channelId) {
    return this.messages.get(channelId) ?? [];
  }

  /* -------------------------------- selection ----------------------------- */

  selectGuild(guildId) {
    this.selectedGuildId = guildId;
    const first = this.textChannels(guildId)[0];
    this.selectedChannelId = first?.id ?? null;
    this.emit('selection');
  }

  selectChannel(channelId) {
    this.selectedChannelId = channelId;
    this.emit('selection');
  }

  /** Repasse sur la vue connexion / diagnostic. */
  clearSelection() {
    this.selectedGuildId = null;
    this.selectedChannelId = null;
    this.emit('selection');
  }
}
