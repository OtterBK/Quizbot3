'use strict';

const { REST, Routes } = require('discord.js');
const {SlashCommandBuilder} = require("@discordjs/builders");
const logger = require('../../utility/logger.js')('Commands');

//명령어 목록
const commands = [
  new SlashCommandBuilder()
    .setName('퀴즈')
    .setDescription('퀴즈봇의 메인 메뉴를 표시합니다.'),
  // .addChannelOption(option => 
  //     option
  //     .setName("보이스채널")
  //     .setDescription("봇을 부를 채널")
  //     .setRequired(true)
  //     .addChannelTypes(ChannelType.GuildVoice)
  // ),

  new SlashCommandBuilder()
    .setName('퀴즈만들기')
    .setDescription('직접 퀴즈를 만들 수 있는 퀴즈툴을 요청합니다.'),

  new SlashCommandBuilder()
    .setName('quiz')
    .setDescription('Quizbot\'s commands'),

  new SlashCommandBuilder()
    .setName('답')
    .setDescription('현재 제시된 퀴즈의 정답을 제출합니다.')
    .addStringOption(option =>
      option
        .setName("답안")
        .setDescription('제출할 답')
    ),

  new SlashCommandBuilder()
    .setName('퀴즈정리')
    .setDescription('현재 서버에서 진행 중인 모든 세션을 정리합니다.'),

  new SlashCommandBuilder()
    .setName('챗')
    .setDescription('멀티플레이 퀴즈에서 전체 메시지를 전송합니다.')
    .addStringOption(option =>
      option
        .setName("메시지")
        .setDescription('전송할 메시지')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('채팅전환')
    .setDescription('전체 채팅 기능을 켜거나 끕니다.'),
];

//길드에 명령어 등록용
exports.registerCommands = async (token, clientId, guildId) => 
{
  const rest = new REST({version: '10'}).setToken(token);

  rest.put(Routes.applicationGuildCommands(clientId, guildId), {body: commands})
    .then(() => logger.info('Successfully registered application commands for ' + guildId))
    .catch(err => logger.error(err));
};

exports.registerGlobalCommands = async (token, clientId) => 
{
  const rest = new REST({version: '10'}).setToken(token);

  rest.put(Routes.applicationCommands(clientId), {body: commands})
    .then(() => logger.info('Successfully registered global application commands'))
    .catch(err => logger.error(err));
};