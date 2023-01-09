'use strict';

//#region 필요한 외부 모듈
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, Events, StringSelectMenuBuilder } = require('discord.js');
const { interaction } = require('lodash');
const cloneDeep = require("lodash/cloneDeep.js");
const fs = require('fs');
//#endregion

//#region 로컬 modules
const { SYSTEM_CONFIG, CUSTOM_EVENT_TYPE, QUIZ_MAKER_TYPE } = require('./system_setting.js');
const option_system = require("./quiz_option.js");
const OPTION_TYPE = option_system.OPTION_TYPE;
const text_contents = require('./text_contents.json')[SYSTEM_CONFIG.language]; 
const quiz_system = require('./quiz_system.js'); //퀴즈봇 메인 시스템
const utility = require('./utility.js');
//#endregion

//#region 사전 정의 UI들
/** 사전 정의 UI들 */
//ButtonStyle 바꿀 수도 있으니깐 개별로 넣어놓자
const select_btn_component = new ActionRowBuilder()
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

const control_btn_component = new ActionRowBuilder()
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
);

const option_control_btn_component = new ActionRowBuilder()
.addComponents(
  new ButtonBuilder()
  .setCustomId('prev')
  .setLabel('저장')
  .setStyle(ButtonStyle.Success),
  new ButtonBuilder()
    .setCustomId('back')
    .setLabel('뒤로가기')
    .setStyle(ButtonStyle.Danger),
);

const option_component = new ActionRowBuilder()
.addComponents(
  new StringSelectMenuBuilder()
    .setCustomId('option_select')
    .setPlaceholder(`${text_contents.server_setting_ui.select_menu.title}`)
    .addOptions(

      text_contents.server_setting_ui.select_menu.options.map(option_info => {
        return { label: option_info.label, description: option_info.description, value: option_info.value };
      })

    ),
)

const option_value_components = {

  audio_play_time:  createOptionValueComponents('audio_play_time'),
  hint_type:  createOptionValueComponents('hint_type'),
  skip_type:  createOptionValueComponents('skip_type'),
  answer_use_similar:  createOptionValueComponents('answer_use_similar'),
  score_type:  createOptionValueComponents('score_type'),
  
}

function createOptionValueComponents(option_name)
{
  return new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('option_value_select')
        .setPlaceholder(`${text_contents.server_setting_ui.select_menu.option_values.title}`)
        .addOptions(
    
          text_contents.server_setting_ui.select_menu.option_values[option_name].map(option_value_info => {
            return { label: option_value_info.label, description: option_value_info.description, value: option_value_info.value };
          })
    
        ),
    );
}

//#endregion

/** global 변수 **/
let uiHolder_map = {}; //UI holdermap은 그냥 quizbot-ui 에서 가지고 있게 하자
let guilds_count = 0; //봇이 참가 중인 guilds 수

//#region exports 정의
/** exports **/
//main embed 인스턴스 반환
exports.createUIHolder = (interaction) => {
  const uiHolder = new UIHolder(interaction);
  uiHolder_map[interaction.guild.id] = uiHolder;

  return uiHolder;
};

exports.getUIHolder = (guild_id) => {
  if(uiHolder_map.hasOwnProperty(guild_id) == false)
  {
    return undefined;
  }

  return uiHolder_map[guild_id];
}

exports.startUIHolderAgingManager = () => 
{
  return uiHolderAgingManager();
}

exports.startGuildsCountManager = (client) => 
{
  return guildsCountManager(client);
}

//#endregion

//#region UI 관리 함수들
/** UI 관련 함수들 **/
//UI holder Aging Manager
function uiHolderAgingManager()
{
  const uiholder_aging_for_oldkey_value = SYSTEM_CONFIG.ui_holder_aging_manager_criteria * 1000; //last updated time이 일정 값 이전인 ui는 삭제할거임
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
  }, SYSTEM_CONFIG.ui_holder_aging_manager_interval * 1000); //체크 주기

  return uiholder_aging_manager;
}

function guildsCountManager(client) //현재 봇이 참가 중인 guild 수
{
  const guilds_count_manager_interval = SYSTEM_CONFIG.guilds_count_manager_interval * 1000; //체크 주기

  guilds_count = client.guilds.cache.size; //처음에 한번 체크

  const guilds_count_manager = setInterval(()=>{
    guilds_count = client.guilds.cache.size;
  }, guilds_count_manager_interval);

  return guilds_count_manager;
}

//#endregion

