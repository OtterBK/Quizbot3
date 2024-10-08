'use strict';

//#region 필요한 외부 모듈

//#endregion

//#region 로컬 modules

const { QuizInfoUI } = require('./quiz-info-ui.js');

//#endregion

/** 공식 퀴즈용 퀴즈 정보 UI*/
/** 단순히 래핑 클래스임 */
class DevQuizInfoUI extends QuizInfoUI
{
  constructor(quiz_info)
  {
    super(quiz_info);

    this.refreshUI();
  }
}  

module.exports = { DevQuizInfoUI };