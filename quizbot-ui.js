'use strict';

//#region 필요한 외부 모듈
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, Events, StringSelectMenuBuilder, RESTJSONErrorCodes, SelectMenuOptionBuilder  } = require('discord.js');
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
const logger = require('./logger.js')('QuizUI');
const { sync_objects } = require('./ipc_manager.js');
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

const page_select_menu = new StringSelectMenuBuilder().
setCustomId('page_jump').
setPlaceholder('페이지 이동');

const page_select_row = new ActionRowBuilder()
.addComponents(
  
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

const main_ui_component = new ActionRowBuilder()
.addComponents(
  new ButtonBuilder()
  .setLabel('개인 정보 보호 정책')
  .setURL('http://quizbot.kro.kr')
  .setStyle(ButtonStyle.Link),
  new ButtonBuilder()
  .setLabel('퀴즈봇 커뮤니티')
  .setURL('https://discord.gg/Baw6ZP6rcZ')
  .setStyle(ButtonStyle.Link),
  new ButtonBuilder()
  .setLabel('봇 공유하기')
  .setURL('https://discord.com/api/oauth2/authorize?client_id=788060831660114012&permissions=2150681600&scope=bot')
  .setStyle(ButtonStyle.Link),
);

const option_control_btn_component = new ActionRowBuilder()
.addComponents(
  new ButtonBuilder()
  .setCustomId('save_option_data')
  .setLabel('저장')
  .setDisabled(true)
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
  use_similar_answer:  createOptionValueComponents('use_similar_answer'),
  score_type:  createOptionValueComponents('score_type'),
  improved_audio_cut:  createOptionValueComponents('improved_audio_cut'),
  use_message_intent:  createOptionValueComponents('use_message_intent'),
  
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

const note_ui_component = new ActionRowBuilder()
.addComponents(
  new ButtonBuilder()
  .setCustomId('notice')
  .setLabel('공지사항')
  .setStyle(ButtonStyle.Primary),
  new ButtonBuilder()
  .setCustomId('patch_note')
  .setLabel('패치노트')
  .setStyle(ButtonStyle.Secondary),
);

const only_back_comp = new ActionRowBuilder()
.addComponents(
  new ButtonBuilder()
    .setCustomId('back')
    .setLabel('뒤로가기')
    .setStyle(ButtonStyle.Secondary),
)

//#endregion

/** global 변수 **/
let uiHolder_map = {}; //UI holdermap은 그냥 quizbot-ui 에서 가지고 있게 하자
let bot_client = undefined;

//#region exports 정의
/** exports **/
//main embed 인스턴스 반환
exports.initialize = (client) => {
  if(client == undefined)
  {
      logger.error(`Failed to Initialize Quiz system. ${'Client is undefined'}`);
      return false;
  }
  bot_client = client;

  return true;
}

exports.createUIHolder = (interaction) => {
  const guild_id = interaction.guild.id;
  if(uiHolder_map.hasOwnProperty(guild_id))
  {
    const prev_uiHolder = uiHolder_map[guild_id];
    prev_uiHolder.free();
  }
  const uiHolder = new UIHolder(interaction);
  uiHolder_map[guild_id] = uiHolder;

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

//#endregion

//#region UI 관리 함수들
/** UI 관련 함수들 **/
//UI holder Aging Manager
function uiHolderAgingManager()
{
  const uiholder_aging_for_oldkey_value = SYSTEM_CONFIG.ui_holder_aging_manager_criteria * 1000; //last updated time이 일정 값 이전인 ui는 삭제할거임
  const uiholder_aging_manager = setInterval(()=>{
  const criteria_value = Date.now() - uiholder_aging_for_oldkey_value; //이거보다 이전에 update 된 것은 삭제

    let free_count = 0;
    const keys = Object.keys(uiHolder_map);

    logger.info(`Aginging UI Holder... targets: ${keys.length} ,criteria: ${criteria_value}`);

      keys.forEach((key) => {
        const value = uiHolder_map[key];
        if(value.last_update_time < criteria_value)
        {
          const uiHolder = uiHolder_map[key];
          uiHolder.free();
          ++free_count;
          delete uiHolder_map[key]; //삭제~
        }
      })

      logger.info(`Done Aginging UI Holder... free count: ${free_count}`);
  }, SYSTEM_CONFIG.ui_holder_aging_manager_interval * 1000); //체크 주기

  return uiholder_aging_manager;
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

  free() //자원 정리
  {
    const guild_id = this.guild_id;

    this.base_interaction = undefined;
    this.guild = undefined;
    this.ui = undefined;
    this.prev_ui_stack = undefined; //뒤로가기용 UI스택

    logger.info(`Free UI Holder guild_id:${this.guild_id}`);
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
        this.ui.holder = this; //holder도 등록해준다. strong reference cycle 방지를 위해 weak타입으로...하려 했는데 weak이 설치가 안되네, free()를 믿자
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
        if(err.code === RESTJSONErrorCodes.UnknownMessage || err.code === RESTJSONErrorCodes.UnknownInteraction) //삭제된 메시지에 update 시도한거라 별도로 핸들링 하지 않는다.
        {
          return;
        }
        logger.error(`Failed to Reply UI guild_id:${this.guild_id}, embeds: ${JSON.stringify(this.embed)}, err: ${err.stack}`);
      });
    }
    else
    {
      this.base_interaction.editReply( {embeds: [this.getUIEmbed()], components: this.getUIComponents()})
      .catch((err) => {
        if(err.code === RESTJSONErrorCodes.UnknownMessage || err.code === RESTJSONErrorCodes.UnknownInteraction) //삭제된 메시지에 update 시도한거라 별도로 핸들링 하지 않는다.
        {
          return;
        }
        logger.error(`Failed to Update UI guild_id:${this.guild_id}, embeds: ${JSON.stringify(this.embed)}, err: ${err.stack}`);
      });
    }
  }

}

