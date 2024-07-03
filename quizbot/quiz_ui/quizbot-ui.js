'use strict';

//#region 필요한 외부 모듈
const { RESTJSONErrorCodes} = require('discord.js');
const cloneDeep = require("lodash/cloneDeep.js");
const fs = require('fs');
const ytdl = require('discord-ytdl-core');
//#endregion

//#region 로컬 modules
const PRIVATE_CONFIG = require('../../config/private_config.json');
const { SYSTEM_CONFIG, CUSTOM_EVENT_TYPE, QUIZ_MAKER_TYPE, QUIZ_TYPE, QUIZ_TAG, DEV_QUIZ_TAG } = require('../../config/system_setting.js');
const option_system = require("../quiz_option/quiz_option.js");
const OPTION_TYPE = option_system.OPTION_TYPE;
const text_contents = require('../../config/text_contents.json')[SYSTEM_CONFIG.language]; 
const quiz_system = require('../quiz_system/quiz_system.js'); //퀴즈봇 메인 시스템
const utility = require('../../utility/utility.js');
const logger = require('../../utility/logger.js')('QuizUI');
const { UserQuizInfo, UserQuestionInfo, loadUserQuizListFromDB } = require('../managers/user_quiz_info_manager.js');
const { sync_objects } = require('../managers/ipc_manager.js');
const feedback_manager = require('../managers/feedback_manager.js');
const {
  select_btn_component,
  select_btn_component2,
  modal_page_jump,
  modal_complex_page_jump,
  page_select_menu,
  page_select_row,
  control_btn_component,
  main_ui_component,
  option_control_btn_component,
  option_component,
  option_value_components,
  createOptionValueComponents,
  quiz_info_comp,
  note_ui_component,
  only_back_comp,
  sort_by_select_menu,
  my_quiz_control_comp,
  quiz_edit_comp,
  quiz_info_control_comp,
  quiz_search_tags_select_menu,
  quiz_tags_select_menu,
  question_select_menu_comp,
  quiz_delete_confirm_comp,
  modal_quiz_info,
  modal_question_info,
  modal_question_additional_info,
  modal_question_info_edit,
  question_edit_comp,
  question_edit_comp2,
  question_control_btn_component,
  btn_search,
  omakase_quiz_info_comp,
  modal_omakase_setting,
  omakase_dev_quiz_tags_select_menu,
  omakase_custom_quiz_type_tags_select_menu,
  omakase_custom_quiz_tags_select_menu
} = require("./components.js");
//#endregion

/** global 변수 **/
let ui_holder_map = {}; //UI holdermap은 그냥 quizbot-ui 에서 가지고 있게 하자
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

//퀴즈 플레이 툴
exports.createMainUIHolder = (interaction) => {
  const guild_id = interaction.guild.id;
  if(ui_holder_map.hasOwnProperty(guild_id))
  {
    const prev_uiHolder = ui_holder_map[guild_id];
    prev_uiHolder.free();
  }
  const uiHolder = new UIHolder(interaction, new MainUI(), UI_HOLDER_TYPE.PUBLIC);
  uiHolder.holder_id = guild_id;
  ui_holder_map[guild_id] = uiHolder; 

  uiHolder.updateUI();

  return uiHolder;
}

//퀴즈 제작 툴
exports.createQuizToolUIHolder = (interaction) => { 
  const user_id = interaction.user.id ?? interaction.member.id;
  if(ui_holder_map.hasOwnProperty(user_id))
  {
    const prev_uiHolder = ui_holder_map[user_id];
    prev_uiHolder.free();
  }
  const uiHolder = new UIHolder(interaction, new UserQuizListUI(interaction.user), UI_HOLDER_TYPE.PRIVATE);
  uiHolder.holder_id = user_id;
  ui_holder_map[user_id] = uiHolder;

  //uiHolder.updateUI(); 얘는 따로

  return uiHolder;
}

exports.getUIHolder = (holder_id) => {
  if(ui_holder_map.hasOwnProperty(holder_id) == false)
  {
    return undefined;
  }

  return ui_holder_map[holder_id];
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
    const keys = Object.keys(ui_holder_map);

    logger.info(`Aginging UI Holder... targets: ${keys.length} ,criteria: ${criteria_value}`);

      keys.forEach((key) => {
        const value = ui_holder_map[key];
        if(value.last_update_time < criteria_value)
        {
          const uiHolder = ui_holder_map[key];
          uiHolder.free();
          ++free_count;
          delete ui_holder_map[key]; //삭제~
        }
      })

      logger.info(`Done Aginging UI Holder... free count: ${free_count}`);
  }, SYSTEM_CONFIG.ui_holder_aging_manager_interval * 1000); //체크 주기

  return uiholder_aging_manager;
}

//#endregion

/** UI 프레임 관련 **/

const UI_HOLDER_TYPE =
{
  PUBLIC : "public", //길드 메시지 UI, 길드용임
  PRIVATE : "private" //개인 메시지 UI, 개인용임
}

// UI들 표시해주는 홀더
class UIHolder 
{

  constructor(interaction, ui, ui_holder_type)
  {
    this.base_interaction = interaction; //Public 용 interaction, Public은 명령어에 의해 생성되기 때문에 있음
    this.base_message = undefined; //Private 용 Message, 얘는 개인 메시지로 보내야해서 interaction이 없다
    this.holder_id = undefined;
    this.guild = interaction.guild;
    this.guild_id = interaction.guild?.id;
    this.user = interaction.user;
    this.user_id = interaction.user.id;
    this.ui = ui ?? new MainUI();
    this.ui_holder_type = ui_holder_type;

    this.initialized = false;
    this.prev_ui_stack = []; //뒤로가기용 UI스택

    this.last_update_time = Date.now(); //uiholder aging manager에서 삭제 기준이될 값

    this.ui.holder = this;

    this.ui.onReady();
  }

  free() //자원 정리
  {
    const holder_id = this.guild_id ?? this.user_id;

    this.base_interaction = undefined;
    this.guild = undefined;
    this.ui = undefined;
    this.prev_ui_stack = undefined; //뒤로가기용 UI스택

    logger.info(`Free UI Holder holder_id:${this.holder_id}`);
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
    if(this.ui == undefined)
    {
      return;
    }

    if(event_name == CUSTOM_EVENT_TYPE.interactionCreate)
    {
      let interaction = event_object;
      if(interaction.isButton() && interaction.customId == 'back')  //뒤로가기 버튼 처리
      {
        this.goToBack();
        return;
      }
    }

    const new_ui = this.ui.on(event_name, event_object); //UI가 새로 변경됐다면 업데이트 진행
    this.onUIReceived(new_ui);
  }

  goToBack() //뒤로가기
  {
    if(this.prev_ui_stack.length == 0)
    {
      return;
    }

    this.ui = this.prev_ui_stack.pop();
    this.ui.onAwaked(); //페이지 재활성화 됐을 때
    this.updateUI();
  }

  appendNewUI(new_ui) 
  {
    this.prev_ui_stack.push(this.ui);
    this.ui = new_ui;
    this.ui.holder = this; //holder도 등록해준다. strong reference cycle 방지를 위해 weak타입으로...하려 했는데 weak이 설치가 안되네, free()를 믿자

    new_ui.onReady(); //ui 등록 완료됐을 때 이벤트
  }

  onUIReceived(new_ui)
  {
    if(new_ui == undefined)
    {
      return;
    }

    if(this.ui != new_ui) //ui stack 에 쌓는 것은 새 UI 인스턴스가 생성됐을 때만
    {
      this.appendNewUI(new_ui);
    }
    this.updateUI();
  }

  //UI 재전송
  updateUI()
  {
    if(this.ui == undefined)
    {
      return;
    }

    this.last_update_time = Date.now();

    if(this.ui_holder_type == UI_HOLDER_TYPE.PUBLIC)
    {
      this.updatePublicUI();
    }
    else if(this.ui_holder_type == UI_HOLDER_TYPE.PRIVATE)
    {
      this.updatePrivateUI();
    }
  }

  updatePublicUI(is_retry = false) //Public 메시지용 update
  {
    if(this.initialized == false)
    {
      this.initialized = true;

      this.base_interaction.reply( {embeds: [this.getUIEmbed()], components: this.getUIComponents()} )
      .catch((err) => {
        if(err.code === RESTJSONErrorCodes.UnknownMessage || err.code === RESTJSONErrorCodes.UnknownInteraction) //삭제된 메시지에 update 시도한거라 별도로 핸들링 하지 않는다.
        {
          return;
        }

        if(err.code === RESTJSONErrorCodes.InvalidFormBodyOrContentType) //embed에서 url들이 잘못됐다. 이 경우 그냥 url 다 지워
        {
          logger.warn(`Invalid Form Body from Public UI, Remove all url. guild_id:${this.guild_id}, user_id:${this.user_id}, embeds: ${JSON.stringify(this.getUIEmbed())}`);
          this.ui.resetEmbedURL();

          if(is_retry == false)
          {
            this.updatePublicUI(true); //재시도
          }
          else
          {
            logger.error(`Failed to Retry Public UI guild_id:${this.guild_id}, user_id:${this.user_id}, embeds: ${JSON.stringify(this.getUIEmbed())}, err: ${err.stack}`);
          }

          return;
        }

        logger.error(`Failed to Reply Public UI guild_id:${this.guild_id}, user_id:${this.user_id}, embeds: ${JSON.stringify(this.getUIEmbed())}, err: ${err.stack}`);
      });

      return;
    }

    this.base_interaction.editReply( {embeds: [this.getUIEmbed()], components: this.getUIComponents()} )
    .catch((err) => {
      if(err.code === RESTJSONErrorCodes.UnknownMessage || err.code === RESTJSONErrorCodes.UnknownInteraction) //삭제된 메시지에 update 시도한거라 별도로 핸들링 하지 않는다.
      {
        return;
      }

      if(err.code === RESTJSONErrorCodes.InvalidFormBodyOrContentType) //embed에서 url들이 잘못됐다. 이 경우 그냥 url 다 지워
      {
        logger.warn(`Invalid Form Body from Public UI, Remove all url. guild_id:${this.guild_id}, user_id:${this.user_id}, embeds: ${JSON.stringify(this.getUIEmbed())}`);
        this.ui.resetEmbedURL();

        if(is_retry == false)
        {
          this.updatePublicUI(true); //재시도
        }
        else
        {
          logger.error(`Failed to Retry Public UI guild_id:${this.guild_id}, user_id:${this.user_id}, embeds: ${JSON.stringify(this.getUIEmbed())}, err: ${err.stack}`);
        }

        return;
      }

      logger.error(`Failed to Update Public UI guild_id:${this.guild_id}, user_id:${this.user_id}, embeds: ${JSON.stringify(this.getUIEmbed())}, err: ${err.stack}`);
    });
  }

