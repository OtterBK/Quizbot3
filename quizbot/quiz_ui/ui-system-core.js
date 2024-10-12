'use strict';

//#region 필요한 외부 모듈
const { RESTJSONErrorCodes} = require('discord.js');
//#endregion

//#region 로컬 modules
const { SYSTEM_CONFIG, CUSTOM_EVENT_TYPE } = require('../../config/system_setting.js');
const logger = require('../../utility/logger.js')('QuizUI');

const { MainUI } = require("./main-ui.js");
const { UserQuizListUI } = require("./user-quiz-list-ui.js");
const { MultiplayerQuizLobbyUI } = require('./multiplayer-quiz-lobby-ui.js');

//#endregion

/** global 변수 **/
let ui_holder_map = {}; //UI holdermap은 그냥 quizbot-ui 에서 가지고 있게 하자
let bot_client = undefined;

//#region exports 정의
/** exports **/
//main embed 인스턴스 반환
const initialize = (client) => 
{
  if(client === undefined)
  {
    logger.error(`Failed to Initialize Quiz system. ${'Client is undefined'}`);
    return false;
  }
  bot_client = client;

  return true;
};

//퀴즈 플레이 툴
const createMainUIHolder = (interaction) => 
{
  const guild_id = interaction.guild.id;
  if(ui_holder_map.hasOwnProperty(guild_id))
  {
    const prev_uiHolder = ui_holder_map[guild_id];

    if(prev_uiHolder.isDisplayingMultiplayerLobby())
    {
      interaction.explicit_replied = true;
      interaction.reply( { content:`\`\`\`🔸 현재 이 서버에서 멀티플레이 로비에 참가 중이기에 새로운 UI를 생성할 수 없습니다.\n만약 멀티플레이 로비에 참가 중이 아닌데도 해당 메시지가 표시된다면\n\`[/퀴즈정리]\` 명령어를 입력해보세요.\`\`\``, ephemeral: true });

      prev_uiHolder.sendDelayedUI(prev_uiHolder.ui, true);
      return undefined;
    }

    prev_uiHolder.free();
  }
  const uiHolder = new UIHolder(interaction, new MainUI(), UI_HOLDER_TYPE.PUBLIC);
  uiHolder.holder_id = guild_id;
  ui_holder_map[guild_id] = uiHolder; 

  uiHolder.updateUI();

  return uiHolder;
};

//퀴즈 제작 툴
const createQuizToolUIHolder = (interaction) => 
{ 
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
};

const getUIHolder = (holder_id) => 
{
  if(ui_holder_map.hasOwnProperty(holder_id) === false)
  {
    return undefined;
  }

  return ui_holder_map[holder_id];
};

const relayMultiplayerSignal = (multiplayer_signal) => //관련 세션에 멀티플레이 신호 전달
{
  let handled = false; //한 곳이라도 handle 했으면 한거임
  const guild_ids = multiplayer_signal.guild_ids;
  for(const guild_id of guild_ids)
  {
    const ui_holder = ui_holder_map[guild_id];
    if(ui_holder !== undefined)
    {
      try
      {
        handled = ui_holder.on(CUSTOM_EVENT_TYPE.receivedMultiplayerSignal, multiplayer_signal);
      }
      catch(err)
      {
        logger.error(`Quiz ui Relaying multiplayer Signal error occurred! ${err.stack}`);
      }
    }
  }

  return handled;
};

const eraseUIHolder = (guild) => 
{
  logger.info(`${guild.id} called erase ui holder`);
  
  const guild_id = guild.id;
  const ui_holder = ui_holder_map[guild_id];
  if(ui_holder !== undefined)
  {
    ui_holder.free();
    delete ui_holder_map[guild_id];
  }
};

const startUIHolderAgingManager = () => 
{
  return uiHolderAgingManager();
};

//#endregion

