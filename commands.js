'use strict';

const { REST, Routes } = require('discord.js');
const {SlashCommandBuilder} = require("@discordjs/builders");
const logger = require('./logger.js')('Commands');

//명령어 목록
const commands = [
    new SlashCommandBuilder()
    .setName('퀴즈')
    .setDescription('퀴즈봇의 명령어입니다.')
    .addSubcommand(subcommand =>
		subcommand
			.setName('시작')
			.setDescription('퀴즈를 선택하고 시작합니다')
    )
    .addSubcommand(subcommand =>
		subcommand
			.setName('만들기')
			.setDescription('새로운 퀴즈를 만듭니다.')
    ),
    // .addChannelOption(option => 
    //     option
    //     .setName("보이스채널")
    //     .setDescription("봇을 부를 채널")
    //     .setRequired(true)
    //     .addChannelTypes(ChannelType.GuildVoice)
    // ),

    new SlashCommandBuilder()
    .setName('quiz')
    .setDescription('Quizbot\'s commands')
    .addSubcommand(subcommand =>
		subcommand
			.setName('start')
			.setDescription('Select a quiz and start.')
    )
    .addSubcommand(subcommand =>
		subcommand
			.setName('create')
			.setDescription('make a quiz.')
    ),

    new SlashCommandBuilder()
    .setName('답')
    .setDescription('현재 제시된 퀴즈의 정답을 제출합니다.')
    .addStringOption(option =>
        option
        .setName("답안")
        .setDescription('제출할 답')
    ),
    // .addChannelOption(option => 
    //     option
    //     .setName("보이스채널")
    //     .setDescription("봇을 부를 채널")
    //     .setRequired(true)
    //     .addChannelTypes(ChannelType.GuildVoice)
    // ),
];

//길드에 명령어 등록용
exports.registerCommands = async (token, clientId, guildId) => {
    const rest = new REST({version: '10'}).setToken(token);

    rest.put(Routes.applicationGuildCommands(clientId, guildId), {body: commands})
        .then(() => logger.info('Successfully registered application commands for ' + guildId))
        .catch(err => logger.error(err));
}

exports.registerGlobalCommands = async (token, clientId) => {
    const rest = new REST({version: '10'}).setToken(token);

    rest.put(Routes.applicationCommands(clientId), {body: commands})
        .then(() => logger.info('Successfully registered global application commands'))
        .catch(err => logger.error(err));
}