  updatePrivateUI(is_retry = false) //Private 메시지용 update
  {
    if(this.initialized == false || this.base_message == undefined)
    {
      this.initialized = true;

      this.user.send( {embeds: [this.getUIEmbed()], components: this.getUIComponents()} )
      .then((message) => {
        this.base_message = message;
      })
      .catch((err) => {
        if(err.code === RESTJSONErrorCodes.UnknownMessage || err.code === RESTJSONErrorCodes.UnknownInteraction) //삭제된 메시지에 update 시도한거라 별도로 핸들링 하지 않는다.
        {
          return;
        }

        if(err.code === RESTJSONErrorCodes.InvalidFormBodyOrContentType) //embed에서 url들이 잘못됐다. 이 경우 그냥 url 다 지워
        {
          logger.warn(`Invalid Form Body from Private UI, Remove all url. guild_id:${this.guild_id}, user_id:${this.user_id}, embeds: ${JSON.stringify(this.getUIEmbed())}`);
          this.ui.resetEmbedURL();

          if(is_retry == false)
          {
            this.updatePrivateUI(true); //재시도
          }
          else
          {
            logger.error(`Failed to Retry Private UI guild_id:${this.guild_id}, user_id:${this.user_id}, embeds: ${JSON.stringify(this.getUIEmbed())}, err: ${err.stack}`);
          }

          return;
        }

        logger.error(`Failed to Send Private UI guild_id:${this.guild_id}, user_id:${this.user_id}, embeds: ${JSON.stringify(this.getUIEmbed())}, err: ${err.stack}`);
      });

      return;
    }

    this.base_message.edit( {embeds: [this.getUIEmbed()], components: this.getUIComponents()} )
    .catch((err) => {
      if(err.code === RESTJSONErrorCodes.UnknownMessage || err.code === RESTJSONErrorCodes.UnknownInteraction) //삭제된 메시지에 update 시도한거라 별도로 핸들링 하지 않는다.
      {
        return;
      }

      if(err.code === RESTJSONErrorCodes.InvalidFormBodyOrContentType) //embed에서 url들이 잘못됐다. 이 경우 그냥 url 다 지워
      {
        logger.warn(`Invalid Form Body from Private UI, Remove all url. guild_id:${this.guild_id}, user_id:${this.user_id}, embeds: ${JSON.stringify(this.getUIEmbed())}`);
        this.ui.resetEmbedURL();

        if(is_retry == false)
        {
          this.updatePrivateUI(true); //재시도
        }
        else
        {
          logger.error(`Failed to Retry Private UI guild_id:${this.guild_id}, user_id:${this.user_id}, embeds: ${JSON.stringify(this.getUIEmbed())}, err: ${err.stack}`);
        }

        return;
      }

      logger.error(`Failed to Update Private UI guild_id:${this.guild_id}, user_id:${this.user_id}, embeds: ${JSON.stringify(this.getUIEmbed())}, err: ${err.stack}`);
    });
  }

  sendDelayedUI(ui, do_resend) //interaction 이벤트 떄만이 아니라 아무 때나 ui update
  {
    if(do_resend && ui != undefined && this.base_message != undefined)
    {
      this.base_message.delete();
      this.base_message = undefined;
    }

    this.onUIReceived(ui);
  }

}

//QuizBotUI 
class QuizbotUI {

  constructor()
  {
    this.embed = {};
    // this.components = [cloneDeep(select_btn_component), cloneDeep(control_btn_component)]; //내가 clonedeep을 왜 해줬었지?
    this.components = [ select_btn_component, select_btn_component2 ]; //이게 기본 component임
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

  onReady() //ui 최초 등록 됐을 때
  {

  }

  onInteractionCreate() //더미용 이벤트 콜백
  {

  }

  onAwaked() //페이지 재활성화 됐을 때
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

  sendDelayedUI(ui, do_resend)
  {
    if(this.holder != undefined)
    {
      this.holder.sendDelayedUI(ui, do_resend);
    }
    else
    {
      logger.error(`Failed to self force update delayed UI guild_id:${this.guild_id}, embeds: ${JSON.stringify(this.embed)}, err: ${'this UI has undefined UI Holder!!!'}`);
    }
  }

  freeHolder()
  {
    if(this.holder != undefined)
    {
      this.holder.free();
    }
    else
    {
      logger.error(`Failed to self free UI guild_id:${this.guild_id}, embeds: ${JSON.stringify(this.embed)}, err: ${'this UI has undefined UI Holder!!!'}`);
    }
  }

  goToBack()
  {
    if(this.holder != undefined)
    {
      this.holder.goToBack();
    }
    else
    {
      logger.error(`Failed to self Go to back UI guild_id:${this.guild_id}, embeds: ${JSON.stringify(this.embed)}, err: ${'this UI has undefined UI Holder!!!'}`);
    }
  }


  //selectmenu 에서 value 값에 해당하는 선택지를 default 활성화해줌
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

  //embed url 전부 제거
  resetEmbedURL()
  {
    if(this.embed.image != undefined)
    {
      this.embed.image.url = '';
    }

    if(this.embed.thumbnail != undefined)
    {
      this.embed.thumbnail.url = '';
    }

    if(this.embed.footer != undefined)
    {
      this.embed.footer.icon_url = '';
    }
  }
}

//QuizBotControlComponentUI, 컨트롤 컴포넌트가 함께 있는 UI
class QuizBotControlComponentUI extends QuizbotUI {

  constructor()
  {
    super();

    this.control_btn_component = cloneDeep(control_btn_component);
    this.page_jump_component = cloneDeep(page_select_row);
    this.components = [select_btn_component, select_btn_component2, this.control_btn_component ]; //이게 기본 component임

    this.cur_contents = undefined;
    this.cur_page = 0;
    this.total_page = 0;
    this.count_per_page = 10; //페이지별 표시할 컨텐츠 수
    this.main_description = undefined; //displayContent에 같이 표시할 메인 description
  }