/** UI 프레임 관련 **/
// UI들 표시해주는 홀더
class UIHolder 
{

  constructor(interaction)
  {
    this.base_interaction = interaction;
    this.guild = interaction.guild;
    this.guild_id = interaction.guild.id;
    this.ui = new MainUI();

    this.initialized = false;
    this.prev_ui_stack = []; //뒤로가기용 UI스택

    this.last_update_time = Date.now(); //uiholder aging manager에서 삭제 기준이될 값
    this.updateUI();
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

    if(event_name == CUSTOM_EVENT_TYPE.interactionCreate)
    {
      let interaction = event_object;
      if(interaction.isButton() && interaction.customId == "back" && this.prev_ui_stack.length > 0) //뒤로가기 버튼 처리
      {
        this.ui = this.prev_ui_stack.pop();
        if(this.ui.onRefresh != undefined) this.ui.onRefresh();
        this.updateUI();
        return;
      }
    }

    let newUI = this.ui.on(event_name, event_object); //UI가 새로 변경됐다면 업데이트 진행
    if(newUI != undefined)
    {
      if(this.ui != newUI) //ui stack 에 쌓는 것은 새 UI 인스턴스가 생성됐을 때만
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
    this.last_update_time = Date.now();

    if(this.initialized == false)
    {
      this.initialized = true;
      this.base_interaction.reply( {embeds: [this.getUIEmbed()], components: this.getUIComponents()})
      .catch((err) => {
        console.log(`UpdateUI failed: ${err.message}`);
      });
    }
    else
    {
      this.base_interaction.editReply( {embeds: [this.getUIEmbed()], components: this.getUIComponents()})
      .catch((err) => {
        console.log(`UpdateUI failed: ${err.message}`);
      });
    }
  }

  //UI가 Refresh 됐을 때(뒤로가기 등)
  onRefresh()
  {
    //보통은 아무것도 하지 않는다.
  }

}

//QuizBotUI 
class QuizbotUI {

  constructor()
  {
    this.embed = {};
    // this.components = [cloneDeep(select_btn_component), cloneDeep(control_btn_component)]; //내가 clonedeep을 왜 해줬었지?
    this.components = [select_btn_component, control_btn_component]; //이게 기본 component임
  }

  //각 ui 별 on은 필요시 구현
  on(event_name, event_object)
  {
    switch(event_name) 
    {
      case CUSTOM_EVENT_TYPE.interactionCreate:
        return this.onInteractionCreate(event_object);
    }
  }

  onInteractionCreate() //더미용 이벤트 콜백
  {

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
          value: `${text_contents.icon.ICON_GUILD} ${guilds_count}`, //TODO 플레이어 수 제대로 표시할 것
          inline: true,
        },
        {
          name: text_contents.main_menu.playing_server,
          value: `${text_contents.icon.ICON_LOCALPLAY} ${quiz_system.getLocalQuizSessionCount()}`,
          inline: true,
        },
        {
          name: text_contents.main_menu.competitive_server,
          value: `${text_contents.icon.ICON_MULTIPLAY} ${quiz_system.getMultiplayQuizSessionCount()}`,
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

    this.components = [select_btn_component]; //MAIN UI에서는 control component는 필요없다.
  }