//#region UI 관리 함수들
/** UI 관련 함수들 **/
//UI holder Aging Manager
const uiHolderAgingManager = () =>
{
  const uiholder_aging_for_oldkey_value = SYSTEM_CONFIG.ui_holder_aging_manager_criteria * 1000; //last updated time이 일정 값 이전인 ui는 삭제할거임
  const uiholder_aging_manager = setInterval(()=>
  {
    const criteria_value = Date.now() - uiholder_aging_for_oldkey_value; //이거보다 이전에 update 된 것은 삭제

    let free_count = 0;
    const keys = Object.keys(ui_holder_map);

    logger.info(`Aginging UI Holder... targets: ${keys.length} ,criteria: ${criteria_value}`);

    keys.forEach((key) => 
    {
      const value = ui_holder_map[key];
      if(value.last_update_time < criteria_value)
      {
        const uiHolder = ui_holder_map[key];
        uiHolder.free();
        ++free_count;
        delete ui_holder_map[key]; //삭제~
      }
    });

    logger.info(`Done Aginging UI Holder... free count: ${free_count}`);
  }, SYSTEM_CONFIG.ui_holder_aging_manager_interval * 1000); //체크 주기

  return uiholder_aging_manager;
};

//#endregion

/** UI 프레임 관련 **/

