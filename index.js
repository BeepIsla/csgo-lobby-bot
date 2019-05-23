const SteamID = require("steamid");
const Inquirer = require("inquirer");
const Table = require("cli-table");
const Account = require("./helpers/Account.js");
const steamIDParser = require("./helpers/steamIDParser.js");
const config = require("./config.json");

let bots = [];
let joinAction = 0;
let joinActionFlags = {
	ChatSpam: 0b001,
	Party: 0b010,
	Crash: 0b100,
};
let joinActionData = {
	ChatSpam: {
		message: "",
		delay: 1
	},
	Party: {
		delay: 1
	},
	Crash: {
		startDelay: 1
	}
};
let retryData = {
	stayInLobby: 1,
	timeBetweenTries: 1,
	target: "",
	stopContiniousLobbySearch: false,
	reconnect: false
};
let stopped = false;

(async () => {
	console.log("Logging into " + config.accounts.length + " account" + (config.accounts.length === 1 ? "" : "s"));
	bots = await Promise.all(config.accounts.map(acc => accountHandler(acc.username, acc.password, acc.sharedSecret)));

	console.log("All " + config.accounts.length + " account" + (config.accounts.length === 1 ? "" : "s") + " are now ready!");
	askInput();
})();

function askInput() {
	console.log(""); // Empty line for separation

	Inquirer.prompt({
		type: "list",
		message: "What do you want to do?",
		name: "reply",
		pageSize: 10,
		choices: [
			"Join Lobby",
			"Check until joinable",
			"Send Message to Lobby",
			"Disconnect from Lobby",
			"Restart all bots",
			"Set after-join action",
			"Convert Steam to LobbyID",
			"Get current matchmaking game of SteamID",
			"Log off all bots"
		]
	}).then(async (res) => {
		switch (res.reply) {
			case "Join Lobby": {
				let resp = await Inquirer.prompt({
					type: "input",
					name: "reply",
					message: "LobbyID, SteamID or profile link to join"
				});

				if (resp.reply.length <= 0) {
					console.log("Invalid SteamID/LobbyID/Profile URL");
					break;
				}

				let sid = undefined;
				try {
					sid = new SteamID(resp.reply);
				} catch (e) { };

				if (sid === undefined || sid.isLobby() === false) {
					console.log("Non-Lobby ID detected - Trying to convert to LobbyID before joining...");

					if (sid === undefined) {
						sid = await steamIDParser(resp.reply, config.steamWebAPIKey).catch(() => { });

						if (typeof sid === "undefined") {
							console.log("Failed to parse " + resp.reply + " to SteamID");
							break;
						}
					}

					let partyLobby = await bots[0].csgoUser.sendMessage(
						730,
						bots[0].csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_ClientPartyJoinRelay,
						{},
						bots[0].csgoUser.Protos.csgo.CMsgGCCStrike15_v2_ClientPartyJoinRelay,
						{
							accountid: sid.accountid
						},
						bots[0].csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_ClientPartyJoinRelay,
						bots[0].csgoUser.Protos.csgo.CMsgGCCStrike15_v2_ClientPartyJoinRelay,
						10000
					).catch(() => { });

					if (typeof partyLobby === "undefined") {
						console.log("Failed to get lobby ID");
						break;
					}

					sid = new SteamID(partyLobby.lobbyid.toString());

					console.log("Converted " + resp.reply + " to " + sid.getSteamID64());
				} else {
					console.log("Lobby ID detected");
				}

				await joinLobby(sid.getSteamID64());

				// So the console logs have enough time to happen before we continue with the next
				await new Promise(r => setTimeout(r, 1000));
				break;
			}
			case "Check until joinable": {
				retryData.stopContiniousLobbySearch = false;
				stopped = true;

				Promise.all(bots.map(b => b.disconnectFromLobby()));

				let resp = await Inquirer.prompt({
					type: "input",
					name: "reply",
					message: "Cooldown in milliseconds the lobby check is gonna have, basically counts as a delay as well"
				});

				if (resp.reply.length <= 0) {
					console.log("Invalid delay defined");
					break;
				}

				retryData.timeBetweenTries = parseInt(resp.reply);

				if (isNaN(retryData.timeBetweenTries) === true) {
					console.log("Not a number");
					break;
				}

				let respo = await Inquirer.prompt({
					type: "input",
					name: "reply",
					message: "LobbyID, SteamID or profile link to join"
				});

				if (respo.reply.length <= 0) {
					console.log("Invalid SteamID/LobbyID/Profile URL");
					break;
				}

				let respon = await Inquirer.prompt({
					type: "confirm",
					name: "reply",
					message: "Do you want to automatically leave and retry?"
				});

				retryData.reconnect = respon.reply;

				if (retryData.reconnect === true) {
					let respons = await Inquirer.prompt({
						type: "input",
						name: "reply",
						message: "How long do you want to stay in the lobby before leaving and retrying?"
					});

					if (respons.reply.length <= 0) {
						console.log("Invalid delay defined");
						break;
					}

					retryData.stayInLobby = parseInt(respons.reply);

					if (isNaN(retryData.stayInLobby) === true) {
						console.log("Not a number");
						break;
					}
				}

				retryData.target = respo.reply;

				startContiniousSearch();
				await new Promise(p => setTimeout(p, 1000));

				await Inquirer.prompt({
					type: "input",
					name: "reply",
					message: "Hit enter to go back to the action selection! Also cancels the lobby search.\n"
				});
				retryData.stopContiniousLobbySearch = true;

				break;
			}
			case "Send Message to Lobby": {
				let resp = await Inquirer.prompt({
					type: "input",
					name: "reply",
					message: "Message to send"
				});

				if (resp.reply.length <= 0) {
					console.log("Invalid Message");
					break;
				}

				Promise.all(bots.map(b => b.sendChatMessage(resp.reply)));

				await new Promise(p => setTimeout(p, 100));
				break;
			}
			case "Disconnect from Lobby": {
				console.log("Leaving lobby...");

				stopped = true;
				Promise.all(bots.map(b => b.disconnectFromLobby()));

				await new Promise(p => setTimeout(p, 100));
				break;
			}
			case "Restart all bots": {
				console.log("Logging off..");

				stopped = true;
				Promise.all(bots.map(b => b.disconnectFromLobby()));
				await new Promise(p => setTimeout(p, 1000));

				bots.forEach(bot => bot.steamUser.logOff());
				await new Promise(p => setTimeout(p, 1000));

				bots.length = 0;

				console.log("Logging into " + config.accounts.length + " account" + (config.accounts.length === 1 ? "" : "s"));
				bots = await Promise.all(config.accounts.map(acc => accountHandler(acc.username, acc.password, acc.sharedSecret)));

				console.log("All " + config.accounts.length + " account" + (config.accounts.length === 1 ? "" : "s") + " are now ready!");
				break;
			}
			case "Set after-join action": {
				let choices = [
					{
						name: "Spam Chat",
						value: "ChatSpam",
						checked: false
					},
					{
						name: "Party",
						value: "Party",
						checked: false
					},
					{
						name: "Crash",
						value: "Crash",
						checked: false
					}
				];

				for (let choice of choices) {
					if (joinAction & joinActionFlags[choice.value]) {
						choice.checked = true;
					}
				}

				console.log("Note: When too many things happen at once some might get ignored");

				let resp = await Inquirer.prompt({
					type: "checkbox",
					message: "Enable/Disable actions",
					name: "reply",
					choices: choices
				});

				joinAction = 0;
				for (let choice of resp.reply) {
					joinAction = joinAction | joinActionFlags[choice];

					let filter = choices.filter(c => c.value === choice);
					if (filter.length > 0) {
						console.log("Enabled: " + filter[0].name);
					} else {
						console.log("Enabled: " + choice);
					}
				}

				if (joinAction & joinActionFlags.ChatSpam) {
					let respo = await Inquirer.prompt({
						type: "input",
						message: "[CHAT SPAM] What message would you like to spam?",
						name: "reply"
					});

					joinActionData.ChatSpam.message = respo.reply;

					respo = await Inquirer.prompt({
						type: "input",
						message: "[CHAT SPAM] How high would you like the delay in milliseconds between mesages to be?",
						name: "reply"
					});

					joinActionData.ChatSpam.delay = parseInt(respo.reply);
				}

				if (joinAction & joinActionFlags.Party) {
					console.log("Note to the upcoming question: Too fast will make everyone crash");

					let respo = await Inquirer.prompt({
						type: "input",
						message: "[PARTY] How high would you like the delay in miliseconds between updates to be?",
						name: "reply"
					});

					joinActionData.Party.delay = parseInt(respo.reply);
				}

				if (joinAction & joinActionFlags.Crash) {
					console.log("Note to the upcoming question: There is a default delay of a second or two because Valve code and CSGO doesn't update anything until it suddenly freezes");

					let respo = await Inquirer.prompt({
						type: "input",
						message: "[CRASH] How long to wait in milliseconds after joining before crashing?",
						name: "reply"
					});

					joinActionData.Crash.startDelay = parseInt(respo.reply);
				}

				break;
			}
			case "Convert Steam to LobbyID": {
				let resp = await Inquirer.prompt({
					type: "input",
					name: "reply",
					message: "SteamID or Steam profile URL"
				});

				if (resp.reply.length <= 0) {
					console.log("Invalid SteamID/LobbyID");
					break;
				}

				console.log("Converting...");

				let sid2 = await steamIDParser(resp.reply, config.steamWebAPIKey).catch(() => { });

				if (typeof sid2 === "undefined") {
					console.log("Failed to parse " + resp.reply + " to SteamID");
					break;
				}

				let partyLobby = await bots[0].csgoUser.sendMessage(
					730,
					bots[0].csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_ClientPartyJoinRelay,
					{},
					bots[0].csgoUser.Protos.csgo.CMsgGCCStrike15_v2_ClientPartyJoinRelay,
					{
						accountid: sid2.accountid
					},
					bots[0].csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_ClientPartyJoinRelay,
					bots[0].csgoUser.Protos.csgo.CMsgGCCStrike15_v2_ClientPartyJoinRelay,
					10000
				).catch(() => { });

				if (typeof partyLobby === "undefined") {
					console.log("Failed to get lobby ID");
					break;
				}

				console.log(partyLobby.lobbyid.toString());
				break;
			}
			case "Get current matchmaking game of SteamID": {
				let resp = await Inquirer.prompt({
					type: "input",
					name: "reply",
					message: "SteamID or profile link to join"
				});

				if (resp.reply.length <= 0) {
					console.log("Invalid SteamID/Profile URL");
					break;
				}

				let sid = undefined;
				try {
					sid = new SteamID(resp.reply);
				} catch (e) { };

				if (sid === undefined || sid.isValid() === false) {
					console.log("Non-Steam ID detected - Trying to convert to SteamID before getting match...");

					if (sid === undefined) {
						sid = await steamIDParser(resp.reply, config.steamWebAPIKey).catch(() => { });

						if (typeof sid === "undefined") {
							console.log("Failed to parse " + resp.reply + " to SteamID");
							break;
						}
					}

					console.log("Converted " + resp.reply + " to " + sid.getSteamID64());
				} else {
					console.log("Steam ID detected");
				}

				let liveGame = await bots[0].csgoUser.sendMessage(
					730,
					bots[0].csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_MatchListRequestLiveGameForUser,
					{},
					bots[0].csgoUser.Protos.csgo.CMsgGCCStrike15_v2_MatchListRequestLiveGameForUser,
					{
						accountid: sid.accountid
					},
					bots[0].csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_MatchList,
					bots[0].csgoUser.Protos.csgo.CMsgGCCStrike15_v2_MatchList,
					30000
				).catch(() => { });

				if (liveGame.matches.length <= 0) {
					console.log("Target is not in a match");
					break;
				}

				const scoreboard = new Table({ head: ["SteamID", "Kills", "Assists", "Deaths", "Score"] });
				const details = new Table({ head: ["Server ID", "Match ID", "Version", "Map", "Match Duration", "Spectators", "CT Score", "T Score"] });

				for (let i = 0; i < liveGame.matches[0].roundstats_legacy.reservation.account_ids.length; i++) {
					scoreboard.push([
						SteamID.fromIndividualAccountID(liveGame.matches[0].roundstats_legacy.reservation.account_ids[i]).getSteamID64(),
						liveGame.matches[0].roundstats_legacy.kills[i],
						liveGame.matches[0].roundstats_legacy.assists[i],
						liveGame.matches[0].roundstats_legacy.deaths[i],
						liveGame.matches[0].roundstats_legacy.scores[i]
					]);
				}

				details.push([
					liveGame.matches[0].watchablematchinfo.server_id.toString(),
					liveGame.matches[0].watchablematchinfo.match_id.toString(),
					liveGame.matches[0].roundstats_legacy.reservation.server_version,
					liveGame.matches[0].watchablematchinfo.game_map,
					liveGame.matches[0].watchablematchinfo.tv_time,
					liveGame.matches[0].watchablematchinfo.tv_spectators,
					liveGame.matches[0].roundstats_legacy.scores[0],
					liveGame.matches[0].roundstats_legacy.scores[1]
				]);

				console.log(details.toString());
				console.log(scoreboard.toString());
				break;
			}
			case "Log off all bots": {
				console.log("Logging off..");

				stopped = true;
				Promise.all(bots.map(b => b.disconnectFromLobby()));
				await new Promise(p => setTimeout(p, 1000));

				bots.forEach(bot => bot.steamUser.logOff());
				await new Promise(p => setTimeout(p, 1000));

				bots.length = 0;

				return;
			}
			default: {
				console.log("Invalid selection");
				break;
			}
		}

		askInput();
	});
}

