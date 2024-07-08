const readline = require('readline');
const audio_cache_manager = require('../quizbot/managers/audio_cache_manager');

const scanner = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});
  

waitForInput = async () => {
    scanner.question('are you ready?: ', async (line) => {
        audio_cache_manager.forceCaching(`${__dirname}/audio_url0.txt`);
        audio_cache_manager.forceCaching(`${__dirname}/audio_url1.txt`);
        audio_cache_manager.forceCaching(`${__dirname}/audio_url2.txt`);
        audio_cache_manager.forceCaching(`${__dirname}/audio_url3.txt`);
    });
}

waitForInput();