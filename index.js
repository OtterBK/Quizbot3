'use strict';

//외부 modules
const { Client, GatewayIntentBits } = require('discord.js');
const client = new Client({ intents: [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildVoiceStates,
] });

//로컬 modules
const CONFIG = require('./config.json');
const command_register = require('./commands.js');
const quizbot_ui = require('./quizbot-ui.js');
const quiz_system = require('./quiz_system.js');

/** global 변수 **/
let uiHolder_map = quizbot_ui.getUIHolderMap(); //어차피 계속 사용할거라서 참조하고 있어도 된다.
let guild_session_map = quiz_system.getSessionMap(); //어차피 계속 사용할거라서 참조하고 있어도 된다.

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

  let guildID = interaction.guild.id;

  if(interaction.commandName === '퀴즈') {
    
    let uiHolder = quizbot_ui.createUIHolder(interaction);
    uiHolder_map[guildID] = uiHolder; //UIHolder 새로 등록

    return;
  }

  if(uiHolder_map.hasOwnProperty(guildID))
  {
    await interaction.deferUpdate(); //우선 응답 좀 보내고 처리함
    let uiHolder = uiHolder_map[guildID];
    await uiHolder.on('interactionCreate', interaction);
  }

});

//전역 에러 처리
process.on('uncaughtException', (err) => {
  console.error(err);
});

/** 메인 **/
//봇 활성화
client.login(CONFIG.BOT_TOKEN);

//UI holder Aging Manager
const uiholder_aging_for_oldkey_value = 600 * 1000; //last updated time이 600초 이전인 ui는 삭제할거임
const uiholder_aging_manager = setInterval(()=>{
  const criteria_value = Date.now() - uiholder_aging_for_oldkey_value; //이거보다 이전에 update 된 것은 삭제
  const keys = Object.keys(uiHolder_map);
  keys.forEach((key) => {
    const value = uiHolder_map[key];
    if(value.last_update_time < criteria_value)
    {
      delete uiHolder_map[key]; //삭제~
    }
  })
}, 60*1000); //급한건 아니니 1분마다 확인하자