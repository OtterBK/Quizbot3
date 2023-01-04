'use strict';

const { REST, Routes } = require('discord.js');
const {SlashCommandBuilder} = require("@discordjs/builders");

//명령어 목록
const commands = [
    new SlashCommandBuilder()
    .setName('퀴즈')
    .setDescription('퀴즈봇의 메인 메뉴를 표시합니다.')
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
        .then(() => console.log('Successfully registered application commands for ' + guildId))
        .catch(console.error);
}