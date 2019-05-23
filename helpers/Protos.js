const Protobuf = require("protobufjs");
Protobuf.convertFieldsToCamelCase = false;
/*
[
	{
		"name": "csgo",
		"protos": [
			__dirname + "/../protobufs/csgo/gcsystemmsgs.proto",
			__dirname + "/../protobufs/csgo/gcsdk_gcmessages.proto",
			__dirname + "/../protobufs/csgo/cstrike15_gcmessages.proto"
		]
	},
	{
		"name": "steam",
		"protos": [
			__dirname + "/../protobufs/steam/steammessages_base.proto"
		]
	}
]
*/
module.exports = (protos) => {
	const protobufs = {};

	for (let proto of protos) {
		let builder = Protobuf.newBuilder();

		for (let file of proto.protos) {
			Protobuf.loadProtoFile(file, builder);
		}

		protobufs[proto.name] = builder.build();
	}

	return protobufs;
}
