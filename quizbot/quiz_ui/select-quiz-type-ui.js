'use strict';

//#region 필요한 외부 모듈

//#endregion

//#region 로컬 modules
const { SYSTEM_CONFIG,} = require('../../config/system_setting.js');
const text_contents = require('../../config/text_contents.json')[SYSTEM_CONFIG.language]; 
const {
  select_btn_component,
  only_back_comp,
} = require("./components.js");

const { 
  QuizbotUI,
} = require("./common-ui.js");


const { DevQuizSelectUI } = require("./dev-quiz-select-ui.js");
const { OmakaseQuizRoomUI } = require("./omakase-quiz-room-ui.js");
const { UserQuizSelectUI } = require("./user-quiz-select-ui.js");

//#endregion

/** 퀴즈 유형(개발자/유저) 선택 UI */
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

module.exports = { SelectQuizTypeUI };