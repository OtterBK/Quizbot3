'use strict';

//#region 필요한 외부 모듈

//#endregion

//#region 로컬 modules
const { SYSTEM_CONFIG, QUIZ_MAKER_TYPE, } = require('../../config/system_setting.js');
const text_contents = require('../../config/text_contents.json')[SYSTEM_CONFIG.language]; 
const utility = require('../../utility/utility.js');
const logger = require('../../utility/logger.js')('QuizUI');
const {

} = require("./components.js");

const { 
  QuizBotControlComponentUI
} = require("./common-ui.js");


const { DevQuizInfoUI } = require("./dev-quiz-info-ui.js");

//#endregion

/** 개발자 퀴즈 선택 UI */
class DevQuizSelectUI extends QuizBotControlComponentUI  
{

  static resource_path = SYSTEM_CONFIG.dev_quiz_path;
  static quiz_contents_sorted_by_name =  utility.loadLocalDirectoryQuiz(DevQuizSelectUI.resource_path); //동적 로드할 필요는 딱히 없을듯..? 초기 로드 시, 정적으로 로드하자;
  // static quiz_contents_sorted_by_mtime =  utility.loadLocalDirectoryQuiz(DevQuizSelectUI.resource_path, 'mtime'); //mtime 안쓰니깐 잠시 빼두자;
  
  constructor(contents)
  {
    super();

    this.embed = {
      color: 0x87CEEB,
      title: text_contents.dev_select_category.title,
      url: text_contents.dev_select_category.url,
      description: text_contents.dev_select_category.description,
    };

    this.initializeContents(contents);

    this.displayContents(0);

  }

  initializeEmbed() 
  {
    

    
  }

  initializeContents(contents)
  {
    this.main_description = text_contents.dev_select_category.description;

    this.cur_contents = (contents ?? DevQuizSelectUI.quiz_contents_sorted_by_name);

    if(this.cur_contents === undefined)
    {
      logger.error(`Undefined Current Contents on DevQuizSelectUI guild_id:${this.guild_id}, err: ${"Check Value of Resource Path Option"}`);
    }
  }

  onInteractionCreate(interaction)
  {
    if(this.isUnsupportedInteraction(interaction))
    {
      return;
    }

    if(this.isPageMoveEvent(interaction))
    {
      return this.handlePageMoveEvent(interaction);
    }

    if(this.isSelectedIndexEvent(interaction))
    {
      return this.handleContentSelected(interaction);
    }
  }

  handleContentSelected(interaction)
  {
    const selected_index = this.convertToSelectedIndex(interaction.customId);

    // 그냥 페이지 계산해서 content 가져오자
    const index = (this.count_per_page * this.cur_page) + selected_index - 1; //실제로 1번을 선택했으면 0번 인덱스를 뜻함
    if(index >= this.cur_contents.length) //범위 넘어선걸 골랐다면
    {
      return;
    }

    const content = this.cur_contents[index];
    if(content['is_quiz'] === true) //퀴즈 content 를 선택했을 경우
    {
      const dev_quiz_info = this.generateDevQuizInfo(content); 

      return new DevQuizInfoUI(dev_quiz_info);
    }

    if(content['sub_contents'] !== undefined) //하위 디렉터리가 있다면
    {
      return new DevQuizSelectUI(content['sub_contents']);
    }
  }

  generateDevQuizInfo(content)
  {
    //어차피 여기서 만드는 quiz info 는 내가 하드코딩해도 되네
    let dev_quiz_info = {};
    dev_quiz_info['title']  = content['name'];
    dev_quiz_info['icon'] = content['icon'];

    dev_quiz_info['type_name'] = content['type_name']; 
    dev_quiz_info['description'] = content['description']; 

    dev_quiz_info['author'] = '제육보끔#1916';
    dev_quiz_info['author_icon'] = 'https://user-images.githubusercontent.com/28488288/208116143-24828069-91e7-4a67-ac69-3bf50a8e1a02.png';
    dev_quiz_info['thumbnail'] = 'https://user-images.githubusercontent.com/28488288/106536426-c48d4300-653b-11eb-97ee-445ba6bced9b.jpg'; //썸네일은 그냥 quizbot으로 해두자

    dev_quiz_info['quiz_size'] = content['quiz_size']; 
    dev_quiz_info['repeat_count'] = content['repeat_count']; 
    dev_quiz_info['winner_nickname'] = content['winner_nickname'];
    dev_quiz_info['quiz_path'] = content['content_path'];//dev quiz는 quiz_path 필요
    dev_quiz_info['quiz_type'] = content['quiz_type'];
    dev_quiz_info['quiz_maker_type'] = QUIZ_MAKER_TYPE.BY_DEVELOPER;

    dev_quiz_info['quiz_id'] = undefined; //dev quiz는 quiz_id가 없다

    return dev_quiz_info;
  }
}

module.exports = { DevQuizSelectUI };