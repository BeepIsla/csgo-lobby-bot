const SteamUser = require("steam-user");
const SteamTotp = require("steam-totp");
const SteamID = require("steamid");
const Long = require("long");
const ByteBuffer = require("bytebuffer");
const Helper = require("./Helper.js");
const GameCoordinator = require("./GameCoordinator.js");
const Lobby = require("./Lobby.js");
const VDF = require("./VDF.js");
const Events = require("events");

const listenProtobufs = {
	"6612": "CMsgClientMMSLobbyData",
	"6614": "CMsgClientMMSLobbyChatMsg",
	"766": "CMsgClientPersonaState"
};

module.exports = class Account extends Events {
	constructor() {
		super();

		this.steamUser = new SteamUser();
		this.csgoUser = new GameCoordinator(this.steamUser);

		this.hello = {};
		this.mmHello = {};
		this.lobby = null;
		this.csgoVersion = null;

		// Events
		let og = this.steamUser._handleMessage;
		this.steamUser._handleMessage = (header, payload) => {
			og.call(this.steamUser, header, payload);

			let proto = listenProtobufs[header.msg.toString()];
			if (typeof proto === "undefined") {
				return;
			}

			let body = undefined;
			try {
				body = this.csgoUser.Protos.steam[proto].decode(payload);
			} catch (e) { };

			if (body === undefined) {
				this.emit("debug", header, body);
				return;
			}

			try {
				switch (header.msg) {
					case 6612: {
						if (body.metadata === null) {
							this.emit("debug", "Metadata is null, not attempting to parse");
							return;
						}
						body.metadata = VDF.decode(body.metadata, { uids: Helper.parseUIDs });
						this.emit("lobbyData", body);
						break;
					}
					case 6614: {
						body.lobby_message = Lobby.DecodeLobbyChatMsg(body.lobby_message);
						this.emit("lobbyChatMsg", body);
						break;
					}
					case 766: {
						this.emit("personaState", body);
						break;
					}
					default: {
						this.emit("debug", header, body);
					}
				}
			} catch (err) {
				// Sometimes the decoded data is literally just "null" for everything, I do not know why this happens but for now this seems to work!
				this.emit("warn", err, header, body);
			}
		}
	}

	/**
	 * Log into Steam and establish CSGO GC connection
	 * @param {String} username Steam login username
	 * @param {String} password Steam login password
	 * @param {String} sharedSecret Steam 2FA shared secret
	 * @param {String} personaName Optional persona name
	 * @returns {Promise.<Object>}
	 */
	login(username, password, sharedSecret = null, personaName = null) {
		return new Promise(async (resolve, reject) => {
			this.csgoVersion = await Helper.GetCurrentVersion(730).catch((err) => {
				reject(err);
			});

			if (typeof this.csgoVersion === "undefined") {
				return;
			}

			let logonSettings = {
				accountName: username,
				password: password
			};

			if (typeof sharedSecret === "string" && sharedSecret.length > 5) {
				logonSettings.twoFactorCode = SteamTotp.getAuthCode(sharedSecret);
			}

			this.steamUser.logOn(logonSettings);

			let error = (err) => {
				this.steamUser.removeListener("error", error);
				this.steamUser.removeListener("loggedOn", loggedOn);
				this.steamUser.removeListener("appLaunched", appLaunched);

				reject(err);
			};

			let loggedOn = async () => {
				await new Promise(p => setTimeout(p, 1000));

				this.steamUser.setPersona(SteamUser.EPersonaState.Online, personaName);
				this.steamUser.gamesPlayed([730]);
			};

			let appLaunched = async (appid) => {
				if (appid !== 730) {
					return;
				}

				this.steamUser.removeListener("error", error);
				this.steamUser.removeListener("loggedOn", loggedOn);
				this.steamUser.removeListener("appLaunched", appLaunched);

				try {
					this.hello = await this.csgoUser.start();
					this.hello = Helper.FullDecodeGCHello(this.hello);

					this.mmHello = await this.csgoUser.sendMessage(
						730,
						this.csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_MatchmakingClient2GCHello,
						{},
						this.csgoUser.Protos.csgo.CMsgGCCStrike15_v2_MatchmakingClient2GCHello,
						{},
						this.csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_MatchmakingGC2ClientHello,
						this.csgoUser.Protos.csgo.CMsgGCCStrike15_v2_MatchmakingGC2ClientHello,
						30000
					);

					resolve({
						hello: this.hello,
						mmHello: this.mmHello
					});
				} catch (err) {
					reject(err);
				}
			};

			this.steamUser.on("error", error);
			this.steamUser.on("loggedOn", loggedOn);
			this.steamUser.on("appLaunched", appLaunched);
		});
	}

	/**
	 * Get a list of lobbies (* = Unsure description could be wrong)
	 * @param {Number} ver Game version we are searching for
	 * @param {Boolean} apr Prime or not*
	 * @param {Number} ark Rank multiplied by 10*
	 * @param {Array.<Number>} grps *
	 * @param {Number} launcher If we are using the China CSGO launcher or not*
	 * @param {Number} game_type Game type, 8 Competitive, 10 Wingman
	 * @returns {Promise.<Object>}
	 */
	getLobbyList(ver, apr, ark, grps, launcher, game_type) {
		return this.csgoUser.sendMessage(
			730,
			this.csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_Party_Search,
			{},
			this.csgoUser.Protos.csgo.CMsgGCCStrike15_v2_Party_Search,
			{
				ver: ver,
				apr: apr ? 1 : 0,
				ark: ark,
				grps: grps,
				launcher: launcher,
				game_type: game_type
			},
			this.csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_Party_Search,
			this.csgoUser.Protos.csgo.CMsgGCCStrike15_v2_Party_SearchResults,
			30000
		);
	}

	/**
	 * Get lobby data for a specific lobby
	 * @param {String|Number} lobbyID Lobby ID to get data from
	 * @returns {Promise.<Object>}
	 */
	getLobbyData(lobbyID) {
		if (typeof lobbyID === "number") {
			let sid = new SteamID();
			sid.accountid = lobbyID;
			sid.instance = 393216;
			sid.type = 8;
			sid.universe = 1;

			lobbyID = sid.getSteamID64();
		}

		return new Promise((resolve, reject) => {
			this.csgoUser.sendMessage(
				undefined,
				6611,
				{
					steamid: this.steamUser.steamID.getSteamID64(),
					client_sessionid: this.steamUser._sessionID,
					routing_appid: 730
				},
				this.csgoUser.Protos.steam.CMsgClientMMSGetLobbyData,
				{
					app_id: 730,
					steam_id_lobby: new SteamID(lobbyID).getSteamID64(),
				},
				6612,
				this.csgoUser.Protos.steam.CMsgClientMMSLobbyData,
				30000
			).then((lobbyData) => {
				if (lobbyData.metadata instanceof ByteBuffer) {
					try {
						lobbyData.metadata = VDF.decode(lobbyData.metadata, { uids: Helper.parseUIDs });
					} catch (e) {
						lobbyData.metadata = lobbyData.metadata.toString("hex").toUpperCase();
					}
				}

				resolve(lobbyData);
			}).catch((err) => {
				reject(err);
			});
		});
	}

	/**
	 * Request friend data of Steam users
	 * @param {Array.<String>} friends SteamIDs to get info from
	 * @param {Number} timeout Max time we wait before cancelling
	 * @returns {Promise.<Array.<Object>>}
	 */
	requestFriendData(friends, timeout = 30000) {
		return new Promise((resolve, reject) => {
			this.csgoUser.sendMessage(
				undefined,
				815,
				{
					steamid: this.steamUser.steamID.getSteamID64(),
					client_sessionid: this.steamUser._sessionID
				},
				this.csgoUser.Protos.steam.CMsgClientRequestFriendData,
				{
					persona_state_requested: 1106,
					friends: friends
				},
				undefined,
				undefined,
				30000
			).then(() => {
				let timeoutError = setTimeout(() => {
					this.removeListener("personaState", personaState);

					reject(new Error("Not enough responses within " + Math.round(timeout / 1000) + " seconds"));
				}, timeout);

				let data = [];

				let personaState = (body) => {
					for (let friend of body.friends) {
						if (friends.includes(friend.friendid) === false) {
							continue;
						}

						data.push(friend);
					}

					if (data.length >= friends.length) {
						clearTimeout(timeoutError);

						this.removeListener("personaState", personaState);

						resolve(data);
					}
				};

				this.on("personaState", personaState);
			}).catch((err) => {
				console.error(err);
			});
		});
	}

	/**
	 * Join a lobby and set spoofed data
	 * @param {String} lobbyID LobbyID
	 * @param {Object} spoofedData Object with data we are using for spoofing
	 * @returns {Promise.<Object>}
	 */
	joinLobby(lobbyID, spoofedData = {
		rank: false,
		rankType: false,
		wins: false,
		medal: false,
		prime: false,
		teamColor: false,
		level: false,
		xp: false,
		commends: {
			friendly: false,
			teaching: false,
			leader: false
		}
	}) {
		return new Promise(async (resolve, reject) => {
			let sid = new SteamID(lobbyID);

			if (sid.isLobby() === false) {
				let partyLobby = await this.csgoUser.sendMessage(
					730,
					this.csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_ClientPartyJoinRelay,
					{},
					this.csgoUser.Protos.csgo.CMsgGCCStrike15_v2_ClientPartyJoinRelay,
					{
						accountid: sid.accountid
					},
					this.csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_ClientPartyJoinRelay,
					this.csgoUser.Protos.csgo.CMsgGCCStrike15_v2_ClientPartyJoinRelay,
					10000
				);

				sid = new SteamID(partyLobby.lobbyid.toString());
			}

			let joinLobby = await this.csgoUser.sendMessage(
				undefined,
				6603,
				{
					steamid: this.steamUser.steamID.getSteamID64(),
					client_sessionid: this.steamUser._sessionID,
					routing_appid: 730,
					jobid_source: this.steamUser._currentJobID += 1
				},
				this.csgoUser.Protos.steam.CMsgClientMMSJoinLobby,
				{
					app_id: 730,
					steam_id_lobby: sid.getSteamID64(),
					persona_name: this.steamUser.accountInfo.name
				},
				6604,
				this.csgoUser.Protos.steam.CMsgClientMMSJoinLobbyResponse,
				30000
			);

			if (joinLobby.chat_room_enter_response !== 1) {
				reject(new Error("Got invalid enter room response: " + joinLobby.chat_room_enter_response));
				return;
			}

			this.emit("_joinedLobby", this);
			this.lobby = joinLobby.steam_id_lobby;

			if (typeof joinLobby.metadata !== "undefined") {
				joinLobby.metadata = VDF.decode(joinLobby.metadata, { uids: Helper.parseUIDs });
			}

			await this.csgoUser.sendMessage(
				undefined,
				6613,
				{
					steamid: this.steamUser.steamID.getSteamID64(),
					client_sessionid: this.steamUser._sessionID,
					routing_appid: 730
				},
				this.csgoUser.Protos.steam.CMsgClientMMSSendLobbyChatMsg,
				{
					app_id: 730,
					steam_id_lobby: joinLobby.steam_id_lobby,
					steam_id_target: "0",
					lobby_message: Lobby.EncodeLobbyChatMsg({
						version: this.csgoVersion,
						event: "SysSession::RequestJoinData",
						data: {
							id: Long.fromString(this.steamUser.steamID.getSteamID64()),
							settings: {
								members: {
									joinflags: Long.fromNumber(0),
									machine0: {
										dlcmask: Long.fromNumber(0),
										flags: Long.fromNumber(0),
										id: Long.fromString(this.steamUser.steamID.getSteamID64()),
										numPlayers: 1,
										ping: 0,
										player0: {
											game: {
												clanID: 33094711,
												clanname: "Cute Fangs Appreciation Club",
												clantag: "CuteFangs",
												commends: "[f" +
													(spoofedData.commends.friendly === false ? this.mmHello.commendation.cmd_friendly : spoofedData.commends.friendly)
													+ "][t" +
													(spoofedData.commends.teaching === false ? this.mmHello.commendation.cmd_teaching : spoofedData.commends.teaching)
													+ "][l" +
													(spoofedData.commends.leader === false ? this.mmHello.commendation.cmd_leader : spoofedData.commends.leader)
													+ "]",
												level: spoofedData.level === false ? this.mmHello.player_level : spoofedData.level,
												loc: this.hello.location.country,
												medals: "[!" + (spoofedData.medal === false ? "970" : spoofedData.medal) + "]", // TODO: Do not hardcode this and figure out what this is when there is no medal at all ("mmHello.medals" returns null)
												prime: spoofedData.prime === false ? (this.hello.outofdate_subscribed_caches[0].objects.filter(o => o.type_id === 2)[0].object_data[0].elevated_state ? 1 : 0) : spoofedData.prime,
												ranking: spoofedData.rank === false ? this.mmHello.ranking.rank_id : spoofedData.rank,
												ranktype: spoofedData.rankType === false ? this.mmHello.ranking.rank_type_id : spoofedData.rankType,
												teamcolor: spoofedData.teamColor === false ? 1 : spoofedData.teamColor,
												wins: spoofedData.wins === false ? this.mmHello.ranking.wins : spoofedData.wins,
												xppts: spoofedData.xp === false ? this.mmHello.player_cur_xp : spoofedData.xp
											},
											name: this.steamUser.accountInfo.name,
											xuid: Long.fromString(this.steamUser.steamID.getSteamID64())
										},
										tuver: "00000000"
									},
									numMachines: 1,
									numPlayers: 1,
									numSlots: 1
								},
								teamResKey: Long.fromNumber(0)
							}
						}
					})
				},
				6614,
				this.csgoUser.Protos.steam.CMsgClientMMSLobbyChatMsg,
				30000
			);

			await this.csgoUser.sendMessage(
				undefined,
				6613,
				{
					steamid: this.steamUser.steamID.getSteamID64(),
					client_sessionid: this.steamUser._sessionID,
					routing_appid: 730
				},
				this.csgoUser.Protos.steam.CMsgClientMMSSendLobbyChatMsg,
				{
					app_id: 730,
					steam_id_lobby: joinLobby.steam_id_lobby,
					steam_id_target: "0",
					lobby_message: Lobby.EncodeLobbyChatMsg({
						version: this.csgoVersion,
						event: "SysSession::Command",
						data: {
							"Game::SetPlayerRanking": {
								game: {
									commends: "[f" +
										(spoofedData.commends.friendly === false ? this.mmHello.commendation.cmd_friendly : spoofedData.commends.friendly)
										+ "][t" +
										(spoofedData.commends.teaching === false ? this.mmHello.commendation.cmd_teaching : spoofedData.commends.teaching)
										+ "][l" +
										(spoofedData.commends.leader === false ? this.mmHello.commendation.cmd_leader : spoofedData.commends.leader)
										+ "]",
									level: spoofedData.level === false ? this.mmHello.player_level : spoofedData.level,
									loc: this.hello.location.country,
									medals: "[T2][C2][W0][G1][A1][!" + (spoofedData.medal === false ? "970" : spoofedData.medal) + "][^" + (spoofedData.medal === false ? "970" : spoofedData.medal) + "]", // TODO: What is T, C, W, G & A?
									prime: spoofedData.prime === false ? (this.hello.outofdate_subscribed_caches[0].objects.filter(o => o.type_id === 2)[0].object_data[0].elevated_state ? 1 : 0) : spoofedData.prime,
									ranking: spoofedData.rank === false ? this.mmHello.ranking.rank_id : spoofedData.rank,
									ranktype: spoofedData.rankType === false ? this.mmHello.ranking.rank_type_id : spoofedData.rankType,
									teamcolor: spoofedData.teamColor === false ? 1 : spoofedData.teamColor,
									wins: spoofedData.wins === false ? this.mmHello.ranking.wins : spoofedData.wins,
									xppts: spoofedData.xp === false ? this.mmHello.player_cur_xp : spoofedData.xp
								},
								run: "host",
								xuid: Long.fromString(this.steamUser.steamID.getSteamID64())
							}
						}
					})
				},
				6614,
				this.csgoUser.Protos.steam.CMsgClientMMSLobbyChatMsg,
				30000
			);

			await this.csgoUser.sendMessage(
				undefined,
				6613,
				{
					steamid: this.steamUser.steamID.getSteamID64(),
					client_sessionid: this.steamUser._sessionID,
					routing_appid: 730
				},
				this.csgoUser.Protos.steam.CMsgClientMMSSendLobbyChatMsg,
				{
					app_id: 730,
					steam_id_lobby: joinLobby.steam_id_lobby,
					steam_id_target: "0",
					lobby_message: Lobby.EncodeLobbyChatMsg({
						version: this.csgoVersion,
						event: "SysSession::Command",
						data: {
							"RequestHostUpdate": {
								run: "host",
								update: {}
							}
						}
					})
				},
				6614,
				this.csgoUser.Protos.steam.CMsgClientMMSLobbyChatMsg,
				30000
			);

			resolve(joinLobby);
		});
	}

	/**
	 * Message to send in the lobby
	 * @param {String} message Message to send
	 * @returns {Promise.<Object|null>}
	 */
	sendChatMessage(message) {
		return new Promise(async (resolve, reject) => {
			if (this.lobby === null) {
				resolve(null);
				return;
			}

			let res = this.csgoUser.sendMessage(
				undefined,
				6613,
				{
					steamid: this.steamUser.steamID.getSteamID64(),
					client_sessionid: this.steamUser._sessionID,
					routing_appid: 730
				},
				this.csgoUser.Protos.steam.CMsgClientMMSSendLobbyChatMsg,
				{
					app_id: 730,
					steam_id_lobby: this.lobby,
					steam_id_target: "0",
					lobby_message: Lobby.EncodeLobbyChatMsg({
						version: this.csgoVersion,
						event: "SysSession::Command",
						data: {
							"Game::Chat": {
								run: "all",
								name: this.steamUser.accountInfo.name,
								chat: message.toString(),
								xuid: Long.fromString(this.steamUser.steamID.getSteamID64())
							}
						}
					})
				},
				6614,
				this.csgoUser.Protos.steam.CMsgClientMMSLobbyChatMsg,
				30000
			);

			resolve(res);
		});
	}

	/**
	 * Message to send in the lobby
	 * @param {String} message Message to send
	 * @returns {Promise.<Object|null>}
	 */
	sendHTMLMessage(message) {
		return new Promise(async (resolve, reject) => {
			if (this.lobby === null) {
				resolve(null);
				return;
			}

			let res = this.csgoUser.sendMessage(
				undefined,
				6613,
				{
					steamid: this.steamUser.steamID.getSteamID64(),
					client_sessionid: this.steamUser._sessionID,
					routing_appid: 730
				},
				this.csgoUser.Protos.steam.CMsgClientMMSSendLobbyChatMsg,
				{
					app_id: 730,
					steam_id_lobby: this.lobby,
					steam_id_target: "0",
					lobby_message: Lobby.EncodeLobbyChatMsg({
						version: this.csgoVersion,
						event: "SysSession::Command",
						data: {
							"Game::ChatReportMatchmakingStatus": {
								run: "all",
								name: this.steamUser.accountInfo.name,
								status: message.toString(),
								xuid: Long.fromString(this.steamUser.steamID.getSteamID64())
							}
						}
					})
				},
				6614,
				this.csgoUser.Protos.steam.CMsgClientMMSLobbyChatMsg,
				30000
			);

			resolve(res);
		});
	}

	/**
	 * Message to send in the lobby
	 * @param {String} message Message to send
	 * @returns {Promise.<Object|null>}
	 */
	sendRainbowMessage(message) {
		return new Promise(async (resolve, reject) => {
			if (this.lobby === null) {
				resolve(null);
				return;
			}

			message = message.split("").map(l => "<font color=\"#" + parseInt(Math.random() * 0xffffff).toString(16) + "\">" + l + "</font>").join("");

			let res = this.csgoUser.sendMessage(
				undefined,
				6613,
				{
					steamid: this.steamUser.steamID.getSteamID64(),
					client_sessionid: this.steamUser._sessionID,
					routing_appid: 730
				},
				this.csgoUser.Protos.steam.CMsgClientMMSSendLobbyChatMsg,
				{
					app_id: 730,
					steam_id_lobby: this.lobby,
					steam_id_target: "0",
					lobby_message: Lobby.EncodeLobbyChatMsg({
						version: this.csgoVersion,
						event: "SysSession::Command",
						data: {
							"Game::ChatReportMatchmakingStatus": {
								run: "all",
								name: this.steamUser.accountInfo.name,
								status: message.toString(),
								xuid: Long.fromString(this.steamUser.steamID.getSteamID64())
							}
						}
					})
				},
				6614,
				this.csgoUser.Protos.steam.CMsgClientMMSLobbyChatMsg,
				30000
			);

			resolve(res);
		});
	}

	/**
	 * Update a player with fake data
	 * @param {Object} spoofedData Spoofed data we want to update to
	 * @returns {Promise.<Object>}
	 */
	sendSetPlayerRanking(spoofedData = {
		rank: false,
		rankType: false,
		wins: false,
		level: false,
		xp: false,
		commends: {
			friendly: false,
			teaching: false,
			leader: false
		},
		medal: false,
		teamColor: false,
		prime: false
	}) {
		return new Promise(async (resolve, reject) => {
			if (this.lobby === null) {
				resolve(null);
				return;
			}

			let res = await this.csgoUser.sendMessage(
				undefined,
				6613,
				{
					steamid: this.steamUser.steamID.getSteamID64(),
					client_sessionid: this.steamUser._sessionID,
					routing_appid: 730
				},
				this.csgoUser.Protos.steam.CMsgClientMMSSendLobbyChatMsg,
				{
					app_id: 730,
					steam_id_lobby: this.lobby,
					steam_id_target: "0",
					lobby_message: Lobby.EncodeLobbyChatMsg({
						version: this.csgoVersion,
						event: "SysSession::Command",
						data: {
							"Game::SetPlayerRanking": {
								run: "host",
								xuid: Long.fromString(this.steamUser.steamID.getSteamID64()),
								game: {
									commends: "[f" +
										(spoofedData.commends.friendly === false ? this.mmHello.commendation.cmd_friendly : spoofedData.commends.friendly)
										+ "][t" +
										(spoofedData.commends.teaching === false ? this.mmHello.commendation.cmd_teaching : spoofedData.commends.teaching)
										+ "][l" +
										(spoofedData.commends.leader === false ? this.mmHello.commendation.cmd_leader : spoofedData.commends.leader)
										+ "]",
									level: spoofedData.level === false ? this.mmHello.player_level : spoofedData.level,
									loc: this.hello.location.country,
									medals: "[T2][C2][W0][G1][A1][!" + (spoofedData.medal === false ? "970" : spoofedData.medal) + "][^" + (spoofedData.medal === false ? "970" : spoofedData.medal) + "]", // TODO: What is T, C, W, G & A?
									prime: spoofedData.prime === false ? (this.hello.outofdate_subscribed_caches[0].objects.filter(o => o.type_id === 2)[0].object_data[0].elevated_state ? 1 : 0) : spoofedData.prime,
									ranking: spoofedData.rank === false ? this.mmHello.ranking.rank_id : spoofedData.rank,
									ranktype: spoofedData.rankType === false ? this.mmHello.ranking.rank_type_id : spoofedData.rankType,
									teamcolor: spoofedData.teamColor === false ? 1 : spoofedData.teamColor,
									wins: spoofedData.wins === false ? this.mmHello.ranking.wins : spoofedData.wins,
									xppts: spoofedData.xp === false ? this.mmHello.player_cur_xp : spoofedData.xp
								}
							}
						}
					})
				},
				6614,
				this.csgoUser.Protos.steam.CMsgClientMMSLobbyChatMsg,
				30000
			);

			resolve(res);
		});
	}

	/**
	 * Send a custom message buffer to the lobby
	 * @param {Buffer} buffer Custom message buffer to send
	 * @returns {Promise.<Object>}
	 */
	sendCustomMsg(buffer) {
		return new Promise(async (resolve, reject) => {
			if (this.lobby === null) {
				resolve(null);
				return;
			}

			let res = await this.csgoUser.sendMessage(
				undefined,
				6613,
				{
					steamid: this.steamUser.steamID.getSteamID64(),
					client_sessionid: this.steamUser._sessionID,
					routing_appid: 730
				},
				this.csgoUser.Protos.steam.CMsgClientMMSSendLobbyChatMsg,
				{
					app_id: 730,
					steam_id_lobby: this.lobby,
					steam_id_target: "0",
					lobby_message: buffer
				},
				6614,
				this.csgoUser.Protos.steam.CMsgClientMMSLobbyChatMsg,
				30000
			);

			resolve(res);
		});
	}

	/**
	 * Invite someone to our lobby
	 * @param {Long|String} steamID SteamID to invite
	 * @returns {Promise.<null>}
	 */
	inviteToLobby(steamID) {
		return new Promise(async (resolve, reject) => {
			if (this.lobby === null) {
				resolve(null);
				return;
			}

			await this.csgoUser.sendMessage(
				undefined,
				6621,
				{
					steamid: this.steamUser.steamID.getSteamID64(),
					client_sessionid: this.steamUser._sessionID,
					routing_appid: 730
				},
				this.csgoUser.Protos.steam.CMsgClientMMSInviteToLobby,
				{
					app_id: 730,
					steam_id_lobby: this.lobby,
					steam_id_user_invited: steamID.toString()
				},
				undefined,
				undefined,
				30000
			);

			resolve(null);
		});
	}

	/**
	 * Send a game command to everyone in the lobby
	 * @param {String} gameCommand Game command to send (CASE SENSITIVE)
	 * @returns {Promise.<Object>}
	 */
	sendGameCommand(gameCommand) {
		let obj = {
			version: this.csgoVersion,
			event: "SysSession::Command",
			data: {}
		};

		obj.data[gameCommand] = {
			run: "host",
			update: {}
		}

		return this.csgoUser.sendMessage(
			undefined,
			6613,
			{
				steamid: this.steamUser.steamID.getSteamID64(),
				client_sessionid: this.steamUser._sessionID,
				routing_appid: 730
			},
			this.csgoUser.Protos.steam.CMsgClientMMSSendLobbyChatMsg,
			{
				app_id: 730,
				steam_id_lobby: this.lobby,
				steam_id_target: "0",
				lobby_message: Lobby.EncodeLobbyChatMsg(obj)
			},
			6614,
			this.csgoUser.Protos.steam.CMsgClientMMSLobbyChatMsg,
			30000
		);
	}

	/**
	 * Disconnect from a lobby
	 * @returns {Promise.<Object|null>}
	 */
	disconnectFromLobby() {
		return new Promise(async (resolve, reject) => {
			let response = await this.csgoUser.sendMessage(
				undefined,
				6605,
				{
					steamid: this.steamUser.steamID.getSteamID64(),
					client_sessionid: this.steamUser._sessionID,
					routing_appid: 730
				},
				this.csgoUser.Protos.steam.CMsgClientMMSLeaveLobby,
				{
					app_id: 730,
					steam_id_lobby: this.lobby
				},
				6606,
				this.csgoUser.Protos.steam.CMsgClientMMSLeaveLobbyResponse,
				30000
			);

			this.lobby = null;

			resolve(response);
		});
	}
}
