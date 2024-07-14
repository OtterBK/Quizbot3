'use strict';

//#region 필요한 외부 모듈
const { RESTJSONErrorCodes} = require('discord.js');
//#endregion

//#region 로컬 modules
const { SYSTEM_CONFIG, CUSTOM_EVENT_TYPE } = require('../../config/system_setting.js');
const logger = require('../../utility/logger.js')('QuizUI');

const { MainUI } = require("./main-ui.js");
const { UserQuizListUI } = require("./user-quiz-list-ui.js");

//#endregion

/** global 변수 **/
let ui_holder_map = {}; //UI holdermap은 그냥 quizbot-ui 에서 가지고 있게 하자
let bot_client = undefined;

//#region exports 정의
/** exports **/
//main embed 인스턴스 반환
const initialize = (client) => {
  if(client == undefined)
  {
      logger.error(`Failed to Initialize Quiz system. ${'Client is undefined'}`);
      return false;
  }
  bot_client = client;

  return true;
}

//퀴즈 플레이 툴
const createMainUIHolder = (interaction) => {
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
const createQuizToolUIHolder = (interaction) => { 
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

const getUIHolder = (holder_id) => {
  if(ui_holder_map.hasOwnProperty(holder_id) == false)
  {
    return undefined;
  }

  return ui_holder_map[holder_id];
}

const startUIHolderAgingManager = () => 
{
  return uiHolderAgingManager();
}

//#endregion

//#region UI 관리 함수들
/** UI 관련 함수들 **/
//UI holder Aging Manager
const uiHolderAgingManager = () =>
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

//#endregion

module.exports = { initialize, createMainUIHolder, createQuizToolUIHolder, getUIHolder, startUIHolderAgingManager, uiHolderAgingManager, UIHolder }