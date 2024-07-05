'use strict';

//#region 필요한 외부 모듈

//#endregion

//#region 로컬 modules
const { SYSTEM_CONFIG, } = require('../../config/system_setting.js');
const text_contents = require('../../config/text_contents.json')[SYSTEM_CONFIG.language]; 
const {
  only_back_comp,
} = require("./components.js");

const { 
  QuizbotUI,
} = require("./common-ui.js");

//#endregion

/** 퀴즈 만들기 Guide */
class QuizToolGuideUI extends QuizbotUI
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

  onInteractionCreate()
  {
    return; //QuizToolGuide 에서는 이벤트 핸들링을 하지 않음
  }
}


module.exports = { QuizToolGuideUI };