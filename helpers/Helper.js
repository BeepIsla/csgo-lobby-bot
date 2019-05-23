const request = require("request");
const Protos = require("./Protos.js");
const protos = Protos([
	{
		name: "csgo",
		protos: [
			__dirname + "/../protobufs/csgo/base_gcmessages.proto",
			__dirname + "/../protobufs/csgo/cstrike15_gcmessages.proto"
		]
	}
]);

module.exports = class Helper {
	static GetCurrentVersion(appid) {
		return new Promise((resolve, reject) => {
			request("https://api.steampowered.com/ISteamApps/UpToDateCheck/v1/?format=json&appid=" + appid + "&version=0", (err, res, body) => {
				if (err) {
					reject(err);
					return;
				}

				let json = undefined;
				try {
					json = JSON.parse(body);
				} catch(e) {};

				if (json === undefined) {
					reject(body);
					return;
				}

				if (!json.response || !json.response.success) {
					reject(json);
					return;
				}

				resolve(json.response.required_version);
			});
		});
	}

	static FullDecodeGCHello(obj) {
		for (let i = 0; i < obj.outofdate_subscribed_caches.length; i++) {
			obj.outofdate_subscribed_caches[i] = decodeOODSC(obj.outofdate_subscribed_caches[i]);
		}

		return obj;
	}

	static parseUIDs(input) {
		let result = [];
	
		let byte = input.readUint8();
		while (byte !== 0x00) {
			result.push(byte);
			byte = input.readUint8();
		}
	
		return decode_uids(result);
	}
	
}

function decodeOODSC(obj) {
	for (let i = 0; i < obj.objects.length; i++) {
		obj.objects[i] = decodeObject( obj.objects[i]);
	}

	return obj;
}

function decodeObject(obj) {
	const objectTypes = {
		"1": protos.csgo["CSOEconItem"],
		"2": protos.csgo["CSOPersonaDataPublic"],
		"5": protos.csgo["CSOItemRecipe"],
		"7": protos.csgo["CSOEconGameAccountClient"],
		"38": protos.csgo["CSOEconItemDropRateBonus"],
		"40": protos.csgo["CSOEconItemEventTicket"],
		"43": protos.csgo["CSOEconDefaultEquippedDefinitionInstanceClient"],
		"45": protos.csgo["CSOEconCoupon"],
		"46": protos.csgo["CSOQuestProgress"]
	};

	if (typeof objectTypes[obj.type_id.toString()] === "undefined") {
		return obj;
	}

	for (let i = 0; i < obj.object_data.length; i++) {
		try {
			obj.object_data[i] = objectTypes[obj.type_id.toString()].decode(obj.object_data[i]);
		} catch (e) {
			obj.object_data[i] = obj.object_data[i];
		}
	}

	return obj;
}

function decode_uids(input) {
	input.push(0);
	let b = Buffer.from(input);
	let results = [];
	let position = 0;

	while (position < b.length) {
		let lookahead = 0;
		let token = b.readInt8(position);
		let backup = token;
		let v5 = 0;
		let v7 = 0;
		let v9 = 0;

		do {
			backup = token;
			lookahead += 1;
			v9 = (token & 0x7F) << v7;
			v7 += 7;
			v5 |= v9;

			if (token === 0 || backup >= 0) {
				break;
			}

			token = b.readInt8(position + lookahead);
		} while (v7 < 35)

		if (backup < 0) {
			break;
		}

		position += lookahead;

		if (v5 === 0) {
			continue;
		}

		results.push(SteamID.fromIndividualAccountID(v5));
	}

	return results;
}