//QuizBotUI 
class QuizbotUI {

  constructor()
  {
    this.embed = {};
    // this.components = [cloneDeep(select_btn_component), cloneDeep(control_btn_component)]; //내가 clonedeep을 왜 해줬었지?
    this.components = [select_btn_component ]; //이게 기본 component임
    this.holder = undefined; 
  }

  //각 ui 별 on은 필요시 구현
  on(event_name, event_object)
  {
    switch(event_name) 
    {
      case CUSTOM_EVENT_TYPE.interactionCreate:
        return this.onInteractionCreate(event_object);

      default: return undefined;
    }
  }

  onInteractionCreate() //더미용 이벤트 콜백
  {

  }

  update()
  {
    if(this.holder != undefined)
    {
      this.holder.updateUI();
    }
    else
    {
      logger.error(`Failed to self Update UI guild_id:${this.guild_id}, embeds: ${JSON.stringify(this.embed)}, err: ${'this UI has undefined UI Holder!!!'}`);
    }
  }

  selectDefaultOptionByValue(select_menu, value)
  {
    const options = select_menu.options;
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

    return select_menu;
  }
}

//QuizBotControlComponentUI, 컨트롤 컴포넌트가 함께 있는 UI
class QuizBotControlComponentUI extends QuizbotUI {

  constructor()
  {
    super();

    this.control_btn_component = cloneDeep(control_btn_component);
    this.page_jump_component = cloneDeep(page_select_row);
    this.components = [select_btn_component, this.control_btn_component ]; //이게 기본 component임

    this.cur_contents = undefined;
    this.cur_page = 0;
    this.total_page = 0;
    this.count_per_page = 5; //페이지별 표시할 컨텐츠 수
    this.main_description = undefined; //displayContent에 같이 표시할 메인 description
  }