function accountHandler(username, password, sharedSecret) {
	return new Promise((resolve, reject) => {
		const acc = new Account();

		acc.login(username, password, sharedSecret, config.personaName).then(async (logon) => {
			resolve(acc);
		}).catch((err) => {
			reject(err);
		});
	});
}

async function startContiniousSearch() {
	let sid = undefined;
	try {
		sid = new SteamID(retryData.target);
	} catch (e) { };

	if (sid === undefined || sid.isLobby() === false) {
		console.log("Non-Lobby ID detected - Trying to convert to LobbyID before joining...");

		if (sid === undefined) {
			sid = await steamIDParser(retryData.target, config.steamWebAPIKey).catch(() => { });

			if (typeof sid === "undefined") {
				console.log("Failed to parse " + retryData.target + " to SteamID");
				return;
			}
		}

		console.log("Checking for available lobby...");

		let partyLobby = undefined;
		(async () => {
			while (typeof partyLobby === "undefined") {
				if (retryData.stopContiniousLobbySearch === true) {
					break;
				}

				partyLobby = await bots[0].csgoUser.sendMessage(
					730,
					bots[0].csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_ClientPartyJoinRelay,
					{},
					bots[0].csgoUser.Protos.csgo.CMsgGCCStrike15_v2_ClientPartyJoinRelay,
					{
						accountid: sid.accountid
					},
					bots[0].csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_ClientPartyJoinRelay,
					bots[0].csgoUser.Protos.csgo.CMsgGCCStrike15_v2_ClientPartyJoinRelay,
					retryData.timeBetweenTries
				).catch(() => { });
			}

			if (typeof partyLobby === "undefined") {
				return;
			}

			sid = new SteamID(partyLobby.lobbyid.toString());

			await isLobby();
		})();
	} else {
		console.log("Lobby ID detected");
		await isLobby();
	}

	async function isLobby() {
		console.log("Converted " + retryData.target + " to " + sid.getSteamID64());
		await joinLobby(sid.getSteamID64());

		if (retryData.reconnect === true) {
			// Instead of a simple timeout do this so if we cancel while retrying
			let timer = 0;
			while (true) {
				if (timer >= retryData.stayInLobby) {
					break;
				}

				if (retryData.stopContiniousLobbySearch === true) {
					break;
				}

				timer += 1;
				await new Promise(p => setTimeout(p, 1));
			}

			if (retryData.stopContiniousLobbySearch === true) {
				Promise.all(bots.map(b => b.disconnectFromLobby()));
				stopped = true;
				return;
			}

			console.log("Retrying...");

			Promise.all(bots.map(b => b.disconnectFromLobby()));
			stopped = true;
			startContiniousSearch();
		}
	}
}

