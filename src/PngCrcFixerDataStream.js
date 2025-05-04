import {CRC32, DataStream} from "armarius-io";

export default class PngCrcFixerDataStream extends DataStream {
    /** @type {DataStream} */ sourceStream;
    /** @type {Uint8Array} */ remainder = new Uint8Array(0);
    /** @type {boolean} */ firstChunk = true;
    /** @type {boolean} */ eof = false;
    /** @type {number} */ offset = 0;

    /**
     * @param {DataStream} sourceStream
     */
    constructor(sourceStream) {
        super();
        this.sourceStream = sourceStream;
    }

    /**
     * @inheritDoc
     */
    getFinalLength() {
        return this.sourceStream.getFinalLength();
    }

    /**
     * @inheritDoc
     */
    getOffset() {
        return this.offset;
    }

    /**
     * @param {number} exactLength
     * @return {Promise<Uint8Array>}
     */
    async readFromSource(exactLength) {
        let buffer = new Uint8Array(exactLength);
        let bufferedLength = Math.min(this.remainder.byteLength, exactLength);
        if (bufferedLength > 0) {
            buffer.set(this.remainder.subarray(0, bufferedLength), 0);
            this.remainder = this.remainder.subarray(bufferedLength);
        }

        let offset = bufferedLength;
        while (exactLength - offset > 0) {
            let chunk = await this.sourceStream.pull(exactLength - offset);
            if (chunk === null) {
                throw new Error("Unexpected end of stream");
            }
            if (chunk.byteLength >= exactLength - offset) {
                this.remainder = chunk.subarray(exactLength - offset);
                chunk = chunk.subarray(0, exactLength - offset);
            }
            buffer.set(chunk, offset);
            offset += chunk.byteLength;
        }

        return buffer;
    }

    /**
     * @return {Promise<Uint8Array>}
     */
    async processChunk() {
        if (this.firstChunk) {
            let signature = await this.readFromSource(8);
            if (signature[0] !== 0x89 || signature[1] !== 0x50 ||
                signature[2] !== 0x4E || signature[3] !== 0x47 ||
                signature[4] !== 0x0D || signature[5] !== 0x0A ||
                signature[6] !== 0x1A || signature[7] !== 0x0A) {
                throw new Error("Invalid PNG signature");
            }
            this.firstChunk = false;
            return signature;
        }

        let lengthBuffer = await this.readFromSource(4);
        let length = (lengthBuffer[0] << 24) | (lengthBuffer[1] << 16) | (lengthBuffer[2] << 8) | lengthBuffer[3];

        let chunk = await this.readFromSource(length + 8);
        let crc = CRC32.hash(chunk.subarray(0, chunk.byteLength - 4));
        let crcBuffer = new Uint8Array(4);
        crcBuffer[0] = (crc >> 24) & 0xFF;
        crcBuffer[1] = (crc >> 16) & 0xFF;
        crcBuffer[2] = (crc >> 8) & 0xFF;
        crcBuffer[3] = crc & 0xFF;

        let result = new Uint8Array(length + 12);
        result.set(lengthBuffer);
        result.set(chunk.subarray(0, chunk.byteLength - 4), 4);
        result.set(crcBuffer, chunk.byteLength);

        if (chunk[0] === 0x49 && chunk[1] === 0x45 && chunk[2] === 0x4e && chunk[3] === 0x44) {
            this.eof = true;
        }

        return result;
    }

    /**
     * @inheritDoc
     */
    async pull(length) {
        let chunks = [];
        let totalLength = 0;

        while (totalLength < length && !this.eof) {
            let chunk = await this.processChunk();
            chunks.push(chunk);
            totalLength += chunk.byteLength;
        }

        this.offset += totalLength;

        if (chunks.length === 0) {
            return null;
        }

        if (chunks.length === 1) {
            return chunks[0];
        }

        let result = new Uint8Array(totalLength);
        let offset = 0;
        for (let chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return result;
    }

    /**
     * @inheritDoc
     */
    async reset() {
        await this.sourceStream.reset();
        this.remainder = new Uint8Array(0);
        this.firstChunk = true;
        this.eof = false;
        this.offset = 0;
        return this;
    }
}