  checkPageMove(interaction) //더미용 이벤트 콜백
  {
    /** false => 페이지 이동 관련 아님, undefined => 페이지 이동 관련이긴하나 페이지가 바뀌진 않음, true => 페이지가 바뀜 */
    if(!interaction.isButton() && !interaction.isStringSelectMenu()) return false;

    if(interaction.customId == 'page_jump') //페이지 점프 시,
    {
      const selected_value = interaction.values[0];
      const selected_page_num = parseInt(selected_value.replace('page_', ""));
      if(this.cur_page == selected_page_num) return undefined; //페이지 바뀐게 없다면 return;

      if(selected_page_num < 0 || selected_page_num > this.total_page - 1) return undefined; //이상한 범위면 return
      
      this.cur_page = selected_page_num;
      this.displayContents(this.cur_page);

      const page_select_menu = this.page_jump_component.components[0];
      // this.selectDefaultOptionByValue(page_select_menu, selected_page_num);
      return true;
    }

    if(interaction.customId == 'prev') //페이지 이동 시
    {
      if(this.cur_page <= 0) return undefined;

      this.cur_page -= 1;
      this.displayContents(this.cur_page);
      return true;
    }
    
    if(interaction.customId == 'next')
    {
      if(this.cur_page >= this.total_page - 1) return undefined;

      this.cur_page += 1;
      this.displayContents(this.cur_page);
      return true;
    }

    return false;
  }

  selectDefaultOptionByValue(select_menu, value)
  {
    const options = select_menu.options;
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

    return select_menu;
  }

  setPageSelectMenuMax(max_page)
  {
    //selectmenu component의 options는 readonly 라서 다시 만들어야함

    if(max_page == 1)
    {
      this.components = [select_btn_component, this.control_btn_component]; //페이지가 1개면 페이지 이동 menu 뺌
      return;
    }

    this.components = [select_btn_component, this.control_btn_component, this.page_jump_component ]; //기본 component로 다시 지정

    const new_select_menu = cloneDeep(page_select_menu);

    for(let i = 0; i < max_page; ++i)
    {
      const page_option = { label: `${i+1}페이지`, description: ` `, value: `page_${i}` };
      new_select_menu.addOptions(page_option);
    }

    this.page_jump_component.components[0] = new_select_menu;
    this.components[2] = this.page_jump_component;
  }

