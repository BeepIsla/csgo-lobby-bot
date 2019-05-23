# **THIS HAS BEEN FIXED**

This is what me and a couple of friends used to mess with Streamers. Everything coded by me with a little bit of help regarding UIDs encoding by a good friend. This was used to send malicious lobby messages on CSGO in order to inject them with a looping code which would make a request to my server every second. The server would return code which the client would then automatically execute. This was all hooked up to a Discord bot so I was able to control it comfortably from within Discord. It also included a self destruct feature to eject the malicious code from the game. The message which was sent can be found inside the `rce` folder. Some example execution code can be found in the `examples` folder.

- [Partial Panorama API we had access to](https://developer.valvesoftware.com/wiki/CSGO_Panorama_API)
- [Label modifications which were possible](https://developer.valvesoftware.com/wiki/Dota_2_Workshop_Tools/Panorama/Panels#Label)

**Original README below**

---
---
---
---
---

# CSGO Lobby Bot

# Notes

- Not all of the config.json is used within the code, some might still be left overs from an older version
- Bots can join all lobbies as long as join permissions are anything other than "Friends Need Invite"
- You can get the LobbyID of **any** steam user if the above condition is met. Simply use their SteamID in `lobbyToJoin` instead of a lobby ID.

# Config

- `accounts`: Array with the following structure
  - `username`: The account name you use to log into that account
  - `password` : The password for the account
  - `sharedSecret`: Optional shared secret for two factor authentication
- `steamWebAPIKey`: Steam Web API Key from [here](https://steamcommunity.com/dev/apikey)
- `lobbyToJoin`: Lobby ID you want to join - This can also be a SteamID of the user you want to join - [Read more](#notes)

**ALL OF THE FOLLOWING VALUES CAN BE SET TO `false` IN ORDER TO DISABLE THEM/NOT SPOOF THEM**

- `personaName`: The persona name the bots will have - Will not update if you have recently had the bots in your lobby due to CSGO cache
- `chatMessage`: Message to send after joining a lobby
- `spoof`:
  - `rank`: Rank ID you want to display in the lobby (Between `1` (Silver I) and `18` (The Global Elite) | Any other value is unranked)
  - `rankType`: Game type ID your rank is from - `10` = Competitive | `7` = Wingman
  - `wins`: Amount of wins we have - This does **NOT** display anywhere. If you are unranked set this to 10 or above to display your rank, else it will show unranked
  - `medal`: Medal ID you want to have featured on your profile (Visit [tf2b.com](https://tf2b.com/itemlist.php?gid=730) for a list of IDs) **\***
  - `prime`: Set to `1` to set yourself as prime, `0` as Non-Prime **\***
  - `teamColor`: Value between `0` and `4` of the color you want (Default: `1`) **\***
  - `level`: Level you want to be **\***
  - `xp`: Amount of XP you want to have **\***
  - `commends`:
    - `friendly`: Amount of friendly commends you want to have **\***
    - `teaching`: Amount of teaching commends you want to have **\***
    - `leader`: Amount of leader commends you want to have **\***

**\* = Also shows on your profile when someone clicks on you**
