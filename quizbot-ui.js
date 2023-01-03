// 필요한 외부 모듈
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, Events, StringSelectMenuBuilder } = require('discord.js');
const { interaction } = require('lodash');
const cloneDeep = require("lodash/cloneDeep.js");
const fs = require('fs');
const { FORMERR } = require('dns');

//로컬 modules
const text_contents = require('./text_contents.json')["kor"]; //한국어로 가져와서 사용
const quiz_machine = require('./quiz_system.js'); //퀴즈봇 메인 시스템
const GAME_TYPE = require('./game_type.json');


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


// UI들 표시해주는 홀더
class UIHolder 
{

  constructor(interaction)
  {
    this.base_interaction = interaction;
    this.guild = interaction.guild;
    this.guild_id = interaction.guild.id;
    this.ui = new MainUI();

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

  getUIComponents()
  {
    return this.ui.components;
  }

  //이벤트 처리
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
    if(newUI != undefined)
    {
      if(this.ui != newUI) //ui stack 에 쌓는 것은 새 UI가 생성됐을 때만
      {
        this.prev_ui_stack.push(this.ui);
        this.ui = newUI;
      }
      this.updateUI();
    }
  }

  //UI 재전송
  updateUI()
  {
    this.base_interaction.editReply( {embeds: [this.getUIEmbed()], components: this.getUIComponents()} );
  }

}

//QuizBotUI 인터페이스
class QuizbotUI {

  constructor()
  {
    this.embed = {

    }
    // this.components = [cloneDeep(select_btn_row), cloneDeep(control_btn_row)]; //내가 clonedeep을 왜 해줬지?
    this.components = [select_btn_row, control_btn_row]; //이게 기본 component임
  }

  //각 ui 별 on은 필수 구현 필요
  on(event_name, event_object)
  {
    let newUI = undefined;

    switch(event_name)
    {
      case "interactionCreate":
        newUI = this.onInteractionCreate(event_object); break;
      
    }

    return newUI;
  }
  
}

//메인메뉴
class MainUI extends QuizbotUI 
{

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
          value: '💻 30', //TODO 플레이어 수 제대로 표시할 것
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
      // footer: {
      //   text: '제육보끔#1916',
      //   icon_url: 'https://user-images.githubusercontent.com/28488288/208116143-24828069-91e7-4a67-ac69-3bf50a8e1a02.png',
      // },
    };
  }

  onInteractionCreate(interaction)
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

  onInteractionCreate(interaction)
  {
    if(!interaction.isButton()) return;

    if(interaction.customId == '1') //개발자 퀴즈 눌렀을 때
    {
      return new DevQuizSelectUI();
    }
  }

}

//개발자 퀴즈 선택 UI
class DevQuizSelectUI extends QuizbotUI  
{

  static resource_path = process.cwd() + "/resources/quizdata/";
  static quiz_contents = DevQuizSelectUI.loadLocalDirectoryQuiz(DevQuizSelectUI.resource_path); //동적 로드할 필요는 딱히 없을듯..?

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

    this.cur_contents = DevQuizSelectUI.quiz_contents;