  checkPageMove(interaction) //더미용 이벤트 콜백
  {
    /** false => 페이지 이동 관련 아님, undefined => 페이지 이동 관련이긴하나 페이지가 바뀌진 않음, true => 페이지가 바뀜 */
    if(!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return false;

    //페이지이동 select menu 눌렀을 때임
    // if(interaction.customId == 'page_jump') //페이지 점프 시,
    // {
    //   const selected_value = interaction.values[0];
    //   const selected_page_num = parseInt(selected_value.replace('page_', ""));
    //   if(this.cur_page == selected_page_num) return undefined; //페이지 바뀐게 없다면 return;

    //   if(selected_page_num < 0 || selected_page_num > this.total_page - 1) return undefined; //이상한 범위면 return
      
    //   this.cur_page = selected_page_num;
    //   this.displayContents(this.cur_page);

    //   const page_select_menu = this.page_jump_component.components[0];
    //   // this.selectDefaultOptionByValue(page_select_menu, selected_page_num);
    //   return true;
    // }

    //점프 버튼 눌렀을 때임
    if(interaction.customId == 'request_modal_page_jump')
    {
      interaction.showModal(modal_page_jump); //페이지 점프 입력 모달 전달
      return undefined;
    }

    //페이지 점프 제공했을 때임
    if(interaction.customId == 'modal_page_jump' || interaction.customId == 'modal_complex_page_jump')
    {
      const input_page_value = interaction.fields.getTextInputValue('txt_input_page_jump');

      if(input_page_value == undefined || input_page_value == '')
      {
        interaction.deferUpdate(); //defer은 해준다.
        return undefined;
      }

      const selected_page_num = parseInt(input_page_value.trim());
      if(isNaN(selected_page_num)) //입력 값 잘못된거 처리
      {
        interaction.reply({content: `>>> ${input_page_value} 값은 잘못됐습니다.`, ephemeral: true});
        return undefined;
      }

      if(selected_page_num <= 0 || selected_page_num > this.total_page) 
      {
        interaction.reply({content: `>>> ${input_page_value} 페이지는 없네요...`, ephemeral: true});
        return undefined; //이상한 범위면 return
      }

      if(this.cur_page == selected_page_num) 
      {
        interaction.deferUpdate(); //defer은 해준다.
        return undefined; //페이지 바뀐게 없다면 return;
      }
      
      this.cur_page = selected_page_num - 1;
      this.displayContents(this.cur_page);
      interaction.deferUpdate(); //defer은 해준다.

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

  //Deprecated
  setPageSelectMenuMax(max_page)
  {
    //selectmenu component의 options는 readonly 라서 다시 만들어야함

    // if(max_page <= 1) //23.11.30 아 그냥 뺴지마, 신경쓸게 많음;;
    // {
    //   // this.components = [select_btn_component, this.control_btn_component]; //페이지가 1개면 페이지 이동 menu 뺌
    //   const index_to_remove = this.components.indexOf(this.page_jump_component);
    //   if(index_to_remove != -1)
    //   {
    //     this.components.splice(index_to_remove, 1); 
    //   }
    //   return;
    // }

    // this.components = [select_btn_component, this.control_btn_component, this.page_jump_component ]; //기본 component로 다시 지정
    // this.components.splice(2, 0, this.page_jump_component); //페이지 선택 메뉴 필요하면 삽입

    if(max_page <= 0) 
    {
      return;
    }

    const new_select_menu = cloneDeep(page_select_menu);

    for(let i = 0; i < max_page && i < 25; ++i) //최대 25까지밖에 안됨
    {
      const page_option = { label: `${i+1}페이지`, description: ` `, value: `page_${i}` };
      new_select_menu.addOptions(page_option);
    }

    this.page_jump_component.components[0] = new_select_menu;
    // this.components[2] = this.page_jump_component;
  }

  displayContents(page_num)
  {
    if(this.cur_contents == undefined) return;

    const contents = this.cur_contents;

    const total_page = parseInt(contents.length / this.count_per_page) + (contents.length % this.count_per_page != 0 ? 1 : 0);

    if(this.total_page == 0 || this.total_page != total_page) //total page 변경 사항 있을 시
    {
      this.total_page = total_page; //나중에 쓸거라 저장
      // this.setPageSelectMenuMax(this.total_page);
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
      contents_message += `${message})  ${cur_content.icon ?? ""} ${cur_content.name}\n\n`;
    }

    // contents_message += "  \n" + `${text_contents.icon.ICON_BOX} ${contents.length}` //굳이 항목 수를 표시해야할까..?
    this.embed.description = contents_message + " \n";

    let page_message = `${text_contents.icon.ICON_PAGE} ${page_num + 1} / ${total_page} ${text_contents.icon.PAGE_TEXT}`;
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
      footer: {
        text: `제육보끔#1916`, 
        icon_url: 'https://user-images.githubusercontent.com/28488288/208116143-24828069-91e7-4a67-ac69-3bf50a8e1a02.png',
      },
    };

    if(fs.existsSync(SYSTEM_CONFIG.version_info_path)) //TODO 음... 패치 일자 실시간으로 가져오기에는 좀 부담스러운데, 나중에 Manager를 하나 두자
    {
      const version_info = fs.readFileSync(SYSTEM_CONFIG.version_info_path, {encoding: 'utf8', flag:'r'});
      this.embed.footer.text = `${text_contents.main_menu.footer} ${version_info}`
      this.embed.footer.icon_url = undefined;
    }

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
      return new QuizToolGuide(); //퀴즈만들기 방법 안내
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

    this.components = [select_btn_component, only_back_comp ]; //이게 기본 component임
  }

  onInteractionCreate(interaction)
  {
    if(!interaction.isButton()) return;

    if(interaction.customId == '1') //개발자 퀴즈 눌렀을 때
    {
      return new DevQuizSelectUI();
    }
    
    if(interaction.customId == '2') //유저 제작 퀴즈 눌렀을 때
    {
      return new UserQuizSelectUI();
    }

    if(interaction.customId == '3') //오마카세 제작 퀴즈 눌렀을 때
    {
      const omakase_quiz_info = OmakaseQuizRoomUI.createDefaultOmakaseQuizInfo(interaction);
      return new OmakaseQuizRoomUI(omakase_quiz_info);
    }
  }

}

//개발자 퀴즈 선택 UI
class DevQuizSelectUI extends QuizBotControlComponentUI  
{

  static resource_path = SYSTEM_CONFIG.dev_quiz_path;
  static quiz_contents_sorted_by_name =  utility.loadLocalDirectoryQuiz(DevQuizSelectUI.resource_path); //동적 로드할 필요는 딱히 없을듯..? 초기 로드 시, 정적으로 로드하자;
  // static quiz_contents_sorted_by_mtime =  utility.loadLocalDirectoryQuiz(DevQuizSelectUI.resource_path, 'mtime'); //동적 로드할 필요는 딱히 없을듯..? 초기 로드 시, 정적으로 로드하자;
  //mtime 안쓰니깐 잠시 빼두자

  constructor(contents)
  {
    super();

    this.embed = {
      color: 0x87CEEB,
      title: text_contents.dev_select_category.title,
      url: text_contents.dev_select_category.url,
      description: text_contents.dev_select_category.description,
    };

    this.cur_contents = (contents ?? DevQuizSelectUI.quiz_contents_sorted_by_name);
    if(this.cur_contents == undefined)
    {
      logger.error(`Undefined Current Contents on DevQuizSelectUI guild_id:${this.guild_id}, err: ${"Check Value of Resource Path Option"}`);
    }

    this.main_description = text_contents.dev_select_category.description;

    this.displayContents(0);

  }

  onInteractionCreate(interaction)
  {
    if(!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return;

    const is_page_move = this.checkPageMove(interaction);
    if(is_page_move == undefined) return;
    if(is_page_move == true) return this;

    const select_num = parseInt(interaction.customId);
    if(isNaN(select_num) || select_num < 0 || select_num > 10) return; //1~10번 사이 눌렀을 경우만

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

      quiz_info['quiz_id'] = undefined; //dev quiz는 quiz_id가 없다

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

    this.components = [quiz_info_comp]; //여기서는 component를 바꿔서 해주자
  }

  onInteractionCreate(interaction) 
  {
    if(!interaction.isButton()) return;

    if(interaction.customId == 'start') //시작 버튼 눌렀을 때
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

    if(interaction.customId == 'scoreboard') //순위표 버튼 눌렀을 때
    {
      //TODO 순위표 만들기
    }

    if(interaction.customId == 'settings') //설정 버튼 눌렀을 때
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

//퀴즈 만들기 Guide
class QuizToolGuide extends QuizbotUI
{
  constructor()
  {
    super();

    this.embed = {
      color: 0x05f1f1,
      title: text_contents.quiz_tool_guide_ui.title,
      description: text_contents.quiz_tool_guide_ui.description,
      url: undefined,
      fields: [
        text_contents.quiz_tool_guide_ui.fields1,
        text_contents.quiz_tool_guide_ui.fields2,
      ]
    };

    this.components = [ only_back_comp ];
  }

  onInteractionCreate(interaction)
  {
    return; //QuizToolGuide 에서는 이벤트 핸들링을 하지 않음
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
    // //파일 생성일로 정렬
    // const content_list_sorted_by_mtime = fs.readdirSync(notes_folder_path)
    //     .map(function(v) { 
    //         return { name:v.replace('.txt', ""),
    //                 mtime:fs.statSync(`${notes_folder_path}/${v}`).mtime,
    //                 note_path: `${notes_folder_path}/${v}`
    //               }; 
    //     })
    //     .sort(function(a, b) { return b.mtime - a.mtime; });
  
      //파일명으로 정렬
      const content_list_sorted_by_name = fs.readdirSync(notes_folder_path)
      .sort((a, b) => {
        return b.localeCompare(a, 'ko');
      })
      .map(function(v) { 
        return { name:v.replace('.txt', ""),
                mtime:fs.statSync(`${notes_folder_path}/${v}`).mtime,
                note_path: `${notes_folder_path}/${v}`
              }; 
      });

    return content_list_sorted_by_name;
  }

  onInteractionCreate(interaction)
  {
    if(!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return;

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
    if(isNaN(select_num) || select_num < 0 || select_num > 10) return; //1~10번 사이 눌렀을 경우만

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
      timestamp: new Date(note_info['mtime']).toISOString(),
    };


    this.components = [only_back_comp]; //여기서는 component를 바꿔서 해주자
  }

}



////////////// Quiz 제작 UI 관련, 전부 개인 메시지로 처리됨
/**
 * 23.11.10 text_contents 를 사용한 텍스트 관리가 매우 귀찮고 어차피 영문 텍스트 지원도 당장 할 계획 없으니 QuizToolUI 관련은 하드코딩하겠음
 * 23.11.16 답이 없다... 리팩터링 안할거면 걍 유지보수 포기하자
 */
class UserQuizListUI extends QuizBotControlComponentUI
{
  constructor(creator)
  {
    super();

    this.creator = creator;
    this.creator_id = creator.id;

    this.embed = {
      color: 0x05f1f1,
      title: `📑 보유한 퀴즈 목록`,
      url: text_contents.dev_select_category.url,
      description: `🛠 **${creator.displayName}**님이 제작하신 퀴즈 목록입니다!\n \n \n`,

      footer: {
        text: creator.displayName, 
        icon_url: creator.avatarURL(),
      },
    };

    this.main_description = this.embed.description;

    this.components.push(my_quiz_control_comp);

  }

  onReady()
  {
    //조회 속도가 빠르면 메시지 생성되기 전에 updateUI 해버려서 그냥 조회 후 ui 전송되게함
    this.loadUserQuiz()
    .then(() => 
    { 
      this.update();
      this.sendQuizPlayedInfo(); //제작한 퀴즈 플레이 정보 요약
    })
    .catch(err => 
    {
      logger.error(`Undefined Current Contents on UserQuizListUI, creator_id:${this.creator_id}, err: ${err.stack}`);
    });
  }

  onInteractionCreate(interaction)
  {
    if(!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return;

    if(interaction.customId == 'modal_quiz_info')
    {
      this.addQuiz(interaction)
      return;
    }

    if(interaction.customId == 'request_modal_quiz_create') //퀴즈 만들기 클릭 시
    {
      interaction.showModal(modal_quiz_info); //퀴즈 생성 모달 전달
      return;
    }

    const is_page_move = this.checkPageMove(interaction);
    if(is_page_move == undefined) return;
    if(is_page_move == true) return this;

    const select_num = parseInt(interaction.customId);
    if(isNaN(select_num) || select_num < 0 || select_num > 10) return; //1~10번 사이 눌렀을 경우만

    // 그냥 페이지 계산해서 content 가져오자
    const index = (this.count_per_page * this.cur_page) + select_num - 1; //실제로 1번을 선택했으면 0번 인덱스를 뜻함

    if(index >= this.cur_contents.length) //범위 넘어선걸 골랐다면
    {
      return;
    }

    const user = interaction.user;
    const user_quiz_info = this.cur_contents[index];
    return this.showEditor(user, user_quiz_info);
  }

  onAwaked() //ui 재활성화 됐을 때
  {
    this.loadUserQuiz(); //퀴즈 목록 재로드
  }

  //DB에서 특정 유저 퀴즈가져오기
  async loadUserQuiz()
  {
    let creator_id = this.creator_id;

    const user_quiz_list = await loadUserQuizListFromDB(creator_id);

    if(user_quiz_list.length == 0)
    {
      this.embed.description += `아직 제작하신 퀴즈가 없어요.\n새로운 퀴즈를 만들어 보시겠어요?😀`;
      return;
    }

    this.cur_contents = [];
    for(const quiz_info of user_quiz_list)
    {
      quiz_info.name = quiz_info.data.quiz_title;
      this.cur_contents.push(quiz_info);
    }

    //어드민일 경우
    if(PRIVATE_CONFIG?.ADMIN_ID != undefined && PRIVATE_CONFIG.ADMIN_ID == creator_id) 
    {
      logger.warn(`Matched to Admin ID ${creator_id}, Loading User Quiz List as Undefined`);
      const all_quiz_list = await loadUserQuizListFromDB(undefined); //전체 조회
      for(const quiz_info of all_quiz_list)
        {
          quiz_info.name = quiz_info.data.quiz_title;
          this.cur_contents.push(quiz_info);
        }
    }

    this.displayContents(0);
  }

  showEditor(user, user_quiz_info)
  {
    if(user.id != user_quiz_info.data.creator_id && user.id != PRIVATE_CONFIG?.ADMIN_ID) //어드민이면 다 수정 할 수 있음
    {
      user.send({content: `>>> 당신은 해당 퀴즈를 수정할 권한이 없습니다. quiz_id: ${user_quiz_info.data.quiz_id}`, ephemeral: true});
      return;
    }

    const user_quiz_info_ui = new UserQuizInfoUI(user_quiz_info, false);
    this.sendDelayedUI(user_quiz_info_ui, true); //ui 업데이트 요청, 메시지 resend를 위해서
  }

  async addQuiz(modal_interaction) //제출된 modal interaction에서 정보 가져다 씀
  {
    
    let user_quiz_info = new UserQuizInfo();
    
    const quiz_title = modal_interaction.fields.getTextInputValue('txt_input_quiz_title');
    const quiz_thumbnail = modal_interaction.fields.getTextInputValue('txt_input_quiz_thumbnail');
    const quiz_simple_description = modal_interaction.fields.getTextInputValue('txt_input_quiz_simple_description');
    const quiz_description = modal_interaction.fields.getTextInputValue('txt_input_quiz_description');

    modal_interaction.reply({content: `>>> ${quiz_title} 퀴즈를 생성 중... 잠시만 기다려주세요.`, ephemeral: true});

    //이건 어쩔 수 없음 직접 하드코딩으로 데이터 넣어야함
    user_quiz_info.data.creator_id = modal_interaction.user.id;
    user_quiz_info.data.creator_name = modal_interaction.user.displayName; //잠만 이게 맞아?
    user_quiz_info.data.creator_icon_url = modal_interaction.user.avatarURL();
    user_quiz_info.data.quiz_title = quiz_title;
    user_quiz_info.data.thumbnail = quiz_thumbnail;
    user_quiz_info.data.simple_description = quiz_simple_description;
    user_quiz_info.data.description = quiz_description;
    user_quiz_info.data.winner_nickname = '플레이어'; //이건... 사실 필요없겠다. 고정값으로 ㄱㄱ
    user_quiz_info.data.birthtime = new Date();
    user_quiz_info.data.modified_time = new Date();
    user_quiz_info.data.played_count = 0;
    user_quiz_info.data.is_private = true;
    user_quiz_info.data.played_count_of_week = 0;

    const created_quiz_id = await user_quiz_info.saveDataToDB();

    if(created_quiz_id == undefined) //저장 실패
    {
      modal_interaction.user.send({content: `>>> ${quiz_title} 퀴즈를 생성하는데 실패했습니다...😓.\n해당 문제가 지속될 경우 otter6975@gmail.com 이나 디스코드 DM(제육보끔#1916)으로 문의 바랍니다.`, ephemeral: true});
      return;
    }

    logger.info(`Created New Quiz... quiz_id: ${user_quiz_info.quiz_id}, title: ${user_quiz_info.data.quiz_title}`);

    const user = modal_interaction.user;
    return this.showEditor(user, user_quiz_info);
  }

  sendQuizPlayedInfo()
  {
    if(this.creator == undefined)
    {
      return;
    }

    const user = this.creator;

    let total_played_count = 0;
    let best_quiz = undefined;
    let best_quiz_of_week = undefined;

    if(this.cur_contents == undefined || this.cur_contents.length == 0)
    {
      return;
    }

    for(const quiz_info of this.cur_contents)
    {
      if(quiz_info == undefined)
      {
        continue;
      }

      total_played_count += quiz_info.data.played_count;

      if(best_quiz == undefined
          || best_quiz.data.played_count < quiz_info.data.played_count)
      {
        best_quiz = quiz_info;
      }

      if(best_quiz_of_week == undefined
        || best_quiz_of_week.data.played_count < quiz_info.data.played_count)
      {
        best_quiz_of_week = quiz_info;
      }
    }

    let info_string = 
	 `🔸 유저분들이 ${user.displayName} 님의 퀴즈를 [${total_played_count}]회 플레이했어요!\n🔸 이번 주에 가장 플레이된 퀴즈는 [${best_quiz_of_week.data.quiz_title ?? "UNKNOWN NAME"}]이네요!\n🔸 모든 퀴즈 중 가장 많이 플레이된 퀴즈는 [${best_quiz.data.quiz_title ?? "UNKNOWN NAME"}]입니다!\n🔸 퀴즈 제작에 참여해주셔서 정말 감사드립니다.🙂`;
    user.send({content: '```' + info_string + '```', ephemeral: true});
  }
}

//유저 퀴즈 정보 UI
class UserQuizInfoUI extends QuizbotUI {

  constructor(quiz_info, readonly=true)
  {
    super();

    this.readonly = readonly;

    this.quiz_info = quiz_info;

    this.embed = {
      color: 0x05f1f1,
      title: `**${quiz_info.data.quiz_title}**`,
      description: '퀴즈 정보를 불러오는 중...\n잠시만 기다려주세요.',
    };

    
  }

  onReady() //ui 등록 됐을 때
  {
    this.loadQuestionList(); //여기서 ui 업데이트함
  }

  onInteractionCreate(interaction) //TODO QuizInfoUI랑 event는 중복이긴 한데... 귀찮으니 나중에 따로 빼자
  {
    if(!interaction.isButton() && !interaction.isModalSubmit() && !interaction.isStringSelectMenu()) return;

    if(this.readonly == true)
    {
      return this.doQuizPlayEvent(interaction);
    }
    else
    {
      return this.doQuizEditorEvent(interaction);
    }
  }

  onAwaked() //ui 재활성화 됐을 때, UserQuestionInfo 에서 back 쳐서 돌아왔을 때, select menu 랑 문제 수 갱신해줘야함
  {
    this.refreshUI();
  }


  async loadQuestionList()
  {
    await this.quiz_info.loadQuestionListFromDB();

    this.refreshUI();

    this.update();
  }

  refreshUI() //ui에 quiz_info 재적용
  {
    const quiz_info = this.quiz_info;

    this.embed = {
      color: 0x05f1f1,
      title: `**${quiz_info.data.quiz_title}**`,
      description: '',
      image: { //퀴즈 섬네일 표시
        url: utility.isValidURL(quiz_info.data.thumbnail) ? quiz_info.data.thumbnail : '',
      },
      footer: { //퀴즈 제작자 표시
        text: quiz_info.data.creator_name ?? '',
        icon_url: quiz_info.data.creator_icon_url ?? '',
      },
    };

    let description = '';
    description += `⚒️ 퀴즈 제작: **${(quiz_info.data.creator_name ?? '')}**\n`;

    description += `🏷 한줄 소개: **${quiz_info.data.simple_description}**\n`;
    description += `📦 문제 개수: **${quiz_info.question_list.length}개 [최대 50개]**\n`;
    description += "\n\n\n";

    description += `📖 퀴즈 설명:\n${quiz_info.data.description}\n\n\n\n`;

    description += "`만들어진 날짜: " + quiz_info.data.birthtime.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }) + "`\n";
    description += "`업데이트 날짜: " + quiz_info.data.modified_time.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }) + "`\n";
    
    description += "`플레이된 횟수: " + (quiz_info.data.played_count ?? 0) + "회`\n";
    description += "`추천한 유저수: " + (quiz_info.data.like_count ?? 0) + "개`\n";
    description += "`인증여부: " + (quiz_info.data.certified ? "⭕" : "❌") + "`\n\n";

    description += "`퀴즈태그 목록: " + utility.convertTagsValueToString(quiz_info.data.tags_value) + "`\n\n";

    if(quiz_info.data.is_private)
    {
      description += "\n\n__**❗ 퀴즈를 다 만드신 후에는 꼭 [공개]로 설정해주세요!**__";
    }

    // description = description.replace('${quiz_type_name}', `${quiz_info.data.type_name}`);
    // description = description.replace('${quiz_size}', `${quiz_info.data.quiz_size}`);
    // description = description.replace('${quiz_description}', `${quiz_info.data.description}`);
    
    if(this.readonly)
    {
      description += '`⚠️ 퀴즈 도중에는 설정을 변경하실 수 없습니다.\n\n`';
      this.components = [quiz_info_comp, feedback_manager.quiz_feedback_comp]; //게임 시작 가능한 comp, 퀴즈 feedback comp
    }
    else
    {
      this.embed.title += quiz_info.data.is_private ? ` **[비공개🔒]**` : ` **[공개]**`

      this.components = [quiz_edit_comp, quiz_tags_select_menu]; //퀴즈 수정 가능한 comp

      let temp_question_select_menu_comp = undefined;
      let temp_question_select_menu = undefined;
      const question_list = this.quiz_info.question_list;
      for(let i = 0; i < question_list.length && i < 50; ++i)
      {
        if(i % 25 == 0)
        {
          temp_question_select_menu_comp = cloneDeep(question_select_menu_comp);
          temp_question_select_menu = temp_question_select_menu_comp.components[0];
          temp_question_select_menu.setCustomId(`question_select_menu`+`#${i/25}`);
          this.components.push(temp_question_select_menu_comp);
        }

        const question_info = question_list[i];
        const option = { label: `${i+1}번째 문제`, description: `${question_info.data.answers}`, value: `${i}` };
        temp_question_select_menu.addOptions(option);
      }

      this.components.push(quiz_info_control_comp); //뒤로가기 버튼~
    }

    this.embed.description = description;
  }
  
  doQuizPlayEvent(interaction)
  {
    const guild = interaction.guild;
    const owner = interaction.member; //주최자
    const channel = interaction.channel;
    const quiz_info = this.quiz_info;

    if(interaction.customId == 'start') //시작 버튼 눌렀을 때
    {
      const check_ready = quiz_system.checkReadyForStartQuiz(guild, owner); //퀴즈를 플레이할 준비가 됐는지(음성 채널 참가 확인 등)
      if(check_ready == undefined || check_ready.result == false)
      {
        const reason = check_ready.reason;
        let reason_message = text_contents.quiz_info_ui.failed_start;
        reason_message = reason_message.replace("${reason}", reason);
        interaction.channel.send({content: reason_message});
        return;
      }

      if(quiz_info.question_list.length == 0)
      {
        interaction.channel.send({content: `>>> 이 퀴즈는 문제 수가 아직 0개여서 시작할 수 없습니다...😥`});
        return;
      }
      
      this.fillInfoAsDevQuizInfo(); 
      
      quiz_system.startQuiz(guild, owner, channel, quiz_info); //퀴즈 시작
      quiz_info.addPlayedCount(); //플레이 횟수 + 1

      return new AlertQuizStartUI(quiz_info, owner); 
    }

    if(interaction.customId == 'scoreboard') //순위표 버튼 눌렀을 때
    {
      //TODO 순위표 만들기
    }

    if(interaction.customId == 'settings') //설정 버튼 눌렀을 때
    {
      return new ServerSettingUI(interaction.guild.id);
    }

    if(interaction.customId == 'like') //추천하기 버튼 눌렀을 때
    {
      feedback_manager.addQuizLikeAuto(interaction, quiz_info.quiz_id, quiz_info.data.quiz_title);
      return;
    }
  }

  doQuizEditorEvent(interaction)
  {      
    //퀴즈만들기 통해서 왔을 경우임
    const quiz_info = this.quiz_info;

    if(interaction.isModalSubmit()) //모달 이벤트는 따로 처리
    {
      return this.doModalSubmitEvent(interaction);
    }

    if(interaction.customId.startsWith('question_select_menu#')) //문제 선택하기 메뉴 눌렀을 때
    {
      const select_index = parseInt(interaction.values[0]);
      return new UserQuestionInfoUI(this.quiz_info, select_index); //선택한 문제의 ui 전달
    }

    if(interaction.customId == 'quiz_tags_select_menu') //태그 선택하기 메뉴 눌렀을 때
    {
      this.editTagsInfo(interaction);
      return this;
    }

    if(interaction.customId == 'request_modal_question_add') //문제 추가 눌렀을 떄
    {
      interaction.showModal(modal_question_info);
      return;
    }

    if(interaction.customId == 'request_modal_quiz_edit') //퀴즈 정보 수정 눌렀을 때
    {
      const modal_current_quiz_info = cloneDeep(modal_quiz_info);
      const quiz_info = this.quiz_info;

      //현재 적용된 quiz_info 값으로 modal 띄워준다.(편의성)
      modal_current_quiz_info.components[0].components[0].setValue(quiz_info.data.quiz_title ?? ''); //title
      modal_current_quiz_info.components[1].components[0].setValue(quiz_info.data.simple_description ?? ''); //simple description
      modal_current_quiz_info.components[2].components[0].setValue(quiz_info.data.description ?? ''); //description
      modal_current_quiz_info.components[3].components[0].setValue(quiz_info.data.thumbnail ?? ''); //thumbnail

      interaction.showModal(modal_current_quiz_info);
      return;
    }

    if(interaction.customId == 'quiz_toggle_public') //퀴즈 공개/비공개 버튼
    {
      //비공개에서 공개로 전환할 경우
      if(quiz_info.data.is_private == true && (quiz_info.data.tags_value == undefined || quiz_info.data.tags_value == 0))
      {
        interaction.user.send({ content: ">>> 태그를 1개 이상 선택해주세요...ㅜㅜ 😥", ephemeral: true });
        return;
      }

      quiz_info.data.is_private = !quiz_info.data.is_private;

      logger.info(`Edited Quiz Public/Private...value:${quiz_info.data.is_private} quiz_id: ${quiz_info.quiz_id}`);

      quiz_info.saveDataToDB();

      this.refreshUI();
      return this;
    }

    if(interaction.customId == 'quiz_delete') //퀴즈 삭제 버튼
    {
      interaction.user.send({ content: `>>> **${text_contents.quiz_maker_ui.confirm_quiz_delete}**`, components: [quiz_delete_confirm_comp], ephemeral: true });
      return;
    }

    if(interaction.customId == 'quiz_delete_confirmed') //퀴즈 정말정말정말로 삭제 버튼
    {
      this.freeHolder(); //더 이상 UI 못 쓰도록
      interaction.user.send({ content: "```" + `${text_contents.quiz_maker_ui.quiz_deleted}${quiz_info.quiz_id}` + "```", ephemeral: true });
      interaction.message.delete();
      quiz_info.delete();
      return;
    }

    if(interaction.customId == 'quiz_delete_cancel') //퀴즈 삭제 취소 버튼
    {
      interaction.message.delete();
      return;
    }

  }

  doModalSubmitEvent(modal_interaction)
  {
    if(modal_interaction.customId == 'modal_quiz_info') //퀴즈 정보 수정 했을 경우임
    {
      this.editQuizInfo(modal_interaction);
      return this;
    }

    if(modal_interaction.customId == 'modal_question_info') //문제 새로 만들기한 경우임
    {
      const question_info_ui = new UserQuestionInfoUI(this.quiz_info, -1); //어떤 quiz의 question info ui 인가 전달, -1이면 표시하지 않음
      question_info_ui.addQuestion(modal_interaction);
      return question_info_ui;
    }
  }

  editQuizInfo(modal_interaction) 
  {
    const quiz_info = this.quiz_info;

    const quiz_title = modal_interaction.fields.getTextInputValue('txt_input_quiz_title');
    const quiz_thumbnail = modal_interaction.fields.getTextInputValue('txt_input_quiz_thumbnail');
    const quiz_simple_description = modal_interaction.fields.getTextInputValue('txt_input_quiz_simple_description');
    const quiz_description = modal_interaction.fields.getTextInputValue('txt_input_quiz_description');
    
    quiz_info.data.quiz_title = quiz_title;
    quiz_info.data.thumbnail = quiz_thumbnail;
    quiz_info.data.simple_description = quiz_simple_description;
    quiz_info.data.description = quiz_description;
    quiz_info.data.modified_time = new Date();

    quiz_info.saveDataToDB();
    this.refreshUI();

    modal_interaction.reply({ content: ">>> 퀴즈 정보를 수정하였습니다.", ephemeral: true });
    logger.info(`Edited Quiz info... quiz_id: ${quiz_info.quiz_id}`);
    // modal_interaction.deferUpdate();
  }

  editTagsInfo(select_interaction)
  {
    const quiz_info = this.quiz_info;

    let tags_value = 0;
    for(const tag_value of select_interaction.values)
    {
      tags_value += parseInt(tag_value);
    }
    quiz_info.data.tags_value = tags_value;

    // quiz_info.data.modified_time = new Date(); //일부러 뺐다 필요하면 넣어도된다.

    quiz_info.saveDataToDB();
    this.refreshUI();

    logger.info(`Edited Quiz Tag... quiz_id: ${quiz_info.quiz_id}`);
  }

  //TODO 컬럼미스
  /**  컬럼명을 고려하지 않은 명백한 설계미스다... 나중에 고쳐둬... */
  fillInfoAsDevQuizInfo() 
  {
    const quiz_info = this.quiz_info;

    quiz_info['title']  = quiz_info.data.quiz_title;
    quiz_info['icon'] = text_contents.icon.ICON_CUSTOM_QUIZ;

    quiz_info['type_name'] = quiz_info.data.simple_description; 
    quiz_info['description'] = quiz_info.data.description; 

    quiz_info['author'] = quiz_info.data.creator_name;
    quiz_info['author_icon'] = quiz_info.data.creator_icon_url;
    quiz_info['thumbnail'] = utility.isValidURL(quiz_info.data.thumbnail) ? quiz_info.data.thumbnail : ''; //썸네일은 그냥 quizbot으로 해두자

    quiz_info['quiz_size'] = quiz_info.question_list.length; 
    quiz_info['repeat_count'] = 1; //실제로는 안쓰는 값
    quiz_info['winner_nickname'] = quiz_info.data.winner_nickname;
    quiz_info['quiz_path'] = undefined;//dev quiz는 quiz_path 필요
    quiz_info['quiz_type'] = QUIZ_TYPE.CUSTOM;
    quiz_info['quiz_maker_type'] = QUIZ_MAKER_TYPE.CUSTOM;

    quiz_info['quiz_id'] = quiz_info.quiz_id;
  }


}

//퀴즈의 문제 정보
class UserQuestionInfoUI extends QuizbotUI
{

  constructor(quiz_info, question_index)
  {
    super();

    this.quiz_info = quiz_info;
    this.question_list = quiz_info.question_list;

    this.embed = {
      color: 0x05f1f1,
      title: `**${question_index+1}번째 문제**`,
      description: '데이터를 불러오는 중...\n잠시만 기다려주세요.',
      image: { //문제 이미지 표시
        url: '',
      },
      thumbnail: { //정답 이미지 표시
        url: '',
      },
      footer: { //문제 번호 표시
        text: `📦 ${question_index + 1} / ${this.question_list.length}`,
      },
    };

    this.current_question_info = undefined;
    this.current_question_index = question_index;

    this.components = [question_edit_comp, cloneDeep(question_edit_comp2), question_control_btn_component]; //문제 관련 comp

    this.displayQuestionInfo(question_index);
  }

  onInteractionCreate(interaction) 
  {
    if(interaction.isModalSubmit())
    {
      return this.doModalSubmitEvent(interaction);
    }

    if(interaction.isButton())
    {
      return this.doButtonEvent(interaction);
    }
  }

  doModalSubmitEvent(modal_interaction)
  {
    if(modal_interaction.customId == 'modal_question_info_edit'
      || modal_interaction.customId == 'modal_question_additional_info'
      || modal_interaction.customId == 'modal_question_answering_info')
    {
      this.editQuestionInfo(this.current_question_info, modal_interaction);
      return;
    }

    if(modal_interaction.customId == 'modal_question_info')
    {
      this.addQuestion(modal_interaction);
      return;
    }
  }

  doButtonEvent(interaction)
  {
    const question_info = this.current_question_info;
    if(interaction.customId == 'request_modal_question_info_edit')
    {
      const modal_current_question_info_edit = cloneDeep(modal_question_info_edit);

      modal_current_question_info_edit.components[0].components[0].setValue(question_info.data.answers ?? ''); 
      modal_current_question_info_edit.components[1].components[0].setValue(question_info.data.question_audio_url ?? ''); 
      modal_current_question_info_edit.components[2].components[0].setValue(question_info.data.audio_range_row ?? ''); 
      modal_current_question_info_edit.components[3].components[0].setValue(question_info.data.question_image_url ?? ''); 
      modal_current_question_info_edit.components[4].components[0].setValue(question_info.data.question_text ?? ''); 

      interaction.showModal(modal_current_question_info_edit);
      return;
    }

    if(interaction.customId == 'request_modal_question_additional_info')
    {
      const modal_current_question_additional_info = cloneDeep(modal_question_additional_info);

      modal_current_question_additional_info.components[0].components[0].setValue(question_info.data.hint ?? ''); 
      modal_current_question_additional_info.components[1].components[0].setValue(question_info.data.hint_image_url ?? ''); 
      modal_current_question_additional_info.components[2].components[0].setValue(question_info.data.use_answer_timer === true ? '사용' : ''); 

      interaction.showModal(modal_current_question_additional_info);
      return;
    }

    if(interaction.customId == 'request_modal_question_answering_info')
    {
      const modal_current_question_answering_info = cloneDeep(modal_question_answering_info);

      modal_current_question_answering_info.components[0].components[0].setValue(question_info.data.answer_audio_url ?? ''); 
      modal_current_question_answering_info.components[1].components[0].setValue(question_info.data.answer_audio_range_row ?? ''); 
      modal_current_question_answering_info.components[2].components[0].setValue(question_info.data.answer_image_url ?? ''); 
      modal_current_question_answering_info.components[3].components[0].setValue(question_info.data.answer_text ?? ''); 

      interaction.showModal(modal_current_question_answering_info);
      return;
    }

    if(interaction.customId == 'question_refresh')
    {
      this.displayQuestionInfo(this.current_question_index);
      return this;
    }

    if(interaction.customId == 'request_modal_question_add')
    {
      interaction.showModal(modal_question_info);
      return;
    }

    if(interaction.customId == 'question_delete')
    {
      const index_to_remove = this.question_list.indexOf(this.current_question_info);
      if(index_to_remove != -1)
      {
        this.question_list.splice(index_to_remove, 1); 
      }
 
      const question_info = this.current_question_info;
      question_info.delete();
      this.quiz_info.updateModifiedTime();
      
      logger.info(`Deleted Question... question_id: ${question_info.question_id}, user_id: ${interaction.user.id}`);

      this.current_question_info = undefined;

      if(this.question_list.length == 0) //더 이상 표시할게 없다면
      {
        this.current_question_index = -1;
        this.goToBack();
        return;
      }
      else
      {
        this.current_question_index = (this.current_question_index + 1) > this.question_list.length ? this.question_list.length : this.current_question_index + 1;
        return this.goToPrevQuestion();
      }
    }

    if(interaction.customId == 'prev_question')
    {
      return this.goToPrevQuestion();
    }

    if(interaction.customId == 'next_question')
    {
      return this.goToNextQuestion();
    }
  }

  goToPrevQuestion()
  {
    if(this.current_question_index > 0)
    {
      this.displayQuestionInfo(--this.current_question_index);
      return this;
    }
    return undefined;
  }

  goToNextQuestion()
  {
    if(this.current_question_index < this.question_list.length - 1)
    {
      this.displayQuestionInfo(++this.current_question_index);
      return this;
    }
    return undefined;
  }

  displayQuestionInfo(question_index)
  {
    const question_list = this.question_list;

    if(question_index < 0 || question_index >= question_list.length) //이상한거 조회 요청하면
    {
      return;
    }

    const question_info = question_list[question_index];
    this.current_question_info = question_info;

    //url valid check, 값 없으면 true로
    const is_valid_question_audio_url = ((question_info.data.question_audio_url ?? '').length == 0) || ytdl.validateURL(question_info.data.question_audio_url);
    const is_valid_question_image_url = ((question_info.data.question_image_url ?? '').length == 0) || utility.isValidURL(question_info.data.question_image_url);

    const is_valid_hint_image_url = ((question_info.data.hint_image_url ?? '').length == 0) || utility.isValidURL(question_info.data.hint_image_url);
    
    const is_valid_answer_audio_url = ((question_info.data.answer_audio_url ?? '').length == 0) || ytdl.validateURL(question_info.data.answer_audio_url);
    const is_valid_answer_image_url = ((question_info.data.answer_image_url ?? '').length == 0) || utility.isValidURL(question_info.data.answer_image_url);

    //convert range row to string
    const question_audio_range_string = this.convertAudioRangeToString(question_info.data.audio_start, question_info.data.audio_end, 'question');
    const answer_audio_range_string = this.convertAudioRangeToString(question_info.data.answer_audio_start, question_info.data.answer_audio_end, 'answer');

    /** display */
    this.embed.title = `**[ 📁 ${question_index+1}번째 문제** ]`;
    this.embed.image.url = is_valid_question_image_url ? question_info.data.question_image_url : '';
    this.embed.thumbnail.url = is_valid_answer_image_url ? question_info.data.answer_image_url : '';
    this.embed.footer.text = `📦 ${question_index + 1} / ${this.question_list.length} 문제`;

    let description = '';
    description += "------ 기본 정보 ------\n\n";
    description += `🔸 정답: **[${question_info.data.answers}]**\n\n`;
    description += `🔸 문제 제출시 음악:\n**[${question_info.data.question_audio_url ?? ''}]**\n`;
    if(is_valid_question_audio_url == false)
    {
      description += '```⚠ __해당 오디오 URL은 사용이 불가능합니다.__```';
    }
    description += "\n\n";

    description += `🔸 음악 재생 구간: **${question_audio_range_string}**\n\n`;

    description += `🔸 문제 제출시 이미지:\n**[${question_info.data.question_image_url ?? ''}]**\n`;
    if(is_valid_question_image_url == false)
    {
      description += '```⚠ __해당 이미지 URL은 사용이 불가능합니다.__```';
    }
    else
    {
      // description += `__만약 이미지 로딩이 안된다면 다른 URL 사용을 권장합니다.__`;
    }

    if(question_info.data.question_image_url?.includes('cdn.discordapp.com')) //디코에 올린거로는 안됨. 시간 지나면 사라짐
    {
      description += '```❗ 디스코드에 업로드하신 이미지 URL 같아요.\n이 경우 일정 시간이 지나면 이미지가 삭제돼요...```';
    }
    description += "\n\n";

    description += `🔸 문제 제출시 텍스트:\n**[${question_info.data.question_text ?? ''}]**\n\n`;


    description += "------ 추가 정보 ------\n\n";
    description += `🔸 힌트: **[${ ( (question_info.data.hint ?? '').length == 0 ? '자동 지정' : question_info.data.hint) }]**\n\n`;
    description += `🔸 힌트용 이미지:\n**[${question_info.data.hint_image_url ?? ''}]**\n`;
    if(is_valid_hint_image_url == false)
    {
      description += '```⚠ __해당 이미지 URL은 사용이 불가능합니다.__```';
    }

    if(question_info.data.hint_image_url?.includes('cdn.discordapp.com')) //디코에 올린거로는 안됨. 시간 지나면 사라짐
    {
      description += '```❗ 디스코드에 업로드하신 이미지 URL 같아요.\n이 경우 일정 시간이 지나면 이미지가 삭제돼요...```';
    }
    description += "\n\n";

    description += `🔸 정답 여유 시간 여부: **[${(question_info.data.use_answer_timer == true ? '예' : '아니요')}]**\n`;
    description += "\n";

    description += "------ 정답 이벤트 정보 ------\n\n";
    description += `🔸 정답용 음악:\n**[${question_info.data.answer_audio_url ?? ''}]**\n`;
    if(is_valid_answer_audio_url == false)
    {
      description += '```⚠ __해당 오디오 URL은 사용이 불가능합니다.__```';
    }
    description += "\n\n";

    description += `🔸 정답용 음악 재생 구간: **${answer_audio_range_string}**\n\n`;

    description += `🔸 정답용 이미지:\n**[${question_info.data.answer_image_url ?? ''}]**\n`;
    if(is_valid_answer_image_url == false)
    {
      description += '```⚠ __해당 이미지 URL은 사용이 불가능합니다.__```';
    }

    if(question_info.data.answer_image_url?.includes('cdn.discordapp.com')) //디코에 올린거로는 안됨. 시간 지나면 사라짐
    {
      description += '```❗ 디스코드에 업로드하신 이미지 URL 같아요.\n이 경우 일정 시간이 지나면 이미지가 삭제돼요...```';
    }
    description += "\n\n";
    
    description += `🔸 정답용 텍스트:\n**[${question_info.data.answer_text ?? ''}]**\n\n`;

    description += `---------------------\n\n`;

    this.embed.description = description;

    if(question_list.length >= 50) //최대 50개까지만 문제 만들 수 있음
    {
      this.components[1].components[0].setDisabled(true); //이게 새로운 문제 만들기 버튼임
    }
  }

  convertAudioRangeToString(audio_start, audio_end, type) //range value 값 받아서 info 표시용 string 으로 변환
  {
    let audio_range_string = '[랜덤 구간 재생]'; //이게 디폴트

    if(audio_start != undefined)
    {
      audio_range_string = `[${audio_start}초 ~ `;

      if(audio_end == undefined)
      {
        audio_range_string += '음악 끝까지]';
      }
      else
      {
        audio_range_string += `${audio_end}초]`;
      }

      audio_range_string += `\n(이 구간 내에서 무작위로 최대 ${type == 'question' ? SYSTEM_CONFIG.max_question_audio_play_time : SYSTEM_CONFIG.max_answer_audio_play_time}초만 재생)`;
    }

    return audio_range_string;
  }

  applyQuestionInfo(user_question_info, modal_interaction)
  {
    const input_question_answers = modal_interaction.fields.getTextInputValue('txt_input_question_answers');
    const input_question_audio_url = modal_interaction.fields.getTextInputValue('txt_input_question_audio_url');
    const input_question_audio_range = modal_interaction.fields.getTextInputValue('txt_input_question_audio_range');
    const input_question_image_url = modal_interaction.fields.getTextInputValue('txt_input_question_image_url');
    const input_question_text = modal_interaction.fields.getTextInputValue('txt_input_question_text');

    user_question_info.data.quiz_id = this.quiz_info.quiz_id;

    user_question_info.data.answers = input_question_answers;
    user_question_info.data.question_audio_url = input_question_audio_url;
    
    user_question_info.data.audio_range_row = input_question_audio_range; //row 값도 저장

    // 필요 없다
    // if(input_question_audio_range != undefined
    //   && input_question_audio_range != ''
    //   && input_question_audio_range.split("~").length == 1) //~ 안치고 숫자 1개만 쳤다면
    // {
    //   user_question_info.data.audio_range_row += " ~ "; //물결 붙여줌
    // }

    const [audio_start_value, audio_end_value, audio_play_time] = this.parseAudioRangePoints(input_question_audio_range);

    user_question_info.data.audio_start = audio_start_value;
    user_question_info.data.audio_end = audio_end_value;
    user_question_info.data.audio_play_time = audio_play_time;

    user_question_info.data.question_image_url = input_question_image_url;
    user_question_info.data.question_text = input_question_text;
  }

  applyQuestionAdditionalInfo(user_question_info, modal_interaction)
  {
    const input_hint = modal_interaction.fields.getTextInputValue('txt_input_hint');
    const input_hint_image_url = modal_interaction.fields.getTextInputValue('txt_input_hint_image_url');
    const input_use_answer_timer = modal_interaction.fields.getTextInputValue('txt_input_use_answer_timer');

    user_question_info.data.quiz_id = this.quiz_info.quiz_id;

    user_question_info.data.hint = input_hint ?? "";
    user_question_info.data.hint_image_url = input_hint_image_url ?? "";
    user_question_info.data.use_answer_timer = (input_use_answer_timer.length == 0 ? false : true);
  }

  applyQuestionAnsweringInfo(user_question_info, modal_interaction)
  {
    const input_answering_audio_url = modal_interaction.fields.getTextInputValue('txt_input_answering_audio_url');
    const input_answering_audio_range = modal_interaction.fields.getTextInputValue('txt_input_answering_audio_range');
    const input_answering_image_url = modal_interaction.fields.getTextInputValue('txt_input_answering_image_url');
    const input_answering_text = modal_interaction.fields.getTextInputValue('txt_input_answering_text');

    user_question_info.data.quiz_id = this.quiz_info.quiz_id;

    user_question_info.data.answer_audio_url = input_answering_audio_url ?? "";
    user_question_info.data.answer_image_url = input_answering_image_url ?? "";
    user_question_info.data.answer_text = input_answering_text ?? "";

    user_question_info.data.answer_audio_range_row = input_answering_audio_range;

    const [audio_start_value, audio_end_value, audio_play_time] = this.parseAudioRangePoints(input_answering_audio_range);

    user_question_info.data.answer_audio_start = audio_start_value;
    user_question_info.data.answer_audio_end = audio_end_value;
    user_question_info.data.answer_audio_play_time = audio_play_time;
  }

  parseAudioRangePoints(audio_range_row)
  {
    if(audio_range_row.undefined || audio_range_row.length == 0) //생략 시,
    {
      return [undefined, undefined, undefined];
    }

    audio_range_row = audio_range_row.trim();
    if(audio_range_row.endsWith('~')) //25 ~ 이런식으로 쳤으면 ~ 제거
    {
      audio_range_row = audio_range_row.slice(0, audio_range_row.length - 1);
    }

    if(audio_range_row.length == 0) //정제하니깐 생략 시,
    {
      return [undefined, undefined, undefined];
    }

    const audio_range_split = audio_range_row.split('~');
    
    let audio_start = audio_range_split[0].trim();
    let audio_end = (audio_range_split.length >= 2 ? audio_range_split[1].trim() : undefined);
    let audio_play_time = undefined;

    let audio_start_value = (isNaN(audio_start) || audio_start < 0) ? undefined : Math.floor(audio_start); //소수점과 음수값일 경우 처리
    let audio_end_value = (isNaN(audio_end) || audio_end < 0) ? undefined : Math.floor(audio_end);

    if(audio_start_value != undefined 
      && audio_end_value != undefined) 
    {
      if(audio_start_value > audio_end_value) //start > end 처리
      {
        const temp = audio_start_value;
        audio_start_value = audio_end_value;
        audio_end_value = temp;
      }

      audio_play_time = (audio_end_value - audio_start_value);
    }

    return [audio_start_value, audio_end_value, audio_play_time];
  }

  async addQuestion(modal_interaction)
  {
    if(this.question_list != undefined && this.question_list.length >= 50) //최대 50개까지만 문제 만들 수 있음
    {
        modal_interaction.reply({ content: `>>> 하나의 퀴즈에는 최대 50개까지만 문제를 만들 수 있습니다..`, ephemeral: true });
      return;
    }

    let user_question_info = new UserQuestionInfo();
    
    this.applyQuestionInfo(user_question_info, modal_interaction); //채우고 저장해주자
    const question_id = await user_question_info.saveDataToDB();

    if(question_id == undefined)
    {
      modal_interaction.reply({ content: `>>> ${this.quiz_info.quiz_id} / ${modal_interaction.user.id}에서 문제를 생성하는데 실패했습니다...😓.\n해당 문제가 지속될 경우 otter6975@gmail.com 이나 디스코드 DM으로 문의 바랍니다.`, ephemeral: true });
      return;
    }

    this.quiz_info.updateModifiedTime();

    modal_interaction.deferUpdate();
    
    this.current_question_index = this.question_list.push(user_question_info) - 1; //새로 추가했으면 무조건 마지막에 넣었을테니
    this.displayQuestionInfo(this.current_question_index); 

    this.sendDelayedUI(this, true); //24.05.07 embed 이미지 버그에 따라 새로운 문제면 resend
    
    logger.info(`Created New Question... question_id: ${user_question_info.question_id}/${question_id}, user_id: ${modal_interaction.user.id}}, quiz_title: ${this.quiz_info.data.quiz_title}`);
  }

  async editQuestionInfo(user_question_info, modal_interaction)
  {
    if(user_question_info == undefined)
    {
      logger.info(`Failed edit Question info, current_question_info is undefined quiz_id: ${this.quiz_info.quiz_id}, current_question_index: ${this.current_question_index}`);
      return;
    }

    const previous_question_image_url = user_question_info.data.question_image_url; 
    //const previous_hint_image_url = user_question_info.data.hint_image_url; //어차피 hint 이미지는 미리보기 없으니 제외
    const previous_answer_image_url = user_question_info.data.answer_image_url;

    if(modal_interaction.customId == 'modal_question_info_edit')
    {
      this.applyQuestionInfo(user_question_info, modal_interaction);
    }
    else if(modal_interaction.customId == 'modal_question_additional_info')
    {
      this.applyQuestionAdditionalInfo(user_question_info, modal_interaction);
    }
    else if(modal_interaction.customId == 'modal_question_answering_info')
    {
      this.applyQuestionAnsweringInfo(user_question_info, modal_interaction);
    }

    const question_id = await user_question_info.saveDataToDB();

    if(question_id == undefined)
    {
      modal_interaction.reply({content: `>>> ${this.quiz_info.quiz_id} / ${modal_interaction.user.id}에서 문제를 저장하는데 실패했습니다...😓.\n해당 문제가 지속될 경우 otter6975@gmail.com 이나 디스코드 DM으로 문의 바랍니다.`, ephemeral: true});
      return;
    }

    this.quiz_info.updateModifiedTime();

    modal_interaction.deferUpdate();

    this.displayQuestionInfo(this.current_question_index);    
    
    //24.05.07 embed 이미지 로드 간혈적으로 안되는 원인 안 것 같다.
    //embed를 새로 생성하는 것이 아닌 edit을 했을 때, 새로운 이미지 url을 사용하면 이게 바로 바로 로드가 안된다.
    //백그라운드에서 로드는 되는데, 로드 완료 후 표시를 안하는 듯하다.
    //따라서 이미지 url 변경일 경우에는 resend
    if(previous_question_image_url != user_question_info.data.question_image_url
      || previous_answer_image_url != user_question_info.data.answer_image_url) //이미지 url이 뭐라도 바뀌었다면
    {
      this.sendDelayedUI(this, true);
    }
    else
    {
      this.update(); //ui update -> 단순 업데이트
    }
    
    logger.info(`Edited Question... question_id: ${user_question_info.question_id}/${question_id}`);
  }

}

class UserQuizSelectUI extends QuizBotControlComponentUI  
{
  constructor()
  {
    super();

    this.all_user_quiz_contents = undefined;
    this.selected_tags_value = 0;
    this.selected_keyword_value = undefined;

    this.selected_sort_by_value = 'modified_time';
    this.sort_by_select_menu = cloneDeep(sort_by_select_menu); //아예 deep copy해야함
    this.search_tag_select_menu = cloneDeep(quiz_search_tags_select_menu); //아예 deep copy해야함

    this.embed = {
      color: 0x05f1f1,
      title: text_contents.user_select_category.title,
      url: text_contents.user_select_category.url,
      description: '퀴즈 목록을 불러오는 중...\n잠시만 기다려주세요.🙂',
    };

    this.components[2].components[2] = btn_search; //점프 버튼을 검색 버튼으로 대체, this.components는 clonedeep이라 그냥 바꿔도 된다.
    this.components.push(this.sort_by_select_menu);
    this.components.push(this.search_tag_select_menu);
  }

  onReady() //ui 등록 됐을 때
  {
    this.loadAllUserQuizList(undefined); //여기서 ui 업데이트함
  }

  onInteractionCreate(interaction)
  {
    if(this.cur_contents == undefined)
    {
      return undefined;
    }

    if(!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return;

    if(interaction.customId == "sort_by_select") //정렬 방식 선택한 경우
    {
      this.reorderQuizInfoList(interaction.values[0]); //재정렬 ㄱㄱ
      this.displayContents(this.cur_page);
      return this;
    }

    if(interaction.customId == 'quiz_search_tags_select_menu')
    {
      const selected_tags_value = interaction.values[0];
      this.filterByTag(selected_tags_value);

      this.cur_page = 0;
      this.displayContents(this.cur_page);
      return this;
    }

    //점프 버튼 눌렀을 때임
    if(interaction.customId == 'request_modal_complex_page_jump')
    {
      interaction.showModal(modal_complex_page_jump); //페이지 점프 입력 모달 전달
      return undefined;
    }

    let force_refresh = false;
    if(interaction.customId == 'modal_complex_page_jump') //키워드 검색을 먼저 본다.
    {
      const input_keyword_value = interaction.fields.getTextInputValue('txt_input_keyword');

      this.filterByKeyword(input_keyword_value);

      this.cur_page = 0;
      this.displayContents(this.cur_page); 

      if(input_keyword_value == undefined || input_keyword_value == '')
      {
        interaction.channel.send({content: `>>> 모든 퀴즈를 표시합니다.`});
      }
      else
      {
        interaction.channel.send({content: `>>> **${input_keyword_value}** 에 대한 검색 결과입니다.`});
      }

      force_refresh = true;
    }
    
    const is_page_move = this.checkPageMove(interaction);
    if(is_page_move == undefined && force_refresh == false) return;
    if(is_page_move == true || force_refresh == true) return this;

    const select_num = parseInt(interaction.customId);
    if(isNaN(select_num) || select_num < 0 || select_num > 10) return; //1~10번 사이 눌렀을 경우만

    // 그냥 페이지 계산해서 content 가져오자
    const index = (this.count_per_page * this.cur_page) + select_num - 1; //실제로 1번을 선택했으면 0번 인덱스를 뜻함

    if(index >= this.cur_contents.length) //범위 넘어선걸 골랐다면
    {
      return;
    }

    const user_quiz_info = this.cur_contents[index]; //퀴즈를 선택했을 경우

    return new UserQuizInfoUI(user_quiz_info, true); //readonly true로 넘겨야함
    
  }

  async loadAllUserQuizList()
  {
    const user_quiz_list = await loadUserQuizListFromDB(undefined); //전체 조회

    for(let user_quiz_info of user_quiz_list) 
    {
      user_quiz_info.name = `**${user_quiz_info.data.quiz_title}**\n🔸) ${user_quiz_info.data.simple_description}`;
    }

    this.all_user_quiz_contents = user_quiz_list ?? [];
    this.cur_contents = this.all_user_quiz_contents;
    this.main_description = text_contents.user_select_category.description;

    this.displayContents(0);
    this.update();
  }

  reorderQuizInfoList(selected_sort_by_value)
  {
    if(this.selected_sort_by_value == selected_sort_by_value) return; //바뀐게 없다면 return
    
    this.selected_sort_by_value = selected_sort_by_value;

    this.selectDefaultOptionByValue(this.sort_by_select_menu.components[0], selected_sort_by_value);

    if(this.selected_sort_by_value.endsWith("_reverse")) //거꾸로 정렬이면
    {
      const selected_sort_by_value = this.selected_sort_by_value.substring(0, this.selected_sort_by_value.length - "_reverse".length);
      this.cur_contents.sort((a, b) => a.data[selected_sort_by_value] - b.data[selected_sort_by_value]); //오름차순(오래된 퀴즈순)
    }
    else
    {
      this.cur_contents.sort((a, b) => b.data[this.selected_sort_by_value] - a.data[this.selected_sort_by_value]); //내림차순(최근 퀴즈순)
    }

    this.displayContents(this.current_question_index);
  }

  filterByTag(selected_tags_value) //태그로
  {
    if(this.selected_tags_value == selected_tags_value) //같으면 패스
    {
      return;
    }

    this.selected_tags_value = selected_tags_value;

    this.selectDefaultOptionByValue(this.search_tag_select_menu.components[0], selected_tags_value);

    let filtered_contents = [];
    for(const quiz_info of this.all_user_quiz_contents)
    {
      const quiz_tags_value = quiz_info.data.tags_value;
      if((quiz_tags_value & selected_tags_value) != selected_tags_value) //비트 마스킹
      {
        continue;
      }

      filtered_contents.push(quiz_info);
    }

    this.cur_contents = filtered_contents;
  }


  filterByKeyword(selected_keyword_value) //검색어로
  {
    if(this.selected_keyword_value == selected_keyword_value) //같으면 패스
    {
      return;
    }

    if(selected_keyword_value == undefined || selected_keyword_value == "") //아무것도 입력 안 입력했다면 전체로 설정하고 패스
    {
      this.cur_contents = this.all_user_quiz_contents;
    }

    this.selected_keyword_value = selected_keyword_value;

    let filtered_contents = [];
    for(const quiz_info of this.all_user_quiz_contents)
    {
      if(
        quiz_info.data.quiz_title?.includes(selected_keyword_value)
        || quiz_info.data.simple_description?.includes(selected_keyword_value)
        || quiz_info.data.description?.includes(selected_keyword_value)
        || quiz_info.data.creator_name?.includes(selected_keyword_value)
        ) 
      {
        filtered_contents.push(quiz_info);
        continue;
      }
    }

    this.cur_contents = filtered_contents;
  }
}

/** OMAKASE QUIZ Room*/
//오마카세 퀴즈 설정 용. 로비 형식임
class OmakaseQuizRoomUI extends QuizbotUI
{
  static createDefaultOmakaseQuizInfo = (interaction) =>
  {
    const guild = interaction.guild;
    let quiz_info = {};

    quiz_info['title']  = "오마카세 퀴즈";
    quiz_info['icon'] = '🍴';

    quiz_info['type_name'] = "**퀴즈봇 마음대로 퀴즈!**"; 
    quiz_info['description'] = "장르 선택 메뉴에서 플레이하실 퀴즈 장르를 선택해주세요!\n\n선택하신 장르에 따라 퀴즈봇이 문제를 제출합니다.\n장르는 여러 개 선택 가능합니다!\n\n"; 

    quiz_info['author'] = guild.name ?? guild.id;
    quiz_info['author_icon'] = guild.iconURL() ?? '';
    quiz_info['thumbnail'] = ''; //썸네일은 고정 이미지가 있지롱 ㅎ

    quiz_info['quiz_size'] = 50; //default
    quiz_info['repeat_count'] = 1; //실제로는 안쓰는 값
    quiz_info['winner_nickname'] = "플레이어";
    quiz_info['quiz_path'] = undefined;//oamakase quiz는 quiz_path 불필요
    quiz_info['quiz_type'] = QUIZ_TYPE.OMAKASE;
    quiz_info['quiz_maker_type'] = QUIZ_MAKER_TYPE.OMAKASE;

    quiz_info['quiz_id'] = undefined;  //omasakse quiz는 quiz_id 불필요

    //오마카세 퀴즈용 추가 설정 값
    quiz_info['dev_quiz_tags'] = 0;
    
    quiz_info['custom_quiz_type_tags'] = 0;
    quiz_info['custom_quiz_tags'] = 0;

    quiz_info['max_question_count'] = 50; //default

    quiz_info['room_owner'] = interaction.member;

    return quiz_info;
  }

  constructor(quiz_info)
  {
    super();

    this.quiz_info = quiz_info;
    this.custom_quiz_warned = false; //커스텀 퀴즈 설정 시 주의 사항 안내했는지 여부

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

    this.refreshUI();

    this.components = [omakase_quiz_info_comp, omakase_dev_quiz_tags_select_menu, omakase_custom_quiz_type_tags_select_menu, omakase_custom_quiz_tags_select_menu]; //여기서는 component를 바꿔서 해주자
  }

  onInteractionCreate(interaction) 
  {
    if(!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return;

    if(interaction.customId == 'start') //시작 버튼 눌렀을 때
    {
      const quiz_info = this.quiz_info;

      if(quiz_info['dev_quiz_tags'] == 0
        && (quiz_info['custom_quiz_type_tags'] == 0)
      )
      {
        interaction.channel.send({content: ">>> 시작하시려면 퀴즈 유형 및 장르를 1개라도 선택해주세요!"});
        return;        
      }

      const guild = interaction.guild;
      const owner = interaction.member; //주최자
      const channel = interaction.channel;

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

    if(interaction.customId == 'scoreboard') //순위표 버튼 눌렀을 때
    {
      //TODO 순위표 만들기
    }

    if(interaction.customId == 'settings') //설정 버튼 눌렀을 때
    {
      return new ServerSettingUI(interaction.guild.id);
    }

    /** 오마카세 퀴즈 전용*/
    if(interaction.customId == 'request_modal_omakase_setting') //오마카세 설정 버튼 눌렀을 때
    {
      interaction.showModal(modal_omakase_setting); //퀴즈 생성 모달 전달
      return;
    }

    if(interaction.customId == 'modal_omakase_setting') //오마카세 설정 값 제출 시,
    {
      return this.applyOmakaseSettings(interaction);
    }

    if(interaction.customId == 'dev_quiz_tags_select_menu'
      || interaction.customId == 'custom_quiz_type_tags_select_menu'
      || interaction.customId == 'custom_quiz_tags_select_menu') //퀴즈 장르 설정 시
    {
      return this.applyQuizTagsSetting(interaction);
    }
  }

  applyOmakaseSettings(interaction)
  {
    const quiz_info = this.quiz_info;
    const room_owner = quiz_info['room_owner'];

    // if(room_owner.id != interaction.member.id)
    // {
    //   interaction.reply({content: `>>> 방장인 ${room_owner.displayName} 님만 설정이 가능합니다.`, ephemeral: true});
    //   return undefined;
    // }

    const input_max_question_count = interaction.fields.getTextInputValue('txt_input_max_question_count');

    if(input_max_question_count == undefined || input_max_question_count == '')
    {
      interaction.deferUpdate(); //defer은 해준다.
      return undefined;
    }

    const max_question_count = parseInt(input_max_question_count.trim());
    if(isNaN(max_question_count) || max_question_count <= 0) //입력 값 잘못된거 처리
    {
      interaction.reply({content: `>>> 문제 수 설정에 입력된 ${input_max_question_count} 값은 잘못됐습니다.\n양수의 숫자만 입력해주세요.`, ephemeral: true});
      return undefined;
    }

    if(max_question_count > 100)
    {
      max_question_count = 100;
    }
    
    interaction.reply({content: `>>> 제출할 문제 수를 ${max_question_count}개로 설정했습니다.`, ephemeral: true});
    quiz_info['quiz_size'] = max_question_count;
    quiz_info['max_question_count'] = max_question_count;

    this.refreshUI();
    return this;
  }

  calcTagsValue(values)
  {
    let tags_value = 0;
    for(const tag_value of values)
    {
      tags_value += parseInt(tag_value);
    }
    return tags_value;
  }

  applyQuizTagsSetting(interaction)
  {
    const quiz_info = this.quiz_info;
    const tags_value = this.calcTagsValue(interaction.values);

    let tags_value_type = 'dev_quiz_tags';
    if(interaction.customId == 'dev_quiz_tags_select_menu') //공식 퀴즈 장르 설정 시
    {
      tags_value_type = 'dev_quiz_tags';
    }
    else if(interaction.customId == 'custom_quiz_type_tags_select_menu') //유저 퀴즈 유형 설정 시
    {
      tags_value_type = 'custom_quiz_type_tags';
      this.sendCustomQuizWarning(interaction.channel);
    }
    else if(interaction.customId == 'custom_quiz_tags_select_menu') //유저 퀴즈 장르 설정 시
    {
      tags_value_type = 'custom_quiz_tags';
      this.sendCustomQuizWarning(interaction.channel);
    }
    
    const previous_tags_value = quiz_info[tags_value_type];
    if(previous_tags_value == tags_value) //같으면 할 게 없다
    {
      return undefined; 
    } 

    quiz_info[tags_value_type] = tags_value;
    
    this.refreshUI();
    return this;
  }

  customQuizTypeTagsSetting(interaction)
  {
    const quiz_info = this.quiz_info;

    let tags_value = 0;
    for(const tag_value of interaction.values)
    {
      tags_value += parseInt(tag_value);
    }
    quiz_info['dev_quiz_tags'] = tags_value;
  }

  customQuizTagsSetting(interaction)
  {
    const quiz_info = this.quiz_info;

    let tags_value = 0;
    for(const tag_value of interaction.values)
    {
      tags_value += parseInt(tag_value);
    }
    quiz_info['dev_quiz_tags'] = tags_value;
  }

  refreshUI()
  {
    const quiz_info = this.quiz_info;
    let description = text_contents.quiz_info_ui.description;

    description = description.replace('${quiz_type_name}', `${quiz_info['type_name']}`);
    description = description.replace('${quiz_size}', `${quiz_info['quiz_size']}`);
    description = description.replace('${quiz_description}', `${quiz_info['description']}`);
    
    let tag_info_text = "\n";

    tag_info_text += `📕 **공식 퀴즈 설정**\n`;
    const dev_quiz_tags = quiz_info['dev_quiz_tags'];
    let dev_quiz_tags_string = utility.convertTagsValueToString(dev_quiz_tags, SYSTEM_CONFIG.DEV_QUIZ_TAG);
    if(dev_quiz_tags_string == '')
    {
      dev_quiz_tags_string = '선택 안함';
    }

    tag_info_text += '🔸 퀴즈 유형: `음악 퀴즈`\n';
    tag_info_text += '🔹 퀴즈 장르: `' + (dev_quiz_tags_string) + '`\n';
    tag_info_text += "\n";

    tag_info_text += `📘 **유저 퀴즈 설정(베타)**\n`;
    const custom_quiz_type_tags = quiz_info['custom_quiz_type_tags'];
    let custom_quiz_type_tags_string = utility.convertTagsValueToString(custom_quiz_type_tags, SYSTEM_CONFIG.QUIZ_TAG);
    if(custom_quiz_type_tags_string == '')
    {
      custom_quiz_type_tags_string = '선택 안함';
    }

    const custom_quiz_tags = quiz_info['custom_quiz_tags'];
    let custom_quiz_tags_string = utility.convertTagsValueToString(custom_quiz_tags, SYSTEM_CONFIG.QUIZ_TAG);
    if(custom_quiz_type_tags != 0 && custom_quiz_tags == 0) //유저 퀴즈 유형에 뭐라도 선택했다?
    {
      custom_quiz_tags_string = '모든 장르(분류되지 않은 퀴즈 포함)';
    }
    else if(custom_quiz_tags_string == '')
    {
        custom_quiz_tags_string = '선택 안함';
    }
    
    tag_info_text += '🔸 퀴즈 유형: `' + (custom_quiz_type_tags_string) + '`\n';
    tag_info_text += '🔹 퀴즈 장르: `' + (custom_quiz_tags_string) + '`\n';
    tag_info_text += "\n";

    description += tag_info_text + " \n";

    this.embed.description = description;
  }

  sendCustomQuizWarning(channel)
  {
    if(this.custom_quiz_warned == true)
    {
      return;
    }

    this.custom_quiz_warned = true;
    const warn_message = "```⚠ 주의! 오마카세 퀴즈에서 유저 퀴즈를 설정하셨습니다.\n공식 퀴즈와 달리 유저 퀴즈는 장르 구분이 정확하지 않을 수 있습니다.\n또한 유저 퀴즈는 플레이 중 오류가 발생할 수 있으니 주의 바랍니다.```"
    channel.send({content: warn_message});
  }
}


//#endregion