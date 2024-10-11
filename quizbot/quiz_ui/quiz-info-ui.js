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
  omakase_basket_select_menu,
  omakase_basket_select_row,
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

    this.modal_quiz_setting = cloneDeep(modal_quiz_setting);
    this.basket_select_component = cloneDeep(omakase_basket_select_row);

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
      'use_tag_mode': this.handleRequestUseTagMode.bind(this), 
      'use_basket_mode': this.handleRequestUseBasketMode.bind(this), 
      'basket_select_menu': this.handleBasketSelected.bind(this), 
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
    
    tag_info_text += `📗 **유저 퀴즈 설정**\n`;
    const use_basket_mode = this.quiz_info['basket_mode'] ?? false;
    if(use_basket_mode === false)
    {
      // 유저 퀴즈 설정
      const custom_quiz_type_tags = this.quiz_info['custom_quiz_type_tags'];
      const custom_quiz_tags = this.quiz_info['custom_quiz_tags'];

      const custom_quiz_type_tags_string = this.getCustomQuizTypeString(custom_quiz_type_tags, custom_quiz_tags);
      const custom_quiz_tags_string = this.getCustomQuizTagsString(custom_quiz_tags, custom_quiz_type_tags);

      tag_info_text += `🔸 퀴즈 유형: \`${custom_quiz_type_tags_string}\`\n`;
      tag_info_text += `🔹 퀴즈 장르: \`${custom_quiz_tags_string}\`\n`;

      const certified_filter = this.quiz_info['certified_filter'] ?? true;
      tag_info_text += `🔹 인증 필터: \`${certified_filter ? '인증된 퀴즈만 출제' : '모든 퀴즈 출제' }\`\n\n`;
    }
    else
    {
      tag_info_text += `🔸 \`장바구니 모드 사용 중(베타)\`\n\n`;
    }
    
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

  onAwaked() //ui 재활성화 됐을 때, UserQuestionInfo 에서 back 쳐서 돌아왔을 때, select menu 랑 문제 수 갱신해줘야함. 장바구니도 고려
  {
    this.refreshUI();
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
      interaction.reply({content: `\`\`\`🔸 시작하시려면 퀴즈 유형 및 장르를 1개라도 선택해주세요!\`\`\``, ephemeral: true});
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
      interaction.reply({content: `\`\`\`🔸 ${reason_message}\`\`\``, ephemeral: true});
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
    const modal_current_quiz_setting = this.modal_quiz_setting;

    const selected_question_count_component = this.getComponentFromModalComponent(modal_current_quiz_setting, 'txt_input_selected_question_count');
    if(selected_question_count_component !== undefined)
    {
      selected_question_count_component.setLabel(`몇 개의 문제를 제출할까요? (최대 ${this.quiz_info['quiz_size'] ?? this.max_quiz_count})`);
      selected_question_count_component.setValue(`${this.quiz_info.selected_question_count}`);
    }

    const custom_title_component = this.getComponentFromModalComponent(modal_current_quiz_setting, 'txt_input_custom_title');
    if(custom_title_component !== undefined)
    {
      custom_title_component.setValue(`${this.quiz_info.title}`);
    }

    const certified_filter_off_component = this.getComponentFromModalComponent(modal_current_quiz_setting, 'txt_input_certified_quiz_filter_off');
    if(certified_filter_off_component !== undefined)
    {
      const use_certified_filter = this.quiz_info.certified_filter ?? true;
      certified_filter_off_component.setValue(`${use_certified_filter ? '' : '네'}`);
    }
    
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

  checkHasComponentFieldFromModalSubmit(interaction, custom_id)
  {
    const exists = interaction.fields.components.some(row =>
      row.components.some(component => component.customId === custom_id)
    );

    return exists;
  }

  getComponentFromModalComponent(modal_comp, custom_id)
  {
    const target_component = modal_comp.components
      .flatMap(actionRow => actionRow.components)
      .find(component => 
      {
        if(component.data.custom_id === custom_id)
        {
          return true;
        }
      });

    return target_component;
  }

  applyQuizSettings(interaction)
  {
    let need_refresh = false;

    need_refresh |= this.applySelectedQuestionCount(interaction);  
    need_refresh |= this.applyCustomTitle(interaction);
    need_refresh |= this.applyCertifiedFilter(interaction);

    return need_refresh;
  }

  applySelectedQuestionCount(interaction)
  {
    if(this.checkHasComponentFieldFromModalSubmit(interaction, 'txt_input_selected_question_count') === false)
    {
      return false;
    }

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
      interaction.reply({content: `\`\`\`🔸 문제 수 설정에 입력된 ${input_selected_question_count} 값은 잘못됐습니다.\n양수의 숫자만 입력해주세요.\`\`\``, ephemeral: true});
      return false;
    }

    if(selected_question_count > all_question_count)
    {
      selected_question_count = all_question_count;
    }
    
    // interaction.explicit_replied = true;
    // interaction.reply({content: `\`\`\`🔸 제출할 문제 수를 ${selected_question_count}개로 설정했습니다.\`\`\``, ephemeral: true});
    quiz_info['selected_question_count'] = selected_question_count;

    return true;
  }

  applyCustomTitle(interaction)
  {
    if(this.checkHasComponentFieldFromModalSubmit(interaction, 'txt_input_custom_title') === false)
    {
      return false;
    }

    const lobby_name = interaction.fields.getTextInputValue('txt_input_custom_title');
    if(lobby_name === undefined || lobby_name === '' || this.quiz_info['title'] === lobby_name)
    {
      return true;
    }

    this.quiz_info['title'] = lobby_name;
    return true;
  }

  applyCertifiedFilter(interaction)
  {
    if(this.checkHasComponentFieldFromModalSubmit(interaction, 'txt_input_certified_quiz_filter_off') === false)
    {
      return false;
    }

    const is_offed = interaction.fields.getTextInputValue('txt_input_certified_quiz_filter_off');

    const use_certified_filter = (is_offed === ''); //쨋든 뭐라도 들어가있으면 off임
    
    if(this.quiz_info['certified_filter'] === use_certified_filter)
    {
      return false;
    }

    this.quiz_info['certified_filter'] = use_certified_filter;
    
    if(use_certified_filter === false)
    {
      interaction.channel.send({content: `\`\`\`⚠ 주의! 인증 필터가 꺼졌습니다.\n인증되지 않은 퀴즈를 포함한 모든 퀴즈가 출제 문제로 사용됩니다.\n출제될 문제는 다양해지지만 일반적으론 권장되지 않습니다.\`\`\``});
    }
    else
    {
      interaction.channel.send({content: `\`\`\`🔸 인증 필터가 켜졌습니다.\n인증된 퀴즈만 출제 문제로 사용됩니다.\`\`\``});
    }

    return true;
  }

  applyQuizTagsSetting(interaction)
  {
    const quiz_info = this.quiz_info;

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
    return this.need_tags == false || this.quiz_info['dev_quiz_tags'] !== 0 || this.quiz_info['custom_quiz_type_tags'] !== 0 || (this.quiz_info['basket_mode'] && Object.keys(this.quiz_info['basket_items']).length > 0);
  }

  handleRequestUseBasketMode(interaction)
  {
    //일반적으론 지원하지 않음
  }

  handleRequestUseTagMode(interaction)
  {
    //일반적으로 지원하지 않음
  }

  setupBasketSelectMenu() 
  {
    const use_basket_mode = this.quiz_info['basket_mode'] ?? false;
    if(use_basket_mode === false)
    {
      return;
    }

    const basket_items = this.quiz_info['basket_items'] ?? {};
    let basket_select_menu_for_current = cloneDeep(omakase_basket_select_menu);

    const basket_keys = Object.keys(basket_items);
    if(basket_keys.length === 0)
    {
      const option = { label: `장바구니가 비어있습니다.`, description: `.`, value: `basket_select_temp` };
      basket_select_menu_for_current.addOptions(option);
      return;
    }
  
    basket_select_menu_for_current.setMaxValues(basket_keys.length);
    for (const key of basket_keys) 
    {
      const basket_item = basket_items[key];

      const quiz_id = basket_item.quiz_id;
      const quiz_title = basket_item.title;

      const option = { label: `${quiz_title}`, description: `선택하여 장바구니에서 제거`, value: `${quiz_id}` };
      
      basket_select_menu_for_current.addOptions(option);
    }

    this.basket_select_component.components[0] = basket_select_menu_for_current;
  }

  handleBasketSelected(interaction)
  {
    const selected_values = interaction.values;

    let basket_items = this.quiz_info['basket_items'] ?? {};
    let remove_count = 0;
    for(const key of selected_values)
    {
      delete basket_items[key];
      ++remove_count;
    }

    interaction.explicit_replied = true;
    interaction.reply({content: `\`\`\`🔸 장바구니에서 ${remove_count}개의 퀴즈를 제거했습니다.\`\`\``});

    this.refreshUI();
    return this;
  }

}

module.exports = { QuizInfoUI };