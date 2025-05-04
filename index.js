import {BlobIO} from "armarius-io";
import {DirectoryEntrySource, ReadArchive, WriteArchive} from "armarius";
import DataStreamEntrySource from "armarius/src/Archive/EntrySource/DataStreamEntrySource.js";
import PngCrcFixerDataStream from "./src/Png/PngCrcFixerDataStream.js";

let input = document.getElementById("resource-pack-input");
let status = document.getElementsByClassName("status")[0];

function setStatus(text) {
    status.textContent = text;
}

input.addEventListener("change", async () => {
    let file = input.files[0];
    if (!file) {
        setStatus("No file selected");
        return;
    }

    let fileName = file.name;

    setStatus("Opening ZIP archive...");

    let io = new BlobIO(file);
    let archive = new ReadArchive(io, {
        ignoreMultiDiskErrors: true,
        allowTruncatedCentralDirectory: true,
        allowAdditionalCentralDirectoryEntries: true,
        entryOptions: {
            allowTrailingSlashInFileName: true
        }
    });

    try {
        await archive.init();
    } catch (e) {
        setStatus(`Failed to open ZIP archive: ${e.message}`);
        return;
    }

    setStatus("Creating ZIP archive...");
    let writeArchive = new WriteArchive(generateEntries(archive, (entryCount) => {
        if (entryCount % 10 === 0) {
            setStatus(`Processed ${entryCount} files...`);
        }
    }));
    let chunks = [];
    let chunk;
    try {
        while (chunk = await writeArchive.getNextChunk()) {
            chunks.push(chunk);
        }
    } catch (e) {
        setStatus(`Failed to create ZIP archive: ${e.message}`);
        return;
    }

    let blob = new Blob(chunks, {type: "application/zip"});
    let url = URL.createObjectURL(blob);

    setStatus("Downloading ZIP archive...");

    let newName = fileName.replace(/\.zip$/i, "") + "-fixed.zip";
    let a = document.createElement("a");
    a.href = url;
    a.download = newName;
    a.click();
});

let count = 0;
async function *generateEntries(archive, onProgress = null) {
    let entries = await archive.getEntryIterator();
    let entry;
    while (entry = await entries.next()) {
        let name = entry.getFileNameString();
        if (entry.isDirectory()) {
            yield new DirectoryEntrySource({
                fileName: name
            });
            continue;
        }

        let stream = await entry.getDataReader({
            ignoreInvalidChecksums: true,
            ignoreInvalidUncompressedSize: true
        });

        if (/\.png\/*$/.test(name)) {
            let fixerStream = new PngCrcFixerDataStream(stream);
            if (await testPngFixer(fixerStream)) {
                stream = fixerStream;
            } else {
                console.warn(`PNG CRC fixer failed for ${name}, using original file content`);
            }
        }

        count++;
        if (onProgress) {
            onProgress(count);
        }

        yield new DataStreamEntrySource(stream, {
            fileName: name,
        });
    }
}

/**
 * @param {PngCrcFixerDataStream} stream
 * @return {Promise<boolean>}
 */
async function testPngFixer(stream) {
    let chunk;
    do {
        try {
            chunk = await stream.pull(1024 * 1024);
        } catch (e) {
            await stream.reset();
            return false;
        }
    } while (chunk !== null);
    await stream.reset();
    return true;
}
