'use strict';

//#region 필요한 외부 모듈

//#endregion

//#region 로컬 modules
const { SYSTEM_CONFIG,} = require('../../config/system_setting.js');
const PRIVATE_CONFIG = require('../../config/private_config.json');
const text_contents = require('../../config/text_contents.json')[SYSTEM_CONFIG.language]; 
const logger = require('../../utility/logger.js')('QuizUI');
const { UserQuizInfo, loadUserQuizListFromDB } = require('../managers/user_quiz_info_manager.js');
const {
  my_quiz_control_comp,
  modal_quiz_info,
} = require("./components.js");

const { 
  QuizBotControlComponentUI
} = require("./common-ui.js");


const { UserQuizInfoUI } = require("./user-quiz-info.ui.js");

//#endregion

/** Quiz 제작 UI 관련, 전부 개인 메시지로 처리됨 */
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

module.exports = { UserQuizListUI }