    this.count_per_page = 5; //페이지별 표시할 컨텐츠 수
    this.cur_page = 0;
    this.total_page = 0;
    this.showPage(this.cur_page);

  }

  static loadLocalDirectoryQuiz(content_path) 
  {
    let file_list = fs.readdirSync(content_path);

    let quiz_contents = [];
    file_list.forEach(file => {

      let quiz_content = DevQuizSelectUI.parseContentInfoFromDirName(file);

      // 하위 컨텐츠 있으면 추가 파싱 진행
      const file_path = content_path + file;
      const file_path_dir = file_path + "/"
      quiz_content['content_path'] = file_path;

      const is_quiz = quiz_content['is_quiz'];

      if(is_quiz == false)
      {
        const stat = fs.lstatSync(file_path);
        if(!stat.isFile()) //폴더면 하위 디렉터리 읽어옴
        {
          quiz_content['sub_contents'] = DevQuizSelectUI.loadLocalDirectoryQuiz(file_path_dir);
        }
      }
      else
      {
        //퀴즈면 info.txt 읽어옴
        const content_path_dir = content_path + "/";
        const quiz_list = fs.readdirSync(content_path_dir);

        let quiz_size = 0;
        quiz_list.forEach(quiz_file => {

          if(quiz_file.includes("info.txt") == false)
          {
            quiz_size += 1;
            return;
          }

          //info.txt 파싱... 난 왜 이런 방식을 사용했던걸까..?
          const info_txt_path = content_path_dir + quiz_file;
          const info_data = fs.readFileSync(info_txt_path, 'utf8');

          let winner_nickname_tmp = info_data.split('&topNickname: ');
          if(winner_nickname_tmp.length > 1)
          {
            quiz_content['winner_nickname'] = winner_nickname_tmp[1].split("&");
          }

          let typeName_tmp = info_data.split('&topNickname: ');
          if(typeName_tmp.length > 1)
          {
            quiz_content['type_name'] = typeName_tmp[1].split("&");
          }

        });

        //아이콘으로 퀴즈 타입 가져오기... 예전에 자신을 원망하자
        const quiz_icon = quiz_content['icon'];

        if(quiz_icon == text_contents.icon.ICON_TYPE_SONG)
            quiz_content['game_type'] = GAME_TYPE.SONG
        else if(quiz_icon == text_contents.icon.ICON_TYPE_PICTURE)
            quiz_content['game_type'] = GAME_TYPE.PICTURE
        else if(quiz_icon == text_contents.icon.ICON_TYPE_PICTURE_LONG)
            quiz_content['game_type'] = GAME_TYPE.PICTURE_LONG
        else if(quiz_icon == text_contents.icon.ICON_TYPE_OX)
            quiz_content['game_type'] = GAME_TYPE.OX
        else if(quiz_icon == text_contents.icon.ICON_TYPE_INTRO)
            quiz_content['game_type'] = GAME_TYPE.INTRO
        else if(quiz_icon == text_contents.icon.ICON_TYPE_QNA)
            quiz_content['game_type'] = GAME_TYPE.QNA
        else if(quiz_icon == text_contents.icon.ICON_TYPE_SCRIPT)
            quiz_content['game_type'] = GAME_TYPE.SCRIPT
        else if(quiz_icon == text_contents.icon.ICON_TYPE_SELECT)
            quiz_content['game_type'] = GAME_TYPE.SELECT
        else if(quiz_icon == text_contents.icon.ICON_TYPE_MULTIPLAY)
            quiz_content['game_type'] = GAME_TYPE.MULTIPLAY
        else quiz_content['game_type'] = GAME_TYPE.SONG


        // 퀴즈 수
        quiz_content['quiz_size'] = quiz_size;

      }

      quiz_contents.push(quiz_content);

    })

    return quiz_contents;
  }

  static parseContentInfoFromDirName(file_name)
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

    const is_quiz = file_name.includes("&quiz") ? true : false;
    content['is_quiz'] = is_quiz;

    content['sub_contents'] = undefined;

    return content;
  }

  displayContents(page_num)
  {
    const contents = this.cur_contents;

    const total_page = parseInt(contents.length / this.count_per_page) + (contents.length % this.count_per_page != 0 ? 1 : 0);
    this.total_page = total_page; //나중에 쓸거라 저장

    let page_contents = [];
    for(let i = this.count_per_page * page_num; i < this.count_per_page; i++)
    {
      page_contents.push(this.cur_contents[i]);
    }

    let contents_message = text_contents.dev_select_category.description;
    for(let i = 0; i < contents.length; i++)
    {
      const cur_content = contents[i];
      let message = text_contents.icon["ICON_NUM_"+i];
      contents_message += message + ")\u1CBC\u1CBC" + cur_content.icon + " " + cur_content.name + "\n\n";
    }

    this.embed.description = contents_message;
  }

  onInteractionCreate(interaction)
  {
    if(!interaction.isButton()) return;

    if(interaction.customId == 'prev') //페이지 이동 시
    {
      if(this.cur_page <= 0) return;

      this.cur_page -= 1;
      this.displayContents(this.cur_page);
      return this;
    }
    
    if(interaction.customId == 'next')
    {
      if(this.cur_page >= this.total_page) return;

      this.cur_page += 1;
      this.displayContents(this.cur_page);
      return this;
    }

    const select_num = parseInt(interaction.customId);
    if(select_num == NaN || select_num < 0 || select_num > 9) return; //1~9번 사이 눌렀을 경우만

    // 그냥 페이지 계산해서 content 가져오자
    const index = this.count_per_page * this.cur_page + select_num;

    if(index >= this.cur_contents.length)
    {
      console.log(`${index} is not in this.cur_contents`);
    }

    const content = this.cur_contents[index];
    if(content['is_quiz'] == True)
    {
      //어차피 여기서 만드는 quiz info 는 내가 하드코딩해도 되네
      let quiz_info = {};
      quiz_info['title']  = content['name'];

      quiz_info['description'] = content['description']; //TODO description은 quizinfo.txt 에서 읽어오는걸로
      quiz_info['author'] = content['제육보끔#1916'];
      quiz_info['thumbnail'] = content['https://user-images.githubusercontent.com/28488288/106536426-c48d4300-653b-11eb-97ee-445ba6bced9b.jpg']; //썸네일은 그냥 quizbot으로 해두자

      quiz_info['quiz_size'] = content['quiz_size']; 

      quiz_info['winner_nickname'] = content['winner_nickname'];

      quiz_info['quiz_path'] = content['content_path'];//dev quiz는 path 필요
      quiz_info['quiz_type'] = content['content_path'];//얘만 quiz_path 필요
      return new QuizInfoUI(quiz_info);
    }

    if(content['sub_contents'] != undefined) //하위 디렉터리가 있다면
    {
      return new DevQuizSelectUI(content['sub_contents']);
    }
    
  }

}

