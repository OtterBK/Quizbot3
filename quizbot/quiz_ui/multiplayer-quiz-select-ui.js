'use strict';

//#region 필요한 외부 모듈
const cloneDeep = require("lodash/cloneDeep.js");
//#endregion

//#region 로컬 modules
const ipc_manager = require('../managers/ipc_manager.js');
const { CLIENT_SIGNAL, SERVER_SIGNAL } = require('../managers/multiplayer_signal.js');

const { SYSTEM_CONFIG, } = require('../../config/system_setting.js');
const text_contents = require('../../config/text_contents.json')[SYSTEM_CONFIG.language]; 
const quiz_system = require('../quiz_system/quiz_system.js');
const {
  modal_complex_page_jump,
  btn_search,
  multiplayer_select_control,
  modal_multiplayer_create_lobby,
} = require("./components.js");

const { 
  QuizBotControlComponentUI
} = require("./common-ui.js");

const { MultiplayerQuizLobbyUI } = require("./multiplayer-quiz-lobby-ui.js");

//#endregion

/** 유저 퀴즈 선택 UI */
class MultiplayerQuizSelectUI extends QuizBotControlComponentUI  
{
  constructor(guild_id)
  {
    super();

    this.guild_id = guild_id;
    this.is_joining = false;

    this.initializeEmbed();
    this.initializeComponents();
    this.initializeMultiplayerQuizSelectUIHandler();
  }

  initializeEmbed() 
  {
    

    this.embed = {
      color: 0x05f1f1,
      title: text_contents.multiplayer_select_category.title,
      url: text_contents.multiplayer_select_category.url,
      description: '대기 중인 멀티플레이 로비 목록을 불러오는 중...\n잠시만 기다려주세요.🙂',
    };
  }

  initializeComponents() 
  {
    

    this.components.push(multiplayer_select_control);
  }

  initializeMultiplayerQuizSelectUIHandler()
  {
    this.multiplayer_quiz_select_ui_handler =
    {
      'request_modal_multiplayer_create_lobby': this.handleRequestModalCreateLobby.bind(this), //멀티플레이 로비 생성 클릭
      'multiplayer_refresh_lobby_list': this.handleRequestRefreshLobby.bind(this), //멀티플레이 새로고침 클릭
      'multiplayer_scoreboard': this.handleRequestScoreboard.bind(this), //멀티플레이 순위표 클릭
      'modal_multiplayer_create_lobby': this.handleSubmitModalCreateLobby.bind(this), //멀티플레이 로비 생성 모달 제출
    };
  }

  onReady() //ui 등록 됐을 때
  {
    this.loadMultiplayerLobbyList(); //여기서 ui 업데이트함
  }

  onAwaked() //ui 재활성화 됐을 때
  {
    this.loadMultiplayerLobbyList(); //로비 목록 재로드
  }

  async loadMultiplayerLobbyList()
  {
    const multiplayer_lobby_info_list = await ipc_manager.sendMultiplayerSignal(
      {
        signal_type: CLIENT_SIGNAL.REQUEST_LOBBY_LIST,
        guild_id: this.guild_id,
      }
    ); //멀티플레이 lobby 목록 요청 조회

    for(let multiplayer_lobby_info of multiplayer_lobby_info_list) 
    {
      multiplayer_lobby_info.name = `**${multiplayer_lobby_info.session_name}**\n🔸) 참여 중: ${multiplayer_lobby_info.participant_count}개 | 호스트: ${multiplayer_lobby_info.host_name}}`;
    }

    this.cur_contents = multiplayer_lobby_info_list ?? [];

    if(this.cur_contents.length === 0)
    {
      this.main_description = "🔹대기 중인 멀티플레이 로비가 없네요...\n다른 서버와 경쟁하기 위해 직접 로비를 생성해보세요!\n\n\n";
    }
    else
    {
      this.main_description = text_contents.multiplayer_select_category.description;
    }

    this.displayContents(0);
    this.update();
  }

