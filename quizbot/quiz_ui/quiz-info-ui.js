'use strict';

//#region 필요한 외부 모듈

//#endregion

//#region 로컬 modules
const { SYSTEM_CONFIG } = require('../../config/system_setting.js');
const text_contents = require('../../config/text_contents.json')[SYSTEM_CONFIG.language]; 
const quiz_system = require('../quiz_system/quiz_system.js'); //퀴즈봇 메인 시스템
const {
  quiz_info_comp,
} = require("./components.js");

const { 
  QuizbotUI,
} = require("./common-ui.js");

const { AlertQuizStartUI } = require("./alert-quiz-start-ui.js");
const { ServerSettingUI } = require("./server-setting-ui.js");

//#endregion

/** 퀴즈 정보 표시 UI, Dev퀴즈/User퀴즈 둘 다 사용 */
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

module.exports = { QuizInfoUI };