//퀴즈 정보 표시 UI, Dev퀴즈/User퀴즈 둘 다 사용
class QuizInfoUI extends QuizbotUI
{
  constructor(quiz_info)
  {
    super();

    this.quiz_info = quiz_info;

    this.embed = {
      color: 0x87CEEB,
      title: quiz_info['title'],
      description: quiz_info['description'],
      thumbnail: { //퀴즈 섬네일 표시
        url: quiz_info['thumbnail'],
      },
      footer: { //퀴즈 제작자 표시
        text: quiz_info['author'],
        icon_url: 'https://user-images.githubusercontent.com/28488288/208116143-24828069-91e7-4a67-ac69-3bf50a8e1a02.png',
      },
    };

    const quiz_info_comp = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
      .setCustomId('start')
      .setLabel('시작')
      .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('scoreboard')
        .setLabel('순위표')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('settings')
        .setLabel('설정')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('back')
        .setLabel('뒤로가기')
        .setStyle(ButtonStyle.Secondary),
    )
    this.components = [quiz_info_comp]; //여기서는 component를 바꿔서 해주자
  }

  onInteractionCreate(interaction)
  {
    if(!interaction.isButton()) return;

    if(interaction.customId == 'start') //시작 버튼 눌렀을 떄
    {
      const guild = interaction.guild;
      const owner = interaction.member; //주최자
      return new QuizPlayUI(guild, owner, quiz_info);
    }

    if(interaction.customId == 'scoreboard') //순위표 버튼 눌렀을 떄
    {
      
    }

    if(interaction.customId == 'settings') //설정 버튼 눌렀을 떄
    {
      
    }
  }
}

//Quiz 플레이 UI
class QuizPlayUI extends QuizbotUI
{

  constructor(guild, owner, quiz_info)
  {
    super();

    this.quiz_info = quiz_info;
    this.guild = guild;
    this.owner = owner;

    this.embed = {
      color: 0x87CEEB,
      title: quiz_info['title'],
      description: quiz_info['description'],
      thumbnail: { //퀴즈 섬네일 표시
        url: quiz_info['thumbnail'],
      },
      footer: { //퀴즈 제작자 표시
        text: quiz_info['author'],
        icon_url: 'https://user-images.githubusercontent.com/28488288/208116143-24828069-91e7-4a67-ac69-3bf50a8e1a02.png',
      },
    };

    const quiz_info_comp = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
      .setCustomId('start')
      .setLabel('힌트')
      .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('scoreboard')
        .setLabel('스킵')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('settings')
        .setLabel('그만하기')
        .setStyle(ButtonStyle.Secondary),
    )
    this.components = [quiz_info_comp]; //여기서는 component를 바꿔서 해주자

    this.startQuiz();
  }

  onInteractionCreate(interaction)
  {
    if(!interaction.isButton()) return;

    if(interaction.customId == 'start') //시작 버튼 눌렀을 떄
    {
      return new QuizPlayUI(quiz_info);
    }

    if(interaction.customId == 'scoreboard') //순위표 버튼 눌렀을 떄
    {
      
    }

    if(interaction.customId == 'settings') //설정 버튼 눌렀을 떄
    {
      
    }
  }

  startQuiz()
  {
    quiz_machine.startQuiz(this.guild, this.quiz_info, this);
  }

}