async function joinLobby(lobbyID) {
	Promise.all(bots.map(b => b.disconnectFromLobby()));
	stopped = false;

	// Join lobby - For some reason I can't spam join the lobby all at once
	let usableBots = [];
	for (let i = 0; i < bots.length; i++) {
		await new Promise((resolve, reject) => {
			bots[i].once("_joinedLobby", (bot) => {
				usableBots.push(bot);
				resolve();
			});

			bots[i].joinLobby(lobbyID, config.spoof).catch((err) => {
				reject(err);
			});
		}).catch((err) => {
			console.error(err.message);
		});
	}

	if (usableBots.length <= 0) {
		console.log("All bots failed to join");
		return;
	}

	// Run this all in an anonymous function so we don't get blocked due to the while loops
	(async () => {
		let _doChatSpam = -1;
		let _doParty = -1;
		let _doCrash = -1;

		while (stopped === false) {
			// Chat spammer
			if (joinAction & joinActionFlags.ChatSpam) {
				if (_doChatSpam === -1) {
					console.log("Started chat spammer");
				}

				_doChatSpam += 1;

				if (_doChatSpam >= joinActionData.ChatSpam.delay) {
					Promise.all(usableBots.map(bot => bot.sendHTMLMessage(joinActionData.ChatSpam.message)));

					_doChatSpam = 0;
				}
			}

			// Party
			if (joinAction & joinActionFlags.Party) {
				if (_doParty === -1) {
					console.log("Started party");
				}

				_doParty += 1;

				if (_doParty >= joinActionData.Party.delay) {
					let settings = config.spoof;

					for (let bot of usableBots) {
						if (stopped === true) {
							break;
						}

						settings.rank = Math.floor(Math.random() * 16) + 1;
						settings.teamColor = Math.floor(Math.random() * 4);
						settings.level = Math.floor(Math.random() * 40) + 1;
						settings.xp = Math.floor(Math.random() * 500000);
						settings.prime = Math.round(Math.random());
						settings.commends.friendly = Math.floor(Math.random() * 1000000);
						settings.commends.teaching = Math.floor(Math.random() * 1000000);
						settings.commends.leader = Math.floor(Math.random() * 1000000);

						bot.sendSetPlayerRanking(settings);
					}

					_doParty = 0;
				}
			}

			// Crasher
			if (joinAction & joinActionFlags.Crash) {
				if (_doCrash === -1) {
					console.log("Starting crasher in " + joinActionData.Crash.startDelay + "ms");
				}

				_doCrash += 1;

				if (_doCrash >= joinActionData.Crash.startDelay) {
					Promise.all(usableBots.map(b => b.sendSetPlayerRanking(config.spoof)));

					_doCrash = joinActionData.Crash.startDelay; // Once enabled always enabled
				}
			}

			// Execute the entire while loop every millisecond, basically a millisecond counter!
			await new Promise(p => setTimeout(p, 1));
		}
	})();
}
