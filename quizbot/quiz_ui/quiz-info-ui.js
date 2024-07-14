'use strict';

//#region 필요한 외부 모듈

//#endregion

//#region 로컬 modules
const { SYSTEM_CONFIG } = require('../../config/system_setting.js');
const text_contents = require('../../config/text_contents.json')[SYSTEM_CONFIG.language]; 
const quiz_system = require('../quiz_system/quiz_system.js'); //퀴즈봇 메인 시스템
const {
  quiz_info_comp,
  modal_quiz_setting,
} = require("./components.js");

const { 
  QuizbotUI,
} = require("./common-ui.js");

const { AlertQuizStartUI } = require("./alert-quiz-start-ui.js");
const { ServerSettingUI } = require("./server-setting-ui.js");
const { cloneDeep } = require('lodash');

//#endregion

/** 퀴즈 정보 표시 UI, Dev퀴즈/User퀴즈 둘 다 사용 */
class QuizInfoUI extends QuizbotUI
{
  constructor(quiz_info={})
  {
    super();

    this.quiz_info = quiz_info;

    this.embed = {
      color: 0x87CEEB,
      title: `${quiz_info['icon'] ?? ''} ${quiz_info['title'] ?? ''}`,
      description: undefined,
      thumbnail: { //퀴즈 섬네일 표시
        url: quiz_info['thumbnail'] ?? '',
      },
      footer: { //퀴즈 제작자 표시
        text: quiz_info['author'] ?? '',
        icon_url: quiz_info['author_icon'] ?? '',
      },
    };

    this.components = [quiz_info_comp]; //여기서는 component를 바꿔서 해주자
  }

  refreshUI()
  {
    const quiz_info = this.quiz_info;

    let description = text_contents.quiz_info_ui.description;
    description = description.replace('${quiz_type_name}', `${quiz_info['type_name']}`);
    description = description.replace('${quiz_size}', `[ ${quiz_info['selected_question_count'] ?? quiz_info['quiz_size']} / ${quiz_info['quiz_size']} ]`);
    description = description.replace('${quiz_description}', `${quiz_info['description']}`);

    this.embed.description = description;
  }

  onInteractionCreate(interaction) 
  {
    if(!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return;

    if(interaction.customId == 'start') //시작 버튼 눌렀을 때
    {
      const quiz_info = this.quiz_info;

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

    if(interaction.customId == 'request_modal_quiz_setting') //퀴즈 설정 버튼 눌렀을 때
    {
      const quiz_info = this.quiz_info;
      const modal_current_quiz_setting = cloneDeep(modal_quiz_setting);
      
      modal_current_quiz_setting.components[0].components[0].setLabel(`몇 개의 문제를 제출할까요? (최대 ${quiz_info['quiz_size'] ?? 100})`);
      
      interaction.showModal(modal_current_quiz_setting); //퀴즈 설정 모달 전달
      return;
    }

    if(interaction.customId == 'modal_quiz_setting') //퀴즈 설정 값 제출 시,
    {
      return this.applyQuizSettings(interaction);
    }
  }

  applyQuizSettings(interaction)
  {
    const quiz_info = this.quiz_info;
    const room_owner = quiz_info['room_owner'];

    // if(room_owner.id != interaction.member.id)
    // {
    //   interaction.reply({content: `>>> 방장인 ${room_owner.displayName} 님만 설정이 가능합니다.`, ephemeral: true});
    //   return undefined;
    // }

    let need_refresh = false;

    need_refresh |= this.applySelectedQuestionCount(interaction);

    if(need_refresh == false)
    {
      return undefined;
    }

    this.refreshUI();
    return this;
    
  }

  applySelectedQuestionCount(interaction)
  {
    const input_selected_question_count = interaction.fields.getTextInputValue('txt_input_selected_question_count');

    if(input_selected_question_count == undefined || input_selected_question_count == '')
    {
      interaction.deferUpdate(); //defer은 해준다.
      return false;
    }

    const quiz_info = this.quiz_info;
    const all_question_count = quiz_info['quiz_size'] ?? 100;

    let selected_question_count = parseInt(input_selected_question_count.trim());
    if(isNaN(selected_question_count) || selected_question_count <= 0) //입력 값 잘못된거 처리
    {
      interaction.reply({content: `>>> 문제 수 설정에 입력된 ${input_selected_question_count} 값은 잘못됐습니다.\n양수의 숫자만 입력해주세요.`, ephemeral: true});
      return false;
    }

    if(selected_question_count > all_question_count)
    {
      selected_question_count = all_question_count;
    }
    
    interaction.reply({content: `>>> 제출할 문제 수를 ${selected_question_count}개로 설정했습니다.`, ephemeral: true});
    quiz_info['selected_question_count'] = selected_question_count;

    return true;
  }
}

module.exports = { QuizInfoUI };