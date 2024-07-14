'use strict';

//#region 필요한 외부 모듈
const cloneDeep = require("lodash/cloneDeep.js");
//#endregion

//#region 로컬 modules
const { SYSTEM_CONFIG, QUIZ_TYPE, QUIZ_MAKER_TYPE } = require('../../config/system_setting.js');
const text_contents = require('../../config/text_contents.json')[SYSTEM_CONFIG.language]; 
const quiz_system = require('../quiz_system/quiz_system.js'); //퀴즈봇 메인 시스템
const utility = require('../../utility/utility.js');
const logger = require('../../utility/logger.js')('QuizUI');
const feedback_manager = require('../managers/feedback_manager.js');
const {
  quiz_info_comp,
  quiz_edit_comp,
  quiz_info_control_comp,
  quiz_tags_select_menu,
  question_select_menu_comp,
  quiz_delete_confirm_comp,
  modal_quiz_info,
  modal_question_info,
} = require('./components.js')

const { 
  QuizbotUI,
} = require("./common-ui.js");


const { QuizInfoUI } = require("./quiz-info-ui.js");
const { UserQuestionInfoUI } = require("./user-question-info-ui.js");
const { AlertQuizStartUI } = require("./alert-quiz-start-ui.js");

//#endregion

/** 유저 퀴즈 정보 UI */
class UserQuizInfoUI extends QuizInfoUI {

    constructor(user_quiz_info, readonly=true)
    {
      super(); //우선 quiz_info를 넘기지 마
  
      this.user_quiz_info = user_quiz_info;
      this.readonly = readonly;
  
      this.embed = {
        color: 0x05f1f1,
        title: `**${user_quiz_info.data.quiz_title}**`,
        description: '퀴즈 정보를 불러오는 중...\n잠시만 기다려주세요.',
      };
  
      this.components = [];
    }
  
    onReady() //ui 등록 됐을 때
    {
      this.loadQuestionList(); //여기서 ui 업데이트함
    }
  
    onInteractionCreate(interaction) 
    {
      if(!interaction.isButton() && !interaction.isModalSubmit() && !interaction.isStringSelectMenu()) return;
  
      if(this.readonly == true)
      {
        return this.doQuizPlayEvent(interaction);
      }
      else
      {
        return this.doQuizEditorEvent(interaction);
      }
    }
  
    onAwaked() //ui 재활성화 됐을 때, UserQuestionInfo 에서 back 쳐서 돌아왔을 때, select menu 랑 문제 수 갱신해줘야함
    {
      this.refreshUI();
    }
  
    async loadQuestionList()
    {
      await this.user_quiz_info.loadQuestionListFromDB();
  
      this.refreshUI();

      this.fillInfoAsDevQuizInfo();
  
      this.update();
    }
  
