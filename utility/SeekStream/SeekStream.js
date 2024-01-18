/**
 * 24.01.18 custom node modules 의존성 없앨겸 file stream 용으로 마개조했다.
 * 언제 원복할지 모르니 매개변수쪽은 냅두기로
 */

"use strict";
const { start } = require("repl");
const WebmSeeker_1 = require("./WebmSeeker");
const fs = require("fs");
/**
 * YouTube Stream Class for seeking audio to a timeStamp.
 */

const StreamType = {
    "Arbitrary": "arbitrary",
    "Raw": "raw",
    "OggOpus": "ogg/opus",
    "WebmOpus": "webm/opus",
    "Opus": "opus",
};

class SeekStream {
    constructor(file_path, duration, headerLength, contentLength, bitrate, video_url, options) {
        this.stream = new WebmSeeker_1.WebmSeeker(options.seek, {
            highWaterMark: 5 * 1000 * 1000,
            readableObjectMode: true
        });
        this.file_path = file_path;
        this.duration = Math.ceil(duration);
        this.type = StreamType.Opus;
        this.bytes_count = 0;
        this.per_sec_bytes = bitrate ? Math.ceil(bitrate / 8) : Math.ceil(contentLength / duration);
        this.content_length = contentLength;
        this.stream.on('close', () => {
            this.cleanup();
        });
        this.stream.on('end', () => {
            this.cleanup();
        });
        this.sec = options.seek ?? 0;
        this.seek();
    }
    /**
     * **INTERNAL Function**
     *
     * Uses stream functions to parse Webm Head and gets Offset byte to seek to.
     * @returns Nothing
     */
    async seek() {
        const parse = await new Promise(async (res, rej) => {
            if (!this.stream.headerparsed) {
                const stream = fs.createReadStream(this.file_path, { flags: 'r' });
                if (stream instanceof Error) {
                    rej(stream);
                    return;
                }

                stream.pipe(this.stream, { end: false }); //아마 header 부분만 재생하는 부분인듯
                // headComplete should always be called, leaving this here just in case
                stream.once('end', () => {
                    this.stream.state = WebmSeeker_1.WebmSeekerState.READING_DATA;
                    res('');
                });

                this.stream.once('headComplete', () => {
                    stream.unpipe(this.stream);
                    stream.destroy();
                    this.stream.state = WebmSeeker_1.WebmSeekerState.READING_DATA;
                    res('');
                });
            }
            else
                res('');
        }).catch((err) => err);

        if (parse instanceof Error) {
            this.stream.emit('error', parse);
            this.bytes_count = 0;
            this.per_sec_bytes = 0;
            this.cleanup();
            return;
        }

        this.stream.seekfound = false;
        this.bytes_count = 0;
        await this.loop();
    }

    cleanup() {
        this.stream = null;
        this.file_path = null;
    }

    async loop() {
        if (this.stream.destroyed) {
            this.cleanup();
            return;
        }
        const end = this.bytes_count + this.per_sec_bytes * 300;
        const start_point = this.per_sec_bytes * this.sec;
        const end_point = this.duration == Infinity ? Infinity : start_point + (this.per_sec_bytes * this.duration);
        const stream = fs.createReadStream(this.file_path, { flags: 'r', start: start_point, end: end_point });

        if (stream instanceof Error) {
            this.stream.emit('error', stream);
            this.bytes_count = 0;
            this.per_sec_bytes = 0;
            this.cleanup();
            return;
        }

        stream.pipe(this.stream, { end: false });
        stream.once('error', async () => {
            stream.destroy();
            this.cleanup();
            return;
        });

        stream.on('data', (chunk) => {
            this.bytes_count += chunk.length;
        });

        stream.on('end', () => {
            // if (end >= this.content_length) {
                this.cleanup();
            // }
        });
    }
}
exports.SeekStream = SeekStream;