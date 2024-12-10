import {BlobIO} from "armarius-io";
import {ReadArchive, WriteArchive} from "armarius";
import DataStreamEntrySource from "armarius/src/Archive/EntrySource/DataStreamEntrySource.js";

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
        allowTruncatedCentralDirectory: true
    });

    try {
        await archive.init();
    } catch (e) {
        setStatus(`Failed to open ZIP archive: ${e.message}`);
        return;
    }

    setStatus("Creating ZIP archive...");
    let writeArchive = new WriteArchive(generateEntries(archive));
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

async function *generateEntries(archive) {
    let entries = await archive.getEntryIterator();
    let entry;
    while (entry = await entries.next()) {
        yield new DataStreamEntrySource(await entry.getDataReader({
            ignoreInvalidChecksums: true,
            ignoreInvalidUncompressedSize: true
        }), {
            fileName: entry.getFileNameString()
        });
    }
}
