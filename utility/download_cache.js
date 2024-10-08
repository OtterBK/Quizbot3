const readline = require('readline');
const audio_cache_manager = require('../quizbot/managers/audio_cache_manager');

const scanner = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
  

const waitForInput = async () => 
{
  scanner.question('are you ready?: ', async (line) => 
  {
    audio_cache_manager.forceCaching(`${__dirname}/audio_url${0}.txt`, 0);
    audio_cache_manager.forceCaching(`${__dirname}/audio_url${1}.txt`, 1);
    audio_cache_manager.forceCaching(`${__dirname}/audio_url${2}.txt`, 2);
    audio_cache_manager.forceCaching(`${__dirname}/audio_url${3}.txt`, 3);
  });
};

waitForInput();