const ByteBuffer = require("bytebuffer");
const Long = require("long");
const Type = {
	None: 0,
	String: 1,
	Int32: 2,
	Float32: 3,
	Pointer: 4,
	WideString: 5,
	Color: 6,
	UInt64: 7,
	End: 11
};

module.exports = class Lobby {
	/**
	 * Decode a lobby chat msg
	 * @param {String|Buffer|ByteBuffer} buffer Buffer to decode
	 * @returns {Object}
	 */
	static DecodeLobbyChatMsg(buffer) {
		if (typeof buffer === "string") {
			buffer = Buffer.from(buffer, "hex");
		}

		if (typeof buffer.readCString !== "function") {
			buffer = ByteBuffer.wrap(buffer, false, false);
		}

		buffer.littleEndian = false;

		let version = buffer.readUint32();
		buffer.readUInt8(); // Skip over the 0x00

		let event = buffer.readCString();

		let obj = {
			version: version,
			event: event,
			data: _DecodeEventMessage(buffer)
		};

		return obj;
	}

	/**
	 * Encode a lobby chat msg object - While not great it does its job
	 * @param {Object} object Object to encode
	 * @returns {Buffer}
	 */
	static EncodeLobbyChatMsg(object) {
		let buffer = new ByteBuffer();

		buffer.writeInt16(0x00);
		buffer.writeInt16(object.version);
		buffer.writeByte(0x00);
		buffer.writeCString(object.event);

		_EncodeEventMessage(buffer, object.data);

		buffer.writeByte(Type.End);

		buffer.flip();

		return buffer;
	}
}

/**
 * Internal usage only
 * @param {Buffer} buffer Buffer to decode
 * @returns {Object}
 */
function _DecodeEventMessage(buffer) {
	if (typeof buffer === "string") {
		buffer = Buffer.from(buffer, "hex");
	}

	if (typeof buffer.readCString !== "function") {
		buffer = ByteBuffer.wrap(buffer);
	}

	let retObj = {};

	while (true) {
		let type = buffer.readUint8();

		if (type === Type.End) {
			break;
		}

		let name = buffer.readCString();

		switch (type) {
			case Type.None: {
				retObj[name] = _DecodeEventMessage(buffer);
				break;
			}
			case Type.String: {
				retObj[name] = buffer.readCString();
				break;
			}
			case Type.Int32:
			case Type.Color:
			case Type.Pointer: {
				retObj[name] = buffer.readInt32();
				break;
			}
			case Type.UInt64: {
				retObj[name] = buffer.readUint64();
				break;
			}
			case Type.Float32: {
				retObj[name] = buffer.readFloat32();
				break;
			}
		}
	}

	return retObj;
}

function _EncodeEventMessage(buffer, object) {
	for (let key in object) {
		switch (true) {
			case typeof object[key] === "string": {
				buffer.writeByte(Type.String);
				buffer.writeCString(key);
				buffer.writeCString(object[key]);
				break;
			}
			case typeof object[key] === "number": {
				buffer.writeByte(Type.Int32);
				buffer.writeCString(key);
				buffer.writeInt32(object[key]);
				break;
			}
			case object[key].constructor.name === "Long": {
				buffer.writeByte(Type.UInt64);
				buffer.writeCString(key);
				buffer.writeUint64(object[key].toString());
				break;
			}
			case typeof object[key] === "object": {
				buffer.writeByte(Type.None);
				buffer.writeCString(key);
				_EncodeEventMessage(buffer, object[key]);
				break;
			}
			default: {
				console.log("Invalid type for: " + key);
				break;
			}
		}
	}

	buffer.writeByte(Type.End);
}
