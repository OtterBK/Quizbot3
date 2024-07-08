const readline = require('readline');
const audio_cache_manager = require('../quizbot/managers/audio_cache_manager');

const scanner = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});
  

waitForInput = async () => {
    scanner.question('are you ready?: ', async (line) => {
        const audio_url_list = `${__dirname}/audio_url.txt`;
        audio_cache_manager.forceCaching(audio_url_list);
    });
}

waitForInput();