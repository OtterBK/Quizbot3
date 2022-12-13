const { ActionRowBuilder, ButtonBuilder, ButtonStyle, Events, StringSelectMenuBuilder } = require('discord.js');
const cloneDeep = require("lodash/cloneDeep.js")

/** 사전 정의 UI들 */

const select_btn_row = new ActionRowBuilder()
.addComponents(
  new ButtonBuilder()
    .setCustomId('1')
    .setLabel('1')
    .setStyle(ButtonStyle.Primary),
  new ButtonBuilder()
    .setCustomId('2')
    .setLabel('2')
    .setStyle(ButtonStyle.Primary),
  new ButtonBuilder()
    .setCustomId('3')
    .setLabel('3')
    .setStyle(ButtonStyle.Primary),
  new ButtonBuilder()
    .setCustomId('4')
    .setLabel('4')
    .setStyle(ButtonStyle.Primary),
  new ButtonBuilder()
    .setCustomId('5')
    .setLabel('5')
    .setStyle(ButtonStyle.Primary),
)

const control_btn_row = new ActionRowBuilder()
.addComponents(
  new ButtonBuilder()
  .setCustomId('prev')
  .setLabel('◀')
  .setStyle(ButtonStyle.Secondary),
  new ButtonBuilder()
    .setCustomId('reserve1')
    .setLabel('　')
    .setStyle(ButtonStyle.Secondary),
  new ButtonBuilder()
    .setCustomId('back')
    .setLabel('↩')
    .setStyle(ButtonStyle.Secondary),
  new ButtonBuilder()
    .setCustomId('reserve2')
    .setLabel('　')
    .setStyle(ButtonStyle.Secondary),
  new ButtonBuilder()
    .setCustomId('next')
    .setLabel('▶')
    .setStyle(ButtonStyle.Secondary),
)

const main_embed = {
    color: 0x87CEEB,
    title: '🔔 퀴즈봇 [3]',
    url: 'https://github.com/OtterBK/Quizbot3',
    author: {
    //   name: '📗 메인메뉴',
    //   icon_url: 'https://i.imgur.com/AfFp7pu.png',
    //   url: 'https://user-images.githubusercontent.com/28488288/106536426-c48d4300-653b-11eb-97ee-445ba6bced9b.jpg',
    },
    description: 'Some description here',
    thumbnail: {
    //   url: 'https://user-images.githubusercontent.com/28488288/106536426-c48d4300-653b-11eb-97ee-445ba6bced9b.jpg',
    },
    fields: [
      {
        name: 'Regular field title',
        value: 'Some value here',
      },
      {
        name: '\u200b',
        value: '\u200b',
        inline: false,
      },
      {
        name: 'Inline field title',
        value: 'Some value here',
        inline: true,
      },
      {
        name: 'Inline field title',
        value: 'Some value here',
        inline: true,
      },
      {
        name: 'Inline field title',
        value: 'Some value here',
        inline: true,
      },
    ],
    image: {
      url: 'https://user-images.githubusercontent.com/28488288/106536426-c48d4300-653b-11eb-97ee-445ba6bced9b.jpg',
    },
    // timestamp: new Date().toISOString(),
    footer: {
      text: 'Some footer text here',
      icon_url: 'https://i.imgur.com/AfFp7pu.png',
    },
  };


exports.createMainUI = () => {

    return cloneDeep(main_embed);

};

exports.createControlRows = () => {

    return [cloneDeep(select_btn_row), cloneDeep(control_btn_row)];

}