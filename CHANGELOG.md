# Changelog

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/)
et le projet suit [SemVer](https://semver.org/lang/fr/).

## [1.0.0] - 2026-11-03

Premiere version : se connecter a un bot Discord depuis le navigateur.

### Ajoute

- Ecran de connexion par token de bot, valide via `GET /users/@me`
- Selection des intents du Gateway, memorisee dans le navigateur
- Detection des intents privilegies autorises via les flags de l'application,
  et retrait automatique de ceux qui provoqueraient une fermeture `4014`
- Client du Gateway v10 : `HELLO`, `IDENTIFY`, heartbeat avec jitter,
  `READY`, `RESUME`, `INVALID_SESSION`, `RECONNECT`
- Reconnexion automatique avec backoff exponentiel et detection des
  connexions mortes via l'absence de `HEARTBEAT_ACK`
- Traduction des codes de fermeture du Gateway en messages lisibles
- Liste des serveurs et des salons textuels, avec repli sur l'API REST
  quand l'intent `GUILDS` n'est pas demande
- Affichage en direct des messages recus (`MESSAGE_CREATE`)
- Journal filtrable des evenements du Gateway
- Panneau de diagnostic : etat, session ID, sequence, latence, heartbeat,
  shard, application, intents actifs
- Stockage optionnel du token dans `localStorage`, efface a la deconnexion

### Limites connues

- Pas d'envoi de messages ni d'historique des salons
- Seul le shard `0` est ouvert : les bots qui exigent du sharding ne verront
  qu'une partie de leurs serveurs
