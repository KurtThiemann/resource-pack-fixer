import {CRC32} from "armarius-io";

export default class PngChunk {
    /** @type {Uint8Array} */ type;
    /** @type {Uint8Array} */ data;

    static async fromStream(stream) {
        let lengthBytes = await stream.readFromSource(4);
        let length = lengthBytes[0] << 24 | lengthBytes[1] << 16 | lengthBytes[2] << 8 | lengthBytes[3];
        let type = await stream.readFromSource(4);

        let data = await stream.readFromSource(length);
        await stream.readFromSource(4);
        return new PngChunk(type, data);
    }

    /**
     * @param {Uint8Array} type
     * @param {Uint8Array} data
     */
    constructor(type, data) {
        this.type = type;
        this.data = data;
    }

    /**
     * @return {Uint8Array}
     */
    getType() {
        return this.type;
    }

    /**
     * @return {Uint8Array}
     */
    getData() {
        return this.data;
    }

    /**
     * @param {string} type
     * @return {boolean}
     */
    hasType(type) {
        return String.fromCharCode(this.type[0], this.type[1], this.type[2], this.type[3]).toUpperCase() === type.toUpperCase();
    }

    /**
     * @return {Uint8Array}
     */
    serialize() {
        let length = this.data.byteLength;
        let result = new Uint8Array(length + 12);
        result[0] = (length >> 24) & 0xFF;
        result[1] = (length >> 16) & 0xFF;
        result[2] = (length >> 8) & 0xFF;
        result[3] = length & 0xFF;
        result.set(this.type, 4);
        result.set(this.data, 8);

        let crc = new CRC32();
        crc.add(this.type);
        crc.add(this.data);
        let value = crc.finish();
        let crcBuffer = new Uint8Array(4);
        crcBuffer[0] = (value >> 24) & 0xFF;
        crcBuffer[1] = (value >> 16) & 0xFF;
        crcBuffer[2] = (value >> 8) & 0xFF;
        crcBuffer[3] = value & 0xFF;
        result.set(crcBuffer, length + 8);

        return result;
    }
}