  onInteractionCreate(interaction)
  {
    if(!interaction.isButton()) return;

    if(interaction.customId == '1') //로컬플레이 눌렀을 때
    {
      return new SelectQuizTypeUI();
    }

    if(interaction.customId == '4') //서버 설정 눌렀을 때
    {
      return new ServerSettingUI(interaction.guild.id);
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

  static resource_path = SYSTEM_CONFIG.dev_quiz_path;
  static quiz_contents = utility.loadLocalDirectoryQuiz(DevQuizSelectUI.resource_path); //동적 로드할 필요는 딱히 없을듯..? 초기 로드 시, 정적으로 로드하자

  constructor(contents)
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

    this.cur_contents = (contents == undefined ? DevQuizSelectUI.quiz_contents : contents);

    this.count_per_page = 5; //페이지별 표시할 컨텐츠 수
    this.cur_page = 0;
    this.total_page = 0;
    this.displayContents(this.cur_page);

  }

  displayContents(page_num)
  {
    const contents = this.cur_contents;

    const total_page = parseInt(contents.length / this.count_per_page) + (contents.length % this.count_per_page != 0 ? 1 : 0);
    this.total_page = total_page; //나중에 쓸거라 저장

    let page_contents = [];
    let from = this.count_per_page * page_num;
    let to = (this.count_per_page * page_num) + this.count_per_page;
    if(to >=  contents.length) 
      to = contents.length - 1;

    for(let i = from; i < to; i++)
    {
      page_contents.push(this.cur_contents[i]);
    }

    let contents_message = text_contents.dev_select_category.description;
    for(let i = 0; i < page_contents.length; i++)
    {
      const cur_content = page_contents[i];
      let message = text_contents.icon["ICON_NUM_"+(i+1)];
      contents_message += `${message}${")\u1CBC\u1CBC"}${cur_content.icon} ${cur_content.name}\n\n`;
    }

    // contents_message += "\u1CBC\u1CBC\n" + `${text_contents.icon.ICON_BOX} ${contents.length}` //굳이 항목 수를 표시해야할까..?
    this.embed.description = contents_message + "\u1CBC\n";

    let page_message = `${text_contents.icon.ICON_PAGE} ${page_num + 1} / ${total_page}`;
    // page_message += `| ${text_contents.icon.ICON_FOLDER} ${page_num + 1}`;
    this.embed.footer = { 
      text: page_message,
    };
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
      if(this.cur_page >= this.total_page - 1) return;

      this.cur_page += 1;
      this.displayContents(this.cur_page);
      return this;
    }

    const select_num = parseInt(interaction.customId);
    if(select_num == NaN || select_num < 0 || select_num > 9) return; //1~9번 사이 눌렀을 경우만

    // 그냥 페이지 계산해서 content 가져오자
    const index = (this.count_per_page * this.cur_page) + select_num - 1; //실제로 1번을 선택했으면 0번 인덱스를 뜻함

    if(index >= this.cur_contents.length)
    {
      console.log(`${index} is not in this.cur_contents`);
    }

    const content = this.cur_contents[index];
    if(content['is_quiz'] == true) //퀴즈 content 를 선택했을 경우
    {
      //어차피 여기서 만드는 quiz info 는 내가 하드코딩해도 되네
      let quiz_info = {};
      quiz_info['title']  = content['name'];
      quiz_info['icon'] = content['icon'];

      quiz_info['type_name'] = content['type_name']; 
      quiz_info['description'] = content['description']; 

      quiz_info['author'] = '제육보끔#1916';
      quiz_info['author_icon'] = 'https://user-images.githubusercontent.com/28488288/208116143-24828069-91e7-4a67-ac69-3bf50a8e1a02.png';
      quiz_info['thumbnail'] = 'https://user-images.githubusercontent.com/28488288/106536426-c48d4300-653b-11eb-97ee-445ba6bced9b.jpg'; //썸네일은 그냥 quizbot으로 해두자

      quiz_info['quiz_size'] = content['quiz_size']; 
      quiz_info['repeat_count'] = content['repeat_count']; 
      quiz_info['winner_nickname'] = content['winner_nickname'];
      quiz_info['quiz_path'] = content['content_path'];//dev quiz는 quiz_path 필요
      quiz_info['quiz_type'] = content['quiz_type'];
      quiz_info['quiz_maker_type'] = QUIZ_MAKER_TYPE.BY_DEVELOPER;

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
      title: `${quiz_info['icon']}${quiz_info['title']}`,
      description: '',
      thumbnail: { //퀴즈 섬네일 표시
        url: quiz_info['thumbnail'] ?? '',
      },
      footer: { //퀴즈 제작자 표시
        text: quiz_info['author'] ?? '',
        icon_url: quiz_info['author_icon'] ?? '',
      },
    };

    let description = text_contents.quiz_info_ui.description;
    description = description.replace('${quiz_type_name}', `${quiz_info['type_name']}`);
    description = description.replace('${quiz_size}', `${quiz_info['quiz_size']}`);
    description = description.replace('${quiz_description}', `${quiz_info['description']}`);

    this.embed.description = description;

    const quiz_info_comp = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
      .setCustomId('start')
      .setLabel('시작')
      .setStyle(ButtonStyle.Success),
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
      const channel = interaction.channel;
      const quiz_info = this.quiz_info;

      const check_ready = quiz_system.checkReadyForStartQuiz(guild, owner); //퀴즈를 플레이할 준비가 됐는지(음성 채널 참가 확인 등)
      if(check_ready == undefined || check_ready.result == false)
      {
        const reason = check_ready.reason;
        let reason_message = text_contents.quiz_info_ui.failed_start;
        reason_message = reason_message.replace("${reason}", reason);
        interaction.channel.send({content: reason_message});
        return;
      }

      if(check_ready['result'] == false)
      {
        //check_ready['reason'] 떄문에 준비안됐다는 메시지
        return;
      }
      
      quiz_system.startQuiz(guild, owner, channel, quiz_info); //퀴즈 시작

      return new AlertQuizStartUI(quiz_info, owner); //명시적으로 -1 넘겨서 uiholder 종료
    }

