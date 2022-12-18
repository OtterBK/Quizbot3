const { ActionRowBuilder, ButtonBuilder, ButtonStyle, Events, StringSelectMenuBuilder } = require('discord.js');
const { interaction } = require('lodash');
const cloneDeep = require("lodash/cloneDeep.js");
const fs = require('fs');

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
  .setLabel('이전 페이지')
  .setStyle(ButtonStyle.Secondary),
  new ButtonBuilder()
    .setCustomId('back')
    .setLabel('뒤로가기')
    .setStyle(ButtonStyle.Secondary),
  new ButtonBuilder()
    .setCustomId('next')
    .setLabel('다음 페이지')
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

    this.prev_ui_stack = [];

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

    if(event_name == "interactionCreate")
    {
      let interaction = event_object;
      if(interaction.isButton() && interaction.customId == "back" && this.prev_ui_stack.length > 0) //뒤로가기 버튼 처리
      {
        this.ui = this.prev_ui_stack.pop();
        this.updateUI();
        return;
      }
    }

    let newUI = this.ui.on(event_name, event_object); //UI가 새로 변경됐다면 업데이트 진행
    if(newUI != undefined && this.ui != newUI)
    {
      this.prev_ui_stack.push(this.ui);
      this.ui = newUI;
      this.updateUI();
    }
  }

  updateUI()
  {
    this.base_interaction.editReply( {embeds: [this.getUIEmbed()], components: this.getComponents()} );
  }

}

class QuizbotUI {

  //각 ui 별 on은 필수 구현 필요
  on(event_name, event_object)
  {

  }
  
}

//메인메뉴
class MainUI extends QuizbotUI {

  constructor()
  {
    super();

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

//퀴즈 유형(개발자/유저) 선택 UI
class SelectQuizTypeUI extends QuizbotUI {

  constructor()
  {
    super();

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

    if(interaction.customId == '1') //개발자 퀴즈 눌렀을 때
    {
      return new DeveloperQuizSelectCategoryUI();
    }
  }

}

//개발자 퀴즈 선택 UI
class DeveloperQuizSelectCategoryUI extends QuizbotUI  {

  constructor()
  {
    super();

    this.embed = {
      color: 0x87CEEB,
      title: text_contents.dev_select_category.title,
      url: text_contents.dev_select_category.url,
      description: text_contents.dev_select_category.description,
      thumbnail: {
        url: text_contents.dev_select_category.thumbnail.url,
      },

    };

    this.current_path = process.cwd() + "/resources/quizdata/"; //현재 경로+/resources

    this.current_contents = [];
    this.loadLocalDirectoryQuiz();

    this.displayContents(0);
  }

  loadLocalDirectoryQuiz() 
  {
    fs.readdir(this.current_path, (error, file_list) => {
      file_list.forEach(file => {
        let quiz_content = this.parseContentInfoFromDirName(file);
        this.current_contents.push(quiz_content);
      });

      console.log(this.current_contents);
    });
  }

  parseContentInfoFromDirName(file_name)
  {
    let content = {};

    content['name'] = file_name.split("&")[0];

    let icon = file_name.split("icon="); //ICON 만 파싱
    if(icon.length > 1) //icon= 이 있다면
      content['icon'] = icon[1].split("&")[0];
    else 
    {
      content['icon'] = text_contents.icon.ICON_QUIZ_DEFAULT;
    }

    content['is_quiz'] = file_name.includes("&quiz") ? true : false;

    return content;
  }

  displayContents(page_num)
  {


    
  }

}