  onInteractionCreate(interaction)
  {
    if(this.isUnsupportedInteraction(interaction))  
    {
      return;
    }

    if(this.isMultiplayerQuizSelectUIEvent(interaction))
    {
      return this.handleMultiplayerQuizSelectUIEvent(interaction);
    }
     
    if(this.isPageMoveEvent(interaction))
    {
      return this.handlePageMoveEvent(interaction);
    }

    if(this.isSelectedIndexEvent(interaction))
    {
      return this.handleSelectedIndexEvent(interaction);
    }
  }

  isMultiplayerQuizSelectUIEvent(interaction)
  {
    return this.multiplayer_quiz_select_ui_handler[interaction.customId] !== undefined;
  }

  handleMultiplayerQuizSelectUIEvent(interaction)
  {
    const handler = this.multiplayer_quiz_select_ui_handler[interaction.customId];
    return handler(interaction);
  }

  handleRequestModalCreateLobby(interaction)
  {
    interaction.explicit_replied = true;
    interaction.showModal(modal_multiplayer_create_lobby);
    return undefined;
  }

  handleRequestRefreshLobby(interaction)
  {
    this.loadMultiplayerLobbyList();
    interaction.explicit_replied = true;
    interaction.reply({content: `\`\`\`🔸 목록을 다시 불러왔습니다.\`\`\``, ephemeral: true});
    return undefined;
  }

  handleRequestScoreboard(interaction)
  {
    interaction.explicit_replied = true;
    interaction.reply({content: `\`\`\`🔸 랭킹 기능은 11월에 추가될 예정입니다...😥\`\`\``, ephemeral: true});
    return undefined;
  }

  handleSubmitModalCreateLobby(interaction)
  {
    return this.createLobby(interaction);
  }

  handleSelectedIndexEvent(interaction)
  {
    if(this.cur_contents === undefined)
    {
      return;
    }

    const selected_index = this.convertToSelectedIndex(interaction.customId);

    const index = (this.count_per_page * this.cur_page) + selected_index - 1; //실제로 1번을 선택했으면 0번 인덱스를 뜻함
    if(index >= this.cur_contents.length)
    {
      return;
    }

    if(this.checkForJoinLobby(interaction) === false) //아직 준비가 안됐다.
    {
      return;
    }

    const multiplayer_lobby_info = this.cur_contents[index]; //로비를 선택했을 경우
    
    return this.tryJoinLobby(interaction, multiplayer_lobby_info);
  }

  checkForJoinLobby(interaction)
  {
    const guild = interaction.guild;
    const owner = interaction.member; //주최자
    const channel = interaction.channel;

    const check_ready = quiz_system.checkReadyForStartQuiz(guild, owner); //퀴즈를 플레이할 준비가 됐는지(음성 채널 참가 확인 등)
    if(check_ready === undefined || check_ready.result === false)
    {
      const reason = check_ready.reason;
      const reason_message = text_contents.quiz_info_ui.failed_start.replace("${reason}", reason);

      interaction.explicit_replied = true;
      interaction.reply({content: reason_message, ephemeral: true});
      return false;
    }

    return true;
  }

  createLobby(interaction)
  {
    if(this.checkForJoinLobby(interaction) === false) //아직 준비가 안됐다.
    {
      return;
    }

    const multiplayer_quiz_info = MultiplayerQuizLobbyUI.createDefaultMultiplayerQuizInfo(interaction);
    return new MultiplayerQuizLobbyUI(multiplayer_quiz_info, interaction, false); 
  }

  tryJoinLobby(interaction, multiplayer_lobby_info)
  {
    if(this.is_joining)
    {
      interaction.channel.send({content: `\`\`\`🌐 이미 ${multiplayer_lobby_info.session_name}에 참여 시도 중입니다.\n잠시 후 다시 시도해보세요.\`\`\``});
      return undefined;
    }

    this.is_joining = true;
    
    const fake_quiz_info = {
      title: `${multiplayer_lobby_info.session_name}`,
      type_name: `세션 정보를 불러오는 중입니다...`,
      icon: '🌐',
    };
    const session_id = multiplayer_lobby_info.session_id;

    setTimeout(() =>
    {
      this.is_joining = false;
    }, 2500);

    return new MultiplayerQuizLobbyUI(fake_quiz_info, interaction, true, session_id);
  }
}

module.exports = { MultiplayerQuizSelectUI };