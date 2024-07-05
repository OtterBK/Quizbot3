const youtubedl = require('youtube-dl-exec');
const path = require('path');
const readline = require('readline');
const scanner = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

async function downloadVideoAsWebm(url, outputPath) {
    try {
        const output = await youtubedl(url, {
            paths: 'F:/Develope/discord_bot/Quizbot3/cache',
            output: 'test.webm',
            formatSort: '+size',
            format: 'bestaudio[ext=webm]',
        });

        console.log('Video download complete.');
    } catch (error) {
        console.error('Error downloading video:', error);
    }
}

waitForInput = async () => {
    scanner.question('input directory: ', async (line) => {
        const is_recursive = line.includes('-r');
        const dir_path = line.replace('-r', '').trim();

        total_count = await scan_directory(dir_path, is_recursive);
        console.log(`found target, ${total_count}`);

        const works = await convert_dir(dir_path, is_recursive);
        
        console.log(`finished converting count ${convert_count}/${total_count}`)
        waitForInput();
    });
}

// 예시 사용법
const youtubeUrl = 'https://www.youtube.com/watch?v=zVgKnfN9i34&pp=ygUT64KY66Oo7YagIOyLpOujqOyXow%3D%3D';
const outputFilePath = 'test.webm';

downloadVideoAsWebm(youtubeUrl, outputFilePath);
waitForInput();

