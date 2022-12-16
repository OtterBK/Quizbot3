const { ActionRowBuilder, ButtonBuilder, ButtonStyle, Events, StringSelectMenuBuilder } = require('discord.js');
const { interaction } = require('lodash');
const cloneDeep = require("lodash/cloneDeep.js")

//로컬 modules
const text_contents = require('./text_contents.json')["kor"];

/** 사전 정의 UI들 */

const select_btn_row = new ActionRowBuilder()
.addComponents(
  new ButtonBuilder()
    .setCustomId('1')
    // .setLabel('1️⃣')
    .setLabel('1')
    .setStyle(ButtonStyle.Primary),
  new ButtonBuilder()
    .setCustomId('2')
    // .setLabel('2️⃣')
    .setLabel('2')
    .setStyle(ButtonStyle.Primary),
  new ButtonBuilder()
    .setCustomId('3')
    // .setLabel('3️⃣')
    .setLabel('3')
    .setStyle(ButtonStyle.Primary),
  new ButtonBuilder()
    .setCustomId('4')
    // .setLabel('4️⃣')
    .setLabel('4')
    .setStyle(ButtonStyle.Primary),
  new ButtonBuilder()
    .setCustomId('5')
    // .setLabel('5️⃣')
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

//main embed 인스턴스 반환
exports.createUIHolder = (interaction) => {

    return new UIHolder(interaction);

};

class UIHolder {

  constructor(interaction)
  {
    this.base_interaction = interaction;
    this.guild = interaction.guild;
    this.guildID = interaction.guild.id;
    this.ui = new MainUI();
    this.components = [cloneDeep(select_btn_row), cloneDeep(control_btn_row)];

    this.prev_ui = undefined;

    this.base_interaction.reply( {embeds: [this.getUIEmbed()], components: this.getComponents()} );
  }

  getUI()
  {
    return this.ui;
  }

  getUIEmbed()
  {
    return this.ui.embed;
  }

  getComponents()
  {
    return this.components;
  }

  on(event_name, event_object)
  {
    let newUI = this.ui.on(event_name, event_object); //UI가 새로 변경됐다면 업데이트 진행
    if(newUI != undefined && this.ui != newUI)
    {
      this.prev_ui = this.ui;
      this.ui = newUI;
      this.updateUI();
    }
  }

  updateUI()
  {
    this.base_interaction.editReply( {embeds: [this.getUIEmbed()], components: this.getComponents()} );
  }

}

class MainUI {

  constructor()
  {
    this.embed = {
      color: 0x87CEEB,
      title: text_contents.main_menu.title,
      url: text_contents.main_menu.url,
      author: {
      //   name: '📗 메인메뉴',
      //   icon_url: 'https://i.imgur.com/AfFp7pu.png',
      //   url: 'https://user-images.githubusercontent.com/28488288/106536426-c48d4300-653b-11eb-97ee-445ba6bced9b.jpg',
      },
      description: text_contents.main_menu.description,
      thumbnail: {
        url: 'https://user-images.githubusercontent.com/28488288/106536426-c48d4300-653b-11eb-97ee-445ba6bced9b.jpg',
      },
      fields: [
        // {
        //   name: 'Regular field title',
        //   value: 'Some value here',
        // },
        {
          name: '\u200b',
          value: '\u200b',
          inline: false,
        },
        {
          name: text_contents.main_menu.total_server,
          value: '💻 30',
          inline: true,
        },
        {
          name: text_contents.main_menu.playing_server,
          value: '🕹 10',
          inline: true,
        },
        {
          name: text_contents.main_menu.competitive_server,
          value: '🌎 20',
          inline: true,
        },
      ],
      image: {
        url: '',
      },
      // timestamp: new Date().toISOString(),
      footer: {
        text: '제육보끔#1916',
        icon_url: 'https://user-images.githubusercontent.com/28488288/208116143-24828069-91e7-4a67-ac69-3bf50a8e1a02.png',
      },
    };
  }

  on(event_name, event_object)
  {
    let newUI = undefined;

    switch(event_name)
    {
      case "interactionCreate":
        newUI = this.interactionCreate(event_object); break;
      
    }

    return newUI;
  }

  interactionCreate(interaction)
  {
    if(!interaction.isButton()) return;

    if(interaction.customId == '1') //로컬플레이 눌렀을 때
    {
      return new SelectQuizTypeUI();
    }
  }

}

class SelectQuizTypeUI {

  constructor()
  {
    this.embed = {
      color: 0x87CEEB,
      title: text_contents.select_quiz_type.title,
      url: text_contents.select_quiz_type.url,
      description: text_contents.select_quiz_type.description,
      thumbnail: {
        url: text_contents.select_quiz_type.thumbnail.url,
      },
    };
  }
}

class LocalPlayUI {

  constructor()
  {
    this.embed = {
      color: 0x87CEEB,
      title: text_contents.main_menu.title,
      url: text_contents.main_menu.url,
      author: {
      //   name: '📗 메인메뉴',
      //   icon_url: 'https://i.imgur.com/AfFp7pu.png',
      //   url: 'https://user-images.githubusercontent.com/28488288/106536426-c48d4300-653b-11eb-97ee-445ba6bced9b.jpg',
      },
      description: text_contents.main_menu.description,
      thumbnail: {
        url: 'https://user-images.githubusercontent.com/28488288/106536426-c48d4300-653b-11eb-97ee-445ba6bced9b.jpg',
      },
      fields: [
        // {
        //   name: 'Regular field title',
        //   value: 'Some value here',
        // },
        {
          name: '\u200b',
          value: '\u200b',
          inline: false,
        },
        {
          name: text_contents.main_menu.total_server,
          value: '💻 30',
          inline: true,
        },
        {
          name: text_contents.main_menu.playing_server,
          value: '🕹 10',
          inline: true,
        },
        {
          name: text_contents.main_menu.competitive_server,
          value: '🌎 20',
          inline: true,
        },
      ],
      image: {
        url: '',
      },
      // timestamp: new Date().toISOString(),
      footer: {
        text: '제육보끔#1916',
        icon_url: 'https://user-images.githubusercontent.com/28488288/208116143-24828069-91e7-4a67-ac69-3bf50a8e1a02.png',
      },
    };
  }

}