    refreshUI() //ui에 quiz_info 재적용
    {
      const user_quiz_info = this.user_quiz_info;

      if(user_quiz_info == undefined)
      {
        return;
      }
  
      this.embed = {
        color: 0x05f1f1,
        title: `**${user_quiz_info.data.quiz_title}**`,
        description: '',
        image: { //퀴즈 섬네일 표시
          url: utility.isValidURL(user_quiz_info.data.thumbnail) ? user_quiz_info.data.thumbnail : '',
        },
        footer: { //퀴즈 제작자 표시
          text: user_quiz_info.data.creator_name ?? '',
          icon_url: user_quiz_info.data.creator_icon_url ?? '',
        },
      };
  
      let description = '';
      description += `⚒️ 퀴즈 제작: **${(user_quiz_info.data.creator_name ?? '')}**\n`;
  
      description += `🏷 한줄 소개: **${user_quiz_info.data.simple_description}**\n`;
      if(this.readonly)
      {
        const selected_question_count = this.quiz_info['selected_question_count'] ?? user_quiz_info.question_list.length;
        description += `📦 문제 개수: **[ ${selected_question_count} / ${user_quiz_info.question_list.length} ]개**\n`;
      }
      else
      {
        description += `📦 문제 개수: **${user_quiz_info.question_list.length}개 [최대 50개]**\n`;
      }
      description += "\n\n\n";
  
      description += `📖 퀴즈 설명:\n${user_quiz_info.data.description}\n\n\n\n`;
  
      description += "`만들어진 날짜: " + user_quiz_info.data.birthtime.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }) + "`\n";
      description += "`업데이트 날짜: " + user_quiz_info.data.modified_time.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }) + "`\n";
      
      description += "`플레이한 서버: " + (user_quiz_info.data.played_count ?? 0) + "개`\n";
      description += "`추천한 유저수: " + (user_quiz_info.data.like_count ?? 0) + "개`\n";
      description += "`인증여부: " + (user_quiz_info.data.certified ? "⭕" : "❌") + "`\n\n";
  
      description += "`퀴즈태그 목록: " + utility.convertTagsValueToString(user_quiz_info.data.tags_value) + "`\n\n";
  
      if(user_quiz_info.data.is_private)
      {
        description += "\n\n__**❗ 퀴즈를 다 만드신 후에는 꼭 [공개]로 설정해주세요!**__";
      }
  
      // description = description.replace('${quiz_type_name}', `${user_quiz_info.data.type_name}`);
      // description = description.replace('${quiz_size}', `${user_quiz_info.data.quiz_size}`);
      // description = description.replace('${quiz_description}', `${user_quiz_info.data.description}`);
      
      if(this.readonly)
      {
        description += '`⚠️ 퀴즈 도중에는 설정을 변경하실 수 없습니다.\n\n`';
        this.components = [quiz_info_comp, feedback_manager.quiz_feedback_comp]; //게임 시작 가능한 comp, 퀴즈 feedback comp
      }
      else
      {
        this.embed.title += user_quiz_info.data.is_private ? ` **[비공개🔒]**` : ` **[공개]**`
  
        this.components = [quiz_edit_comp, quiz_tags_select_menu]; //퀴즈 수정 가능한 comp
  
        let temp_question_select_menu_comp = undefined;
        let temp_question_select_menu = undefined;
        const question_list = this.user_quiz_info.question_list;
        for(let i = 0; i < question_list.length && i < 50; ++i)
        {
          if(i % 25 == 0)
          {
            temp_question_select_menu_comp = cloneDeep(question_select_menu_comp);
            temp_question_select_menu = temp_question_select_menu_comp.components[0];
            temp_question_select_menu.setCustomId(`question_select_menu`+`#${i/25}`);
            this.components.push(temp_question_select_menu_comp);
          }
  
          const question_info = question_list[i];
          const option = { label: `${i+1}번째 문제`, description: `${question_info.data.answers}`, value: `${i}` };
          temp_question_select_menu.addOptions(option);
        }
  
        this.components.push(quiz_info_control_comp); //뒤로가기 버튼~
      }
  
      this.embed.description = description;
    }
    
    doQuizPlayEvent(interaction)
    {
      const user_quiz_info = this.user_quiz_info;

      if(interaction.customId == 'like') //추천하기 버튼 눌렀을 때
      {
        feedback_manager.addQuizLikeAuto(interaction, user_quiz_info.quiz_id, user_quiz_info.data.quiz_title);
        return;
      }

      if(interaction.customId == 'start') //시작하기 버튼 눌렀을 때, 이건 어쩔 수 없이 여기서 해야함
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
        
        this.fillInfoAsDevQuizInfo();

        quiz_system.startQuiz(guild, owner, channel, quiz_info); //퀴즈 시작
        this.user_quiz_info.addPlayedCount(); //플레이 횟수 + 1
  
        return new AlertQuizStartUI(quiz_info, owner); 
      }

      //그 외에는 알아서...
      return super.onInteractionCreate(interaction);

    }
  
    doQuizEditorEvent(interaction)
    {      
      //퀴즈만들기 통해서 왔을 경우임
      const user_quiz_info = this.user_quiz_info;
  
      if(interaction.isModalSubmit()) //모달 이벤트는 따로 처리
      {
        return this.doModalSubmitEvent(interaction);
      }
  
      if(interaction.customId.startsWith('question_select_menu#')) //문제 선택하기 메뉴 눌렀을 때
      {
        const select_index = parseInt(interaction.values[0]);
        return new UserQuestionInfoUI(this.user_quiz_info, select_index); //선택한 문제의 ui 전달
      }
  
      if(interaction.customId == 'quiz_tags_select_menu') //태그 선택하기 메뉴 눌렀을 때
      {
        this.editTagsInfo(interaction);
        return this;
      }
  
      if(interaction.customId == 'request_modal_question_add') //문제 추가 눌렀을 떄
      {
        interaction.showModal(modal_question_info);
        return;
      }
  
      if(interaction.customId == 'request_modal_quiz_edit') //퀴즈 정보 수정 눌렀을 때
      {
        const modal_current_quiz_info = cloneDeep(modal_quiz_info);
        const user_quiz_info = this.user_quiz_info;
  
        //현재 적용된 user_quiz_info 값으로 modal 띄워준다.(편의성)
        modal_current_quiz_info.components[0].components[0].setValue(user_quiz_info.data.quiz_title ?? ''); //title
        modal_current_quiz_info.components[1].components[0].setValue(user_quiz_info.data.simple_description ?? ''); //simple description
        modal_current_quiz_info.components[2].components[0].setValue(user_quiz_info.data.description ?? ''); //description
        modal_current_quiz_info.components[3].components[0].setValue(user_quiz_info.data.thumbnail ?? ''); //thumbnail
  
        interaction.showModal(modal_current_quiz_info);
        return;
      }
  
      if(interaction.customId == 'quiz_toggle_public') //퀴즈 공개/비공개 버튼
      {
        //비공개에서 공개로 전환할 경우
        if(user_quiz_info.data.is_private == true && (user_quiz_info.data.tags_value == undefined || user_quiz_info.data.tags_value == 0))
        {
          interaction.user.send({ content: ">>> 태그를 1개 이상 선택해주세요...ㅜㅜ 😥", ephemeral: true });
          return;
        }
  
        user_quiz_info.data.is_private = !user_quiz_info.data.is_private;
  
        logger.info(`Edited Quiz Public/Private...value:${user_quiz_info.data.is_private} quiz_id: ${user_quiz_info.quiz_id}`);
  
        user_quiz_info.saveDataToDB();
  
        this.refreshUI();
        return this;
      }
  
      if(interaction.customId == 'quiz_delete') //퀴즈 삭제 버튼
      {
        interaction.user.send({ content: `>>> **${text_contents.quiz_maker_ui.confirm_quiz_delete}**`, components: [quiz_delete_confirm_comp], ephemeral: true });
        return;
      }
  
      if(interaction.customId == 'quiz_delete_confirmed') //퀴즈 정말정말정말로 삭제 버튼
      {
        this.freeHolder(); //더 이상 UI 못 쓰도록
        interaction.user.send({ content: "```" + `${text_contents.quiz_maker_ui.quiz_deleted}${user_quiz_info.quiz_id}` + "```", ephemeral: true });
        interaction.message.delete();
        user_quiz_info.delete();
        return;
      }
  
      if(interaction.customId == 'quiz_delete_cancel') //퀴즈 삭제 취소 버튼
      {
        interaction.message.delete();
        return;
      }
  
    }
  
    doModalSubmitEvent(modal_interaction)
    {
      if(modal_interaction.customId == 'modal_quiz_info') //퀴즈 정보 수정 했을 경우임
      {
        this.editQuizInfo(modal_interaction);
        return this;
      }
  
      if(modal_interaction.customId == 'modal_question_info') //문제 새로 만들기한 경우임
      {
        const question_info_ui = new UserQuestionInfoUI(this.user_quiz_info, -1); //어떤 quiz의 question info ui 인가 전달, -1이면 표시하지 않음
        question_info_ui.addQuestion(modal_interaction);
        return question_info_ui;
      }
    }
  
    editQuizInfo(modal_interaction) 
    {
      const user_quiz_info = this.user_quiz_info;
  
      const quiz_title = modal_interaction.fields.getTextInputValue('txt_input_quiz_title');
      const quiz_thumbnail = modal_interaction.fields.getTextInputValue('txt_input_quiz_thumbnail');
      const quiz_simple_description = modal_interaction.fields.getTextInputValue('txt_input_quiz_simple_description');
      const quiz_description = modal_interaction.fields.getTextInputValue('txt_input_quiz_description');
      
      user_quiz_info.data.quiz_title = quiz_title;
      user_quiz_info.data.thumbnail = quiz_thumbnail;
      user_quiz_info.data.simple_description = quiz_simple_description;
      user_quiz_info.data.description = quiz_description;
      user_quiz_info.data.modified_time = new Date();
  
      user_quiz_info.saveDataToDB();
      this.refreshUI();
  
      modal_interaction.reply({ content: ">>> 퀴즈 정보를 수정하였습니다.", ephemeral: true });
      logger.info(`Edited Quiz info... quiz_id: ${user_quiz_info.quiz_id}`);
      // modal_interaction.deferUpdate();
    }
  
    editTagsInfo(select_interaction)
    {
      const user_quiz_info = this.user_quiz_info;
  
      let tags_value = 0;
      for(const tag_value of select_interaction.values)
      {
        tags_value += parseInt(tag_value);
      }
      user_quiz_info.data.tags_value = tags_value;
  
      // user_quiz_info.data.modified_time = new Date(); //일부러 뺐다 필요하면 넣어도된다.
  
      user_quiz_info.saveDataToDB();
      this.refreshUI();
  
      logger.info(`Edited Quiz Tag... quiz_id: ${user_quiz_info.quiz_id}`);
    }
  
    //TODO 컬럼미스
    /**  컬럼명을 고려하지 않은 명백한 설계미스다... 나중에 고쳐둬... */
    fillInfoAsDevQuizInfo() 
    {
      const quiz_info = this.quiz_info;
      const user_quiz_info = this.user_quiz_info;
  
      quiz_info['title']  = user_quiz_info.data.quiz_title;
      quiz_info['icon'] = text_contents.icon.ICON_CUSTOM_QUIZ;
  
      quiz_info['type_name'] = user_quiz_info.data.simple_description; 
      quiz_info['description'] = user_quiz_info.data.description; 
  
      quiz_info['author'] = user_quiz_info.data.creator_name;
      quiz_info['author_icon'] = user_quiz_info.data.creator_icon_url;
      quiz_info['thumbnail'] = utility.isValidURL(user_quiz_info.data.thumbnail) ? user_quiz_info.data.thumbnail : ''; //썸네일은 그냥 quizbot으로 해두자
  
      quiz_info['quiz_size'] = user_quiz_info.question_list.length; 
      quiz_info['repeat_count'] = 1; //실제로는 안쓰는 값
      quiz_info['winner_nickname'] = user_quiz_info.data.winner_nickname;
      quiz_info['quiz_path'] = undefined;//dev quiz는 quiz_path 필요
      quiz_info['quiz_type'] = QUIZ_TYPE.CUSTOM;
      quiz_info['quiz_maker_type'] = QUIZ_MAKER_TYPE.CUSTOM;

      quiz_info['question_list'] = user_quiz_info.question_list;
  
      quiz_info['quiz_id'] = user_quiz_info.quiz_id;

      if(quiz_info['selected_question_count'] == undefined)
      {
        quiz_info['selected_question_count'] = quiz_info['quiz_size'];
      }
    }
  
  
}

module.exports = { UserQuizInfoUI };