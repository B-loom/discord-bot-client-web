# Discord Bot Client Web

**En ligne : <https://b-loom.github.io/discord-bot-client-web/>**

Un client Discord pour **bot**, qui tourne entierement dans le navigateur.
Tu colles le token de ton bot, tu te connectes, et tu vois ton bot en ligne :
serveurs, salons, membres et messages **en direct**, dans une interface facon
Discord.

Pas de serveur a heberger, pas d'extension a installer, pas de build.
Du HTML, du CSS et du JavaScript natif (modules ES).

---

## Ce que le site fait

- **Connexion avec un token de bot.** Tu colles le token, tu te connectes au
  Gateway de Discord. Le token est valide directement par Discord a
  l'identification (une erreur de token donne un message clair).
- **Choix des intents** du Gateway (Options avancees), y compris les intents
  privilegies (Message Content, Server Members, Presences).
- **Vue facon Discord** : barre des serveurs a gauche, liste des salons, zone
  de messages, et **liste des membres** a droite (groupes En ligne / Hors ligne,
  pastilles de statut, badge bot).
- **Ouverture automatique** du premier salon apres la connexion.
- **Messages en direct** : les messages envoyes pendant que tu es connecte
  s'affichent dans le salon ouvert.
- **Pastilles « non lu »** : un message dans un autre salon marque ce salon et
  son serveur, pour voir tout de suite ou ca parle.
- **Journal du Gateway** filtrable et **panneau de diagnostic** (session ID,
  sequence, latence, heartbeat, shard, intents actifs).
- **Robustesse** : heartbeat, reprise de session (`RESUME`), reconnexion
  automatique avec backoff, detection des connexions mortes, messages clairs
  sur les codes de fermeture (4004 token refuse, 4014 intents non autorises...).

## Ce que le site NE peut PAS faire (et pourquoi)

Ces limites ne sont pas des bugs : ce sont des contraintes du navigateur.

- **Pas d'historique** des anciens messages.
- **Pas d'envoi** de messages.

Pour charger l'historique ou envoyer, il faut l'**API REST** de Discord. Or
Discord **ne renvoie pas les en-tetes CORS** pour les requetes de bot : un vrai
navigateur bloque donc ces appels. Seul le **Gateway** (un WebSocket, non soumis
au CORS) fonctionne depuis une page web — d'ou le temps reel uniquement.

Pour debloquer l'historique et l'envoi, il faudrait soit un **proxy que tu
heberges** (qui ajoute les en-tetes CORS ; ton token passe alors par ton propre
proxy), soit une **application de bureau** (type Electron) qui n'a pas la
restriction CORS.

---

## Recuperer un token de bot

1. [Discord Developer Portal](https://discord.com/developers/applications) >
   `New Application`
2. Onglet `Bot` > `Reset Token` > copie le token
3. Dans `Privileged Gateway Intents`, active ce dont tu as besoin, **puis**
   coche-le dans « Options avancees » au moment de la connexion :
   - **Message Content** pour lire le texte des messages
   - **Server Members** pour afficher la liste des membres
   - **Presence** pour les statuts (en ligne / inactif / ne pas deranger)
4. Onglet `OAuth2` > `URL Generator` > scope `bot` > invite le bot sur un serveur

> Si tu coches un intent privilegie sans l'avoir active dans le Developer
> Portal, Discord refuse la connexion (code `4014`) : le message te le dira.

## Le token

- Il reste dans **ton** navigateur. Les seules requetes partent vers
  `discord.com` / `gateway.discord.gg` et `cdn.discordapp.com`.
- La case « Garder le token dans ce navigateur » l'ecrit dans `localStorage`.
  Sans elle, il disparait au rechargement.
- `Se deconnecter` efface le token stocke.
- Un token de bot donne le **controle total** du bot. Ne le partage pas, ne le
  commite pas. S'il fuite : `Reset Token` dans le Developer Portal.

---

## Lancer en local

Les modules ES exigent un vrai serveur HTTP : ouvrir `index.html` en `file://`
ne marche pas.

```bash
python -m http.server 5173
```

Puis <http://localhost:5173>.

## Deployer

Site statique, publie par GitHub Pages depuis `main` a la racine (`.nojekyll`
present). Chaque push sur `main` redeploie.

---

## Comment c'est construit

```
index.html               ecran de connexion + coquille du client
assets/css/style.css     theme sombre facon Discord
assets/js/constants.js   opcodes, intents, flags, codes de fermeture
assets/js/api.js         client REST (best-effort : bloque par CORS en navigateur)
assets/js/gateway.js     client WebSocket du Gateway (coeur de la connexion)
assets/js/store.js       etat en memoire (serveurs, salons, membres, messages)
assets/js/ui.js          rendu du DOM
assets/js/app.js         orchestration
```

### Comment la connexion marche

- Le **Gateway** est un WebSocket : le CORS ne s'y applique pas. C'est lui qui
  valide le token (`IDENTIFY` -> `READY`, ou fermeture `4004`) et qui fournit
  l'identite du bot, les serveurs, les salons, les membres et les messages.
- L'**API REST** de Discord est appelee de maniere *best-effort* seulement :
  comme elle est bloquee par CORS dans un navigateur, la connexion ne depend
  jamais d'elle.

## Credits

Inspire de [ChrisEric1/ChrisEric1.GitHub.io](https://github.com/ChrisEric1/ChrisEric1.GitHub.io).
Pour une vraie interface Discord complete (avec historique et envoi), voir le
projet de bureau [Nebula](https://github.com/B-loom/discord-bot-client-Nebula).

## Licence

MIT, voir [LICENSE](LICENSE).