const UI_HOLDER_TYPE =
{
  PUBLIC : "public", //길드 메시지 UI, 길드용임
  PRIVATE : "private" //개인 메시지 UI, 개인용임
};

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
    this.channel = interaction.channel;
    this.public_message_mode = false; //이게 true면 public ui 여도 interaction 이 아닌, message 기반으로 동작한다.

    this.initialized = false;
    this.prev_ui_stack = []; //뒤로가기용 UI스택

    this.message_created_time = Date.now();
    this.last_update_time = Date.now(); //uiholder aging manager에서 삭제 기준이될 값

    this.ui.holder = this;

    this.ui.onReady();
  }

  free() //자원 정리
  {
    const holder_id = this.guild_id ?? this.user_id;

    if(this.ui !== undefined)
    {
      if(this.ui.expired === false)
      {
        this.ui.onExpired();
      }
    }

    for(const stack_ui of this.prev_ui_stack)
    {
      if(stack_ui.expired === false)
      {
        stack_ui.onExpired();
      }
    }

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
    if(this.ui === undefined)
    {
      return;
    }

    if(event_name === CUSTOM_EVENT_TYPE.interactionCreate)
    {
      let interaction = event_object;
      if(interaction.isButton() && interaction.customId === 'back')  //뒤로가기 버튼 처리
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
    if(this.prev_ui_stack.length === 0)
    {
      return;
    }

    if(this.ui.expired === false)
    {
      this.ui.onExpired();
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
    if(new_ui === undefined)
    {
      return;
    }

    if(this.ui !== new_ui) //ui stack 에 쌓는 것은 새 UI 인스턴스가 생성됐을 때만
    {
      this.appendNewUI(new_ui);
    }
    this.updateUI();
  }

  //UI 재전송
  updateUI()
  {
    if(this.ui === undefined)
    {
      return;
    }

    this.last_update_time = Date.now();

    if(this.ui_holder_type === UI_HOLDER_TYPE.PUBLIC)
    {
      this.updatePublicUI();
    }
    else if(this.ui_holder_type === UI_HOLDER_TYPE.PRIVATE)
    {
      this.updatePrivateUI();
    }
  }

  handleUpdatePublicUIError(err, is_retry)
  {
    if(err.code === RESTJSONErrorCodes.UnknownMessage || err.code === RESTJSONErrorCodes.UnknownInteraction) //삭제된 메시지에 update 시도한거라 별도로 핸들링 하지 않는다.
    {
      return;
    }

    if(err.code === RESTJSONErrorCodes.InvalidFormBodyOrContentType) //embed에서 url들이 잘못됐다. 이 경우 그냥 url 다 지워
    {
      logger.warn(`Invalid Form Body from Public UI, Remove all url. guild_id:${this.guild_id}, user_id:${this.user_id}, embeds: ${JSON.stringify(this.getUIEmbed())}`);
      this.ui.resetEmbedURL();

      if(is_retry === false)
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
  }

  updatePublicUI(is_retry = false) //Public 메시지용 update
  {
    if(this.initialized === false || this.base_message === undefined)
    {
      this.initialized = true;

      if(this.public_message_mode)
      {
        this.channel.send( {embeds: [this.getUIEmbed()], components: this.getUIComponents()} )
          .then((message) =>
          {
            this.base_message = message;
          })
          .catch((err) => 
          {
            this.handleUpdatePublicUIError(err, is_retry);
          });
      }
      else
      {
        this.base_interaction.explicit_replied = true;
        this.base_interaction.reply( {embeds: [this.getUIEmbed()], components: this.getUIComponents(), fetchReply: true} )
          .then((message) =>
          {
            this.base_message = message;
          })
          .catch((err) => 
          {
            this.handleUpdatePublicUIError(err, is_retry);
          });
      }

      this.message_created_time = Date.now();

      return;
    }

    if(this.public_message_mode)
    {
      this.base_message.edit( {embeds: [this.getUIEmbed()], components: this.getUIComponents()} )
        .catch((err) => 
        {
          this.handleUpdatePublicUIError(err);
        });
    }
    else
    {
      this.base_interaction.editReply( {embeds: [this.getUIEmbed()], components: this.getUIComponents()} )
        .catch((err) => 
        {
          this.handleUpdatePublicUIError(err);
        });
    }
  }

  handleUpdatePrivateUIError(err, is_retry)
  {
    if(err.code === RESTJSONErrorCodes.UnknownMessage || err.code === RESTJSONErrorCodes.UnknownInteraction) //삭제된 메시지에 update 시도한거라 별도로 핸들링 하지 않는다.
    {
      return;
    }

    if(err.code === RESTJSONErrorCodes.InvalidFormBodyOrContentType) //embed에서 url들이 잘못됐다. 이 경우 그냥 url 다 지워
    {
      logger.warn(`Invalid Form Body from Private UI, Remove all url. guild_id:${this.guild_id}, user_id:${this.user_id}, embeds: ${JSON.stringify(this.getUIEmbed())}`);
      this.ui.resetEmbedURL();

      if(is_retry === false)
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
  }

  updatePrivateUI(is_retry = false) //Private 메시지용 update
  {
    if(this.initialized === false || this.base_message === undefined)
    {
      this.initialized = true;

      this.user.send( {embeds: [this.getUIEmbed()], components: this.getUIComponents()} )
        .then((message) => 
        {
          this.base_message = message;
        })
        .catch((err) => 
        {
          this.handleUpdatePrivateUIError(err, is_retry);
        });

      this.message_created_time = Date.now();

      return;
    }

    this.base_message.edit( {embeds: [this.getUIEmbed()], components: this.getUIComponents()} )
      .catch((err) => 
      {
        this.handleUpdatePrivateUIError(err, is_retry);
      });
  }

  sendDelayedUI(ui, do_resend) //interaction 이벤트 떄만이 아니라 아무 때나 ui update
  {
    if(do_resend && ui !== undefined)
    {
      if(this.base_message !== undefined)
      {
        this.base_message.delete()
          .catch(err => 
          {
            return;
          });
        this.base_message = undefined;
      }
      
      if(this.base_interaction !== undefined)
      {
        this.base_interaction.deleteReply()
          .catch(err => 
          {
            return;
          });
        this.base_interaction = undefined;
        this.public_message_mode = true;
      }
    }

    this.onUIReceived(ui);
  }

  getMessageCreatedTime()
  {
    return this.message_created_time;
  }

  getOwnerName()
  {
    return this.user.displayName;
  }

  getOwnerId()
  {
    return this.user_id;
  }

  isPublicUI()
  {
    return this.ui_holder_type === UI_HOLDER_TYPE.PUBLIC;
  }

  isDisplayingMultiplayerLobby() //잉...멀티플레이 로비 띄워뒀으면 새로운 ui띄우는거 막으려구... 흑흑 좀 애매한데 걍 이렇게 ㄱㄱ
  {
    return this.ui instanceof MultiplayerQuizLobbyUI;
  }

  sendMessageReply(message) //사실 상 base message 강조를 목적으로 하는 답장 보내기
  {
    if(this.base_message === undefined)
    {
      logger.error(`Failed to Reply of base message guild_id:${this.guild_id}, user_id:${this.user_id}, embeds: ${JSON.stringify(message)}, err: base message is undefined!`);
      return;
    }

    this.base_message.reply(message);
  }
}

//#endregion

module.exports = { initialize, createMainUIHolder, createQuizToolUIHolder, getUIHolder, relayMultiplayerSignal, eraseUIHolder, startUIHolderAgingManager, uiHolderAgingManager, UIHolder };