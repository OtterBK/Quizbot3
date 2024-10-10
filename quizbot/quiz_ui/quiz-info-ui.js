'use strict';

//#region 필요한 외부 모듈

//#endregion

//#region 로컬 modules
const { SYSTEM_CONFIG } = require('../../config/system_setting.js');
const text_contents = require('../../config/text_contents.json')[SYSTEM_CONFIG.language]; 
const utility = require('../../utility/utility.js');
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
    this.max_quiz_count = 100;
    this.need_tags = false;
    this.custom_quiz_warned = false; //커스텀 퀴즈 설정 시 주의 사항 안내했는지 여부
    this.readonly = false;

    this.embed = {
      color: 0x87CEEB,
      title: `${this.quiz_info['icon'] ?? ''} ${this.quiz_info['title'] ?? ''}`,
      description: undefined,
      thumbnail: { //퀴즈 섬네일 표시
        url: this.quiz_info['thumbnail'] ?? '',
      },
      footer: { //퀴즈 제작자 표시
        text: this.quiz_info['author'] ?? '',
        icon_url: this.quiz_info['author_icon'] ?? '',
      },
    };

    this.components = [quiz_info_comp]; //여기서는 component를 바꿔서 해주자

    this.initializeQuizInfoUIEventHandler();

  }

  initializeQuizInfoUIEventHandler()
  {
    this.quiz_info_ui_handler =
    {
      'start': this.handleStartQuiz.bind(this),
      'scoreboard': this.handleRequestScoreboard.bind(this), 
      'settings': this.handleRequestSettingUI.bind(this), 
      'request_modal_quiz_setting': this.handleRequestModalQuizSetting.bind(this), 
      'modal_quiz_setting': this.handleSubmitModalQuizSetting.bind(this),
    };
  }

  refreshUI()
  {
    let description = this.getDescription();

    this.embed.description = description;
  }

  getDescription()
  {
    let description = text_contents.quiz_info_ui.description;
  
    return description
      .replace('${quiz_size}', `[ ${this.quiz_info['selected_question_count'] ?? this.quiz_info['quiz_size']} / ${this.max_quiz_count} ]`)
      .replace('${quiz_type_name}', `${this.quiz_info['type_name']}`)
      .replace('${quiz_description}', `${this.quiz_info['description']}`);
  }
  
  getTagInfoText() 
  {
    let tag_info_text = "\n";
    
    // 공식 퀴즈 설정
    tag_info_text += `📕 **공식 퀴즈 설정**\n`;
    const dev_quiz_tags = this.quiz_info['dev_quiz_tags'];
    const dev_quiz_tags_string = this.formatTagsString(dev_quiz_tags, SYSTEM_CONFIG.DEV_QUIZ_TAG, '음악 퀴즈');
    tag_info_text += `🔸 퀴즈 유형: \`음악 퀴즈\`\n`;
    tag_info_text += `🔹 퀴즈 장르: \`${dev_quiz_tags_string}\`\n\n`;
    
    // 유저 퀴즈 설정
    tag_info_text += `📘 **유저 퀴즈 설정(베타)**\n`;
    const custom_quiz_type_tags = this.quiz_info['custom_quiz_type_tags'];
    const custom_quiz_tags = this.quiz_info['custom_quiz_tags'];
    
    const custom_quiz_type_tags_string = this.getCustomQuizTypeString(custom_quiz_type_tags, custom_quiz_tags);
    const custom_quiz_tags_string = this.getCustomQuizTagsString(custom_quiz_tags, custom_quiz_type_tags);
    
    tag_info_text += `🔸 퀴즈 유형: \`${custom_quiz_type_tags_string}\`\n`;
    tag_info_text += `🔹 퀴즈 장르: \`${custom_quiz_tags_string}\`\n`;

    const certified_filter = this.quiz_info['certified_filter'] ?? true;
    tag_info_text += `🔹 인증 필터: \`${certified_filter ? '인증된 퀴즈만 출제' : '모든 퀴즈 출제' }\`\n\n`;
    
    return tag_info_text;
  }
  
  formatTagsString(tags) 
  {
    const tagsString = utility.convertTagsValueToString(tags, SYSTEM_CONFIG.DEV_QUIZ_TAG);
    return tagsString === '' ? '선택 안함' : tagsString;
  }
  
  getCustomQuizTypeString(typeTags, quizTags) 
  {
    if (typeTags === 0) 
    {
      return '선택 안함';
    }
    return utility.convertTagsValueToString(typeTags, SYSTEM_CONFIG.QUIZ_TAG);
  }
  
  getCustomQuizTagsString(quizTags, typeTags) 
  {
    if (quizTags === 0) 
    {
      return typeTags !== 0 ? '모든 장르(분류되지 않은 퀴즈 포함)' : '선택 안함';
    }
    return utility.convertTagsValueToString(quizTags, SYSTEM_CONFIG.QUIZ_TAG);
  }
  
  onInteractionCreate(interaction) 
  {
    if(this.isUnsupportedInteraction(interaction)) 
    {
      return;
    }

    if(this.isQuizInfoUIEvent(interaction))
    {
      return this.handleQuizInfoUIEvent(interaction);
    }
  }

  isQuizInfoUIEvent(interaction)
  {
    return this.quiz_info_ui_handler[interaction.customId] !== undefined;
  }

  handleQuizInfoUIEvent(interaction)
  {
    const handler = this.quiz_info_ui_handler[interaction.customId];
    return handler(interaction);
  }

  handleStartQuiz(interaction)
  {
    const quiz_info = this.quiz_info;

    if(this.checkTagSelected() === false)
    {
      interaction.explicit_replied = true;
      interaction.reply({content: `\`\`\`시작하시려면 퀴즈 유형 및 장르를 1개라도 선택해주세요!\`\`\``, ephemeral: true});
      return;
    }

    const guild = interaction.guild;
    const owner = interaction.member; //주최자
    const channel = interaction.channel;

    const check_ready = quiz_system.checkReadyForStartQuiz(guild, owner); //퀴즈를 플레이할 준비가 됐는지(음성 채널 참가 확인 등)
    if(check_ready === undefined || check_ready.result === false)
    {
      const reason = check_ready.reason;
      const reason_message = text_contents.quiz_info_ui.failed_start.replace("${reason}", reason);

      interaction.explicit_replied = true;
      interaction.reply({content: `\`\`\`${reason_message}\`\`\``, ephemeral: true});
      return;
    }
    
    quiz_system.startQuiz(guild, owner, channel, quiz_info); //퀴즈 시작

    return new AlertQuizStartUI(quiz_info, owner.displayName); 
  }

  handleRequestScoreboard(interaction)
  {
    //TODO 순위표 만들기
  }

  handleRequestSettingUI(interaction)
  {
    return new ServerSettingUI(interaction.guild.id);
  }

  handleRequestModalQuizSetting(interaction)
  {
    const quiz_info = this.quiz_info;
    const modal_current_quiz_setting = cloneDeep(modal_quiz_setting);
    
    modal_current_quiz_setting.components[0].components[0].setLabel(`몇 개의 문제를 제출할까요? (최대 ${quiz_info['quiz_size'] ?? this.max_quiz_count})`);
    
    interaction.explicit_replied = true;
    interaction.showModal(modal_current_quiz_setting); //퀴즈 설정 모달 전달
  }

  handleSubmitModalQuizSetting(interaction)
  {
    const need_refresh = this.applyQuizSettings(interaction);

    if(need_refresh === false)
    {
      return;
    }

    this.refreshUI();
    return this;
  }

  applyQuizSettings(interaction)
  {
    let need_refresh = false;

    need_refresh |= this.applySelectedQuestionCount(interaction);    

    return need_refresh;
  }

  applySelectedQuestionCount(interaction)
  {
    const input_selected_question_count = interaction.fields.getTextInputValue('txt_input_selected_question_count');

    if(input_selected_question_count === undefined || input_selected_question_count === '')
    {
      return false;
    }

    const quiz_info = this.quiz_info;
    const all_question_count = quiz_info['quiz_size'] ?? this.max_quiz_count;

    let selected_question_count = parseInt(input_selected_question_count.trim());
    if(isNaN(selected_question_count) || selected_question_count <= 0) //입력 값 잘못된거 처리
    {
      interaction.explicit_replied = true;
      interaction.reply({content: `\`\`\`문제 수 설정에 입력된 ${input_selected_question_count} 값은 잘못됐습니다.\n양수의 숫자만 입력해주세요.\`\`\``, ephemeral: true});
      return false;
    }

    if(selected_question_count > all_question_count)
    {
      selected_question_count = all_question_count;
    }
    
    interaction.explicit_replied = true;
    interaction.reply({content: `\`\`\`제출할 문제 수를 ${selected_question_count}개로 설정했습니다.\`\`\``, ephemeral: true});
    quiz_info['selected_question_count'] = selected_question_count;

    return true;
  }

  applyQuizTagsSetting(interaction)
  {
    const quiz_info = this.quiz_info;

    if(interaction.customId === 'toggle_certified_quiz_filter')
    {
      quiz_info['certified_filter'] = !quiz_info['certified_filter'];
      interaction.explicit_replied = true;

      if(quiz_info['certified_filter'] === false)
      {
        interaction.reply({content: `\`\`\`⚠ 주의! 인증 필터를 껐습니다.\n인증되지 않은 퀴즈를 포함한 모든 퀴즈가 출제 문제로 사용됩니다.\n출제될 문제는 다양해지지만 일반적으론 권장되지 않습니다.\`\`\``, ephemeral: true});
      }
      else
      {
        interaction.reply({content: `\`\`\`인증 필터를 켰습니다.\n인증된 퀴즈만 출제 문제로 사용됩니다.\`\`\``, ephemeral: true});
      }

      return true;
    }

    const tags_value = utility.calcTagsValue(interaction.values);
    let tags_value_type = '';
    if(interaction.customId === 'dev_quiz_tags_select_menu') //공식 퀴즈 장르 설정 시
    {
      tags_value_type = 'dev_quiz_tags';
    }
    else if(interaction.customId === 'custom_quiz_type_tags_select_menu') //유저 퀴즈 유형 설정 시
    {
      tags_value_type = 'custom_quiz_type_tags';
      this.sendCustomQuizWarning(interaction.channel);
    }
    else if(interaction.customId === 'custom_quiz_tags_select_menu') //유저 퀴즈 장르 설정 시
    {
      tags_value_type = 'custom_quiz_tags';
      this.sendCustomQuizWarning(interaction.channel);
    }
    
    if(tags_value_type === '')
    {
      return false;
    }

    const previous_tags_value = quiz_info[tags_value_type];
    if(previous_tags_value === tags_value) //같으면 할 게 없다
    {
      return false; 
    }

    quiz_info[tags_value_type] = tags_value;
    
    return true;
  }

  sendCustomQuizWarning(channel)
  {
    if(this.custom_quiz_warned === true)
    {
      return;
    }

    this.custom_quiz_warned = true;
    const warn_message = "```⚠ 주의! 퀴즈 유형에 유저 퀴즈를 설정하셨습니다.\n공식 퀴즈와 달리 유저 퀴즈는 장르 구분이 정확하지 않을 수 있습니다.\n또한 유저 퀴즈는 플레이 중 오류가 발생할 수 있으니 주의 바랍니다.```";
    channel.send({content: warn_message});
  }

  checkTagSelected()
  {
    return this.need_tags == false || this.quiz_info['dev_quiz_tags'] !== 0 || this.quiz_info['custom_quiz_type_tags'] !== 0;
  }

}

module.exports = { QuizInfoUI };