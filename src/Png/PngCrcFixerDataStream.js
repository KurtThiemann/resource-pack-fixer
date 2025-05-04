import {BufferUtils, DataStream} from "armarius-io";
import PngChunk from "./PngChunk.js";

export default class PngCrcFixerDataStream extends DataStream {
    /** @type {DataStream} */ sourceStream;
    /** @type {Uint8Array} */ remainder = new Uint8Array(0);
    /** @type {boolean} */ firstChunk = true;
    /** @type {boolean} */ eof = false;
    /** @type {number} */ offset = 0;
    /** @type {Uint8Array[]} */ imageData = [];

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

        let chunk = await PngChunk.fromStream(this);

        if (chunk.hasType("IEND")) {
            this.eof = true;
        }

        if (chunk.hasType("IDAT")) {
            this.imageData.push(chunk.getData());
            return new Uint8Array(0);
        } else if (this.imageData.length) {
            let iDat = await this.createIDatChunk();
            return BufferUtils.concatBuffers([
                iDat.serialize(),
                chunk.serialize()
            ]);
        }

        return chunk.serialize();
    }

    /**
     * @return {Promise<PngChunk>}
     */
    async createIDatChunk() {
        let originalData = BufferUtils.concatBuffers(this.imageData);
        this.imageData = [];
        let offset = 0;
        for (let chunk of this.imageData) {
            originalData.set(chunk, offset);
            offset += chunk.byteLength;
        }

        let decompressed = await this.decompress(originalData);
        let compressed = await this.compress(decompressed);

        return new PngChunk(new Uint8Array([0x49, 0x44, 0x41, 0x54]), compressed);
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
        this.imageData = [];
        return this;
    }

    /**
     * @param {Uint8Array} data
     * @return {Promise<Uint8Array>}
     */
    async decompress(data) {
        data = data.subarray(2, data.length - 4);
        let inputStream = new ReadableStream({
            start: (controller) => {
                controller.enqueue(data);
                controller.close();
            }
        });
        const ds = new DecompressionStream('deflate-raw');
        const decompressedStream = inputStream.pipeThrough(ds);
        return new Uint8Array(await new Response(decompressedStream).arrayBuffer());
    }

    /**
     * @param {Uint8Array} data
     * @return {Promise<Uint8Array>}
     */
    async compress(data) {
        const inputStream = new ReadableStream({
            start: (controller) => {
                controller.enqueue(data);
                controller.close();
            }
        });
        const cs = new CompressionStream('deflate');
        const compressedStream = inputStream.pipeThrough(cs);
        return new Uint8Array(await new Response(compressedStream).arrayBuffer());
    }
}