    if(interaction.customId == 'scoreboard') //순위표 버튼 눌렀을 떄
    {
      
    }

    if(interaction.customId == 'settings') //설정 버튼 눌렀을 떄
    {
      
    }
  }
}

//Quiz 시작 알림 UI
class AlertQuizStartUI extends QuizbotUI
{

  constructor(quiz_info, owner)
  {
    super();

    this.embed = {
      color: 0x87CEEB,
      title: text_contents.alert_quiz_start_ui.title,
      description: '',
      thumbnail: { //퀴즈 섬네일 표시
        url: '',
      },
      timestamp: new Date().toISOString(),
    };

    let description = text_contents.alert_quiz_start_ui.description;
    description = description.replace('${quiz_name}', `${quiz_info['title']}`);
    description = description.replace('${quiz_size}', `${quiz_info['quiz_size']}`);
    description = description.replace('${quiz_owner}', `${owner.displayName}`);

    this.embed.description = description;

    this.components = []; //여기서는 component를 싹 없앤다
  }

  onInteractionCreate(interaction)
  {
    return; //AlertQuizStartUI 에서는 이벤트 핸들링을 하지 않음
  }

}

//서버 설정 UI
class ServerSettingUI extends QuizbotUI {

  constructor(guild_id)
  {
    super();

    this.guild_id = guild_id;

    this.embed = {
      color: 0x87CEEB,
      title: text_contents.server_setting_ui.title,
      description: text_contents.server_setting_ui.pre_description,
    };

    this.option_storage = option_system.getOptionStorage(this.guild_id);
    this.option_data = this.option_storage.getOptionData();
    this.fillDescription(this.option_data);

    this.option_component = cloneDeep(option_component); //아예 deep copy해야함
    this.components = [ this.option_component, option_control_btn_component ];

    this.selected_option = undefined;
  }

  fillDescription(option_data)
  {
    let description_message = text_contents.server_setting_ui.description;
    description_message = description_message.replace("${audio_play_time}", parseInt(option_data.quiz.audio_play_time / 1000));
    description_message = description_message.replace("${hint_type}", option_data.quiz.hint_type);
    description_message = description_message.replace("${skip_type}", option_data.quiz.skip_type);
    description_message = description_message.replace("${answer_use_similar}", (option_data.quiz.answer_use_similar == true ? `${text_contents.server_setting_ui.use}` : `${text_contents.server_setting_ui.not_use}`));
    description_message = description_message.replace("${score_type}", option_data.quiz.score_type);
    description_message = description_message.replace("${score_show_max}", (option_data.quiz.score_show_max == -1 ? `${text_contents.server_setting_ui.score_infinity}` : option_data.quiz.score.show_max));
    this.embed.description = description_message;
  }

  onInteractionCreate(interaction)
  {
    if(!interaction.isStringSelectMenu()) return;

    if(interaction.customId == 'option_select') //옵션 선택 시,
    {
      const selected_option = interaction.values[0];
      this.selected_option = selected_option;

      this.selectDefaultOptionByValue(this.option_component, selected_option);

      this.option_value_component = option_value_components[this.selected_option]; //value 컴포넌트를 보내줌
      this.components = [ this.option_component, this.option_value_component, option_control_btn_component];

      return this;
    }
    else if(interaction.customId == 'option_value_select')
    {
      const selected_value = interaction.values[0];

      this.selectDefaultOptionByValue(this.option_value_component, selected_value);

      this.option_data.quiz[this.selected_option] = selected_value;
      this.fillDescription(this.option_data);

      return this;
    }

  }

  selectDefaultOptionByValue(component, value)
  {
    const options = component.components[0].options;
    for(let index = 0; index < options.length; ++index)
    {
      let option = options[index].data;
      if(option.value == value)
      {
        option['default'] = true;
      }
      else
      {
        option['default'] = false;
      }
    }

    return component;
  }

  onRefresh()
  {
    this.fillDescription(this.option_storage.getOptionData());
  }

}