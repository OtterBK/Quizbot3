//외부 modules
const { Client, GatewayIntentBits } = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

//로컬 modules
const CONFIG = require('./config.json');
const command_register = require('./commands.js');



/**  이벤트 등록  **/
//봇 최초 실행 이벤트
client.on('ready', () => {
  console.log(`Initializing Quizbot...`);

  try{
    command_register.registerCommands(CONFIG.BOT_TOKEN, CONFIG.CLIENT_ID, "733548069169397842"); //봇 테스트 서버    
    client.user.setActivity(`/퀴즈 | /quiz `);
  }catch(exc){
    console.log(exc);
  }

  console.log(`Started Quizbot! tag name: ${client.user.tag}!`);

});

// 상호작용 이벤트
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === '퀴즈') {
    await interaction.reply('Pong!');
  }
});


/** 메인 **/
//봇 활성화
client.login(CONFIG.BOT_TOKEN);