  displayContents(page_num)
  {
    if(this.cur_contents == undefined) return;

    const contents = this.cur_contents;

    const total_page = parseInt(contents.length / this.count_per_page) + (contents.length % this.count_per_page != 0 ? 1 : 0);

    if(this.total_page == 0 || this.total_page != total_page) //total page 변경 사항 있을 시
    {
      this.total_page = total_page; //나중에 쓸거라 저장
      this.setPageSelectMenuMax(this.total_page);
    }

    let page_contents = [];
    let from = this.count_per_page * page_num;
    let to = (this.count_per_page * page_num) + this.count_per_page;
    if(to >=  contents.length) 
      to = contents.length;

    for(let i = from; i < to; i++)
    {
      const content = this.cur_contents[i];
      if(content == undefined) continue;
      page_contents.push(content);
    }

    let contents_message = this.main_description ?? "";
    for(let i = 0; i < page_contents.length; i++)
    {
      const cur_content = page_contents[i];
      let message = text_contents.icon["ICON_NUM_"+(i+1)];
      contents_message += `${message})\u1CBC\u1CBC${cur_content.icon ?? ""} ${cur_content.name}\n\n`;
    }

    // contents_message += "\u1CBC\u1CBC\n" + `${text_contents.icon.ICON_BOX} ${contents.length}` //굳이 항목 수를 표시해야할까..?
    this.embed.description = contents_message + "\u1CBC\n";

    let page_message = `${text_contents.icon.ICON_PAGE} ${page_num + 1} / ${total_page}`;
    // page_message += `| ${text_contents.icon.ICON_FOLDER} ${page_num + 1}`;
    this.embed.footer = { 
      text: page_message,
    };
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
      // url: text_contents.main_menu.url,
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
          value: `${text_contents.icon.ICON_GUILD} ${sync_objects.get('guild_count')}`,
          inline: true,
        },
        {
          name: text_contents.main_menu.playing_server,
          value: `${text_contents.icon.ICON_LOCALPLAY} ${sync_objects.get('local_play_count')}`,
          inline: true,
        },
        {
          name: text_contents.main_menu.competitive_server,
          value: `${text_contents.icon.ICON_MULTIPLAY} ${sync_objects.get('multi_play_count')}`,
          inline: true,
        },
      ],
      // image: {
      //   url: undefined,
      // },
      // timestamp: new Date().toISOString(),
      // footer: {
      //   text: '제육보끔#1916',
      //   icon_url: 'https://user-images.githubusercontent.com/28488288/208116143-24828069-91e7-4a67-ac69-3bf50a8e1a02.png',
      // },
    };

    this.components = [select_btn_component, main_ui_component]; //MAIN UI에서는 control component는 필요없다.
  }

  onInteractionCreate(interaction)
  {
    if(!interaction.isButton()) return;

    if(interaction.customId == '1') //로컬플레이 눌렀을 때
    {
      return new SelectQuizTypeUI();
    }

    if(interaction.customId == '3') //퀴즈만들기 눌렀을 때
    {
      interaction.channel.send({content:"```조금만 기다려주세요. 열심히 만들고 있습니다.```"});
      return;
    }

    if(interaction.customId == '4') //서버 설정 눌렀을 때
    {
      return new ServerSettingUI(interaction.guild.id);
    }

    if(interaction.customId == '5') //공지/패치노트 눌렀을 때
    {
      return new NotesSelectUI();
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
    };

    this.components = [select_btn_component ]; //이게 기본 component임
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
class DevQuizSelectUI extends QuizBotControlComponentUI  
{

  static resource_path = SYSTEM_CONFIG.dev_quiz_path;
  static quiz_contents =  utility.loadLocalDirectoryQuiz(DevQuizSelectUI.resource_path); //동적 로드할 필요는 딱히 없을듯..? 초기 로드 시, 정적으로 로드하자;

  constructor(contents)
  {
    super();

    this.embed = {
      color: 0x87CEEB,
      title: text_contents.dev_select_category.title,
      url: text_contents.dev_select_category.url,
      description: text_contents.dev_select_category.description,
    };

    this.cur_contents = (contents ?? DevQuizSelectUI.quiz_contents);
    if(this.cur_contents == undefined)
    {
      logger.error(`Undefined Current Contents on DevQuizSelectUI guild_id:${this.guild_id}, err: ${"Check Value of Resource Path Option"}`);
    }

    this.main_description = text_contents.dev_select_category.description;

    this.displayContents(0);

  }

  onInteractionCreate(interaction)
  {
    if(!interaction.isButton() && !interaction.isStringSelectMenu()) return;

    const is_page_move = this.checkPageMove(interaction);
    if(is_page_move == undefined) return;
    if(is_page_move == true) return this;

    const select_num = parseInt(interaction.customId);
    if(select_num == NaN || select_num < 0 || select_num > 9) return; //1~9번 사이 눌렀을 경우만

    // 그냥 페이지 계산해서 content 가져오자
    const index = (this.count_per_page * this.cur_page) + select_num - 1; //실제로 1번을 선택했으면 0번 인덱스를 뜻함

    if(index >= this.cur_contents.length) //범위 넘어선걸 골랐다면
    {
      return;
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
      title: `${quiz_info['icon']} ${quiz_info['title']}`,
      description: undefined,
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
      // new ButtonBuilder()
      //   .setCustomId('scoreboard')
      //   .setLabel('순위표')
      //   .setStyle(ButtonStyle.Secondary),
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
      
      quiz_system.startQuiz(guild, owner, channel, quiz_info); //퀴즈 시작

      return new AlertQuizStartUI(quiz_info, owner); 
    }

    if(interaction.customId == 'scoreboard') //순위표 버튼 눌렀을 떄
    {
      //TODO 순위표 만들기
    }

    if(interaction.customId == 'settings') //설정 버튼 눌렀을 떄
    {
      return new ServerSettingUI(interaction.guild.id);
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
      description: undefined,
      thumbnail: { //퀴즈 섬네일 표시
        url: undefined,
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
class ServerSettingUI extends QuizBotControlComponentUI {

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
    this.option_data = cloneDeep(this.option_storage.getOptionData());
    this.fillDescription(this.option_data);

    this.option_component = cloneDeep(option_component); //아예 deep copy해야함
    this.option_control_btn_component = cloneDeep(option_control_btn_component);
    this.option_value_components = cloneDeep(option_value_components);
    this.components = [ this.option_component, this.option_control_btn_component ];

    this.selected_option = undefined;
    this.selected_value = undefined;
  }

  fillDescription(option_data)
  {
    let description_message = text_contents.server_setting_ui.description;
    description_message = description_message.replace("${audio_play_time}", parseInt(option_data.quiz.audio_play_time / 1000));
    description_message = description_message.replace("${hint_type}", option_data.quiz.hint_type);
    description_message = description_message.replace("${skip_type}", option_data.quiz.skip_type);
    description_message = description_message.replace("${use_similar_answer}", (option_data.quiz.use_similar_answer == OPTION_TYPE.ENABLED ? `${text_contents.server_setting_ui.use}` : `${text_contents.server_setting_ui.not_use}`));
    description_message = description_message.replace("${score_type}", option_data.quiz.score_type);
    description_message = description_message.replace("${score_show_max}", (option_data.quiz.score_show_max == -1 ? `${text_contents.server_setting_ui.score_infinity}` : option_data.quiz.score.show_max));
    description_message = description_message.replace("${improved_audio_cut}", (option_data.quiz.improved_audio_cut == OPTION_TYPE.ENABLED ? `${text_contents.server_setting_ui.use}` : `${text_contents.server_setting_ui.not_use}`));
    description_message = description_message.replace("${use_message_intent}", (option_data.quiz.use_message_intent == OPTION_TYPE.ENABLED ? `${text_contents.server_setting_ui.use}` : `${text_contents.server_setting_ui.not_use}`));
    this.embed.description = description_message;
  }

  onInteractionCreate(interaction)
  {
    if(interaction.isStringSelectMenu()) {
      if(interaction.customId == 'option_select') //옵션 선택 시,
      {
        const selected_option = interaction.values[0];
        if(this.selected_option == selected_option) return; //바뀐게 없다면 return
        
        this.selected_option = selected_option;
  
        this.selectDefaultOptionByValue(this.option_component.components[0], selected_option);
  
        this.option_value_component = this.option_value_components[this.selected_option]; //value 컴포넌트를 보내줌
        this.components = [ this.option_component, this.option_value_component, this.option_control_btn_component];

        this.embed.footer = undefined;
  
        return this;
      }
      else if(interaction.customId == 'option_value_select')
      {
        const selected_value = interaction.values[0];
        
        this.selected_value = selected_value;
  
        this.selectDefaultOptionByValue(this.option_component.components[0], this.selected_option);
  
        this.option_data.quiz[this.selected_option] = selected_value;
        this.fillDescription(this.option_data);
        this.option_control_btn_component.components[0].setDisabled(false); //저장 버튼 활성화

        this.embed.footer = undefined;
  
        return this;
      }
    } else if(interaction.isButton()) {
      if(interaction.customId == 'save_option_data') //저장 버튼 클릭 시,
      {
        this.option_control_btn_component.components[0].setDisabled(true); //저장 버튼 비활성화

        this.option_storage.option = this.option_data;

        this.option_storage.saveOptionToDB()
        .then((result) => {

          let result_message = text_contents.server_setting_ui.save_fail;
          if(result != undefined)
          {
            result_message = text_contents.server_setting_ui.save_success
          }

          this.embed.footer = {
            "text": result_message
          }

          this.update();
        })
      }
    }
  }

}

//공지/패치노트 UI
class NotesSelectUI extends QuizBotControlComponentUI  
{

  constructor()
  {
    super();

    this.embed = {
      color: 0x87CEEB,
      title: text_contents.notes_select_ui.title,
      description: text_contents.notes_select_ui.description,
    };

    this.cur_contents = undefined; //현재 표시할 컨텐츠
    this.notice_contents = undefined; //공지용
    this.patch_note_contents = undefined; //패치노트용

    this.main_description = text_contents.notes_select_ui.description;

    this.loadNoteContents(SYSTEM_CONFIG.notices_path)
    .then(content_list =>
    {
      this.notice_contents = content_list;
      this.cur_contents = this.notice_contents;
      this.displayContents(0);
      this.update();
    });

    // this.loadNoteContents(SYSTEM_CONFIG.patch_notes_path)
    // .then(content_list =>
    // {
    //   this.patch_note_contents = content_list;
    // });

  }

  async loadNoteContents(notes_folder_path) 
  {
    //파일 생성일로 정렬
    const content_list_sorted_by_birthtime = fs.readdirSync(notes_folder_path)
        .map(function(v) { 
            return { name:v.replace('.txt', ""),
                    birthtime:fs.statSync(`${notes_folder_path}/${v}`).birthtime,
                    note_path: `${notes_folder_path}/${v}`
                  }; 
        })
        .sort(function(a, b) { return b.birthtime - a.birthtime; });

    return content_list_sorted_by_birthtime;
  }

  onInteractionCreate(interaction)
  {
    if(!interaction.isButton() && !interaction.isStringSelectMenu()) return;

    const is_page_move = this.checkPageMove(interaction);
    if(is_page_move == undefined) return;
    if(is_page_move == true) return this;

    if(interaction.customId == 'notice') //공지사항 버튼 클릭 시
    {
      this.cur_contents = this.notice_contents;
      this.cur_page = 0;
      this.displayContents(this.cur_page);
      return;
    }

    if(interaction.customId == 'patch_note') //패치노트 버튼 클릭 시
    {
      this.cur_contents = this.patch_note_contents;
      this.cur_page = 0;
      this.displayContents(this.cur_page);
      return;
    }

    const select_num = parseInt(interaction.customId);
    if(select_num == NaN || select_num < 0 || select_num > 9) return; //1~9번 사이 눌렀을 경우만

    // 그냥 페이지 계산해서 content 가져오자
    const index = (this.count_per_page * this.cur_page) + select_num - 1; //실제로 1번을 선택했으면 0번 인덱스를 뜻함

    if(index >= this.cur_contents.length) //범위 넘어선걸 골랐다면
    {
      return;
    }

    const note_info = this.cur_contents[index];
    if(note_info['note_path'] != undefined) //Note를 클릭했을 경우
    {
      return new NoteUI(note_info);
    }
    
  }
}

//일반 텍스트 표시 UI
class NoteUI extends QuizbotUI
{
  constructor(note_info)
  {
    super();

    this.note_info = note_info;

    const description = fs.readFileSync(note_info['note_path'], {encoding: 'utf8', flag:'r'});

    this.embed = {
      color: 0xFED049,
      title: `${note_info['name']}`,
      description: description,
      footer: { //내 이름 표시
        text: `제육보끔#1916`,
        icon_url: `https://user-images.githubusercontent.com/28488288/208116143-24828069-91e7-4a67-ac69-3bf50a8e1a02.png`,
      },
      timestamp: new Date(note_info['birthtime']).toISOString(),
    };


    this.components = [only_back_comp]; //여기서는 component를 바꿔서 해주자
  }

}