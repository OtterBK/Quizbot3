'use strict';

//#region 필요한 외부 모듈

//#endregion

//#region 로컬 modules
const { SYSTEM_CONFIG } = require('../../config/system_setting.js');
const text_contents = require('../../config/text_contents.json')[SYSTEM_CONFIG.language]; 
const {

} = require("./components.js");

const { 
  QuizbotUI,
} = require("./common-ui.js");


//#endregion

/** Quiz 시작 알림 UI */
class AlertQuizStartUI extends QuizbotUI
{
  constructor(quiz_info, owner_name)
  {
    super();

    this.quiz_info = quiz_info;
    this.owner_name = owner_name;

    this.initializeEmbed();
    this.initializeComponents();
  }

  initializeEmbed() 
  {
    

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
    description = description.replace('${quiz_name}', `${this.quiz_info['title']}`);
    description = description.replace('${quiz_size}', ` ${this.quiz_info['selected_question_count'] ?? this.quiz_info['quiz_size']}`);
    description = description.replace('${quiz_owner}', `${this.owner_name}`);

    this.embed.description = description;
  }

  initializeComponents()
  {
    this.components = []; //여기서는 component를 싹 없앤다
  }

  onInteractionCreate(interaction)
  {
    return; //AlertQuizStartUI 에서는 이벤트 핸들링을 하지 않음
  }

}

module.exports = { AlertQuizStartUI };