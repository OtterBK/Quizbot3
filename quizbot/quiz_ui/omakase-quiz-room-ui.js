'use strict';

//#region 필요한 외부 모듈

//#endregion

//#region 로컬 modules
const { SYSTEM_CONFIG, QUIZ_MAKER_TYPE, QUIZ_TYPE } = require('../../config/system_setting.js');
const text_contents = require('../../config/text_contents.json')[SYSTEM_CONFIG.language]; 
const quiz_system = require('../quiz_system/quiz_system.js'); //퀴즈봇 메인 시스템
const utility = require('../../utility/utility.js');
const {
  omakase_quiz_info_comp,
  modal_omakase_setting,
  omakase_dev_quiz_tags_select_menu,
  omakase_custom_quiz_type_tags_select_menu,
  omakase_custom_quiz_tags_select_menu
} = require("./components.js");

const { 
  QuizbotUI,
} = require("./common-ui.js");


const { AlertQuizStartUI } = require("./alert-quiz-start-ui.js");
const { ServerSettingUI } = require("./server-setting-ui.js");

//#endregion

/** OMAKASE QUIZ Room*/
/** 오마카세 퀴즈 설정 용. 로비 형식임 */
class OmakaseQuizRoomUI extends QuizbotUI
{
  static createDefaultOmakaseQuizInfo = (interaction) =>
  {
    const guild = interaction.guild;
    let quiz_info = {};

    quiz_info['title']  = "오마카세 퀴즈";
    quiz_info['icon'] = '🍴';

    quiz_info['type_name'] = "**퀴즈봇 마음대로 퀴즈!**"; 
    quiz_info['description'] = "장르 선택 메뉴에서 플레이하실 퀴즈 장르를 선택해주세요!\n선택하신 장르에 따라 퀴즈봇이 문제를 제출합니다.\n\n장르는 여러 개 선택 가능합니다!\n문제 수도 설정 가능합니다!\n\n"; 

    quiz_info['author'] = guild.name ?? guild.id;
    quiz_info['author_icon'] = guild.iconURL() ?? '';
    quiz_info['thumbnail'] = ''; //썸네일은 고정 이미지가 있지롱 ㅎ

    quiz_info['quiz_size'] = 30; //default
    quiz_info['repeat_count'] = 1; //실제로는 안쓰는 값
    quiz_info['winner_nickname'] = "플레이어";
    quiz_info['quiz_path'] = undefined;//oamakase quiz는 quiz_path 불필요
    quiz_info['quiz_type'] = QUIZ_TYPE.OMAKASE;
    quiz_info['quiz_maker_type'] = QUIZ_MAKER_TYPE.OMAKASE;

    quiz_info['quiz_id'] = undefined;  //omasakse quiz는 quiz_id 불필요

    //오마카세 퀴즈용 추가 설정 값
    quiz_info['dev_quiz_tags'] = 0;
    
    quiz_info['custom_quiz_type_tags'] = 0;
    quiz_info['custom_quiz_tags'] = 0;

    quiz_info['max_question_count'] = 30; //default

    quiz_info['room_owner'] = interaction.member;

    return quiz_info;
  }

  constructor(quiz_info)
  {
    super();

    this.quiz_info = quiz_info;
    this.custom_quiz_warned = false; //커스텀 퀴즈 설정 시 주의 사항 안내했는지 여부

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

    this.refreshUI();

    this.components = [omakase_quiz_info_comp, omakase_dev_quiz_tags_select_menu, omakase_custom_quiz_type_tags_select_menu, omakase_custom_quiz_tags_select_menu]; //여기서는 component를 바꿔서 해주자
  }

  onInteractionCreate(interaction) 
  {
    if(!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return;

    if(interaction.customId == 'start') //시작 버튼 눌렀을 때
    {
      const quiz_info = this.quiz_info;

      if(quiz_info['dev_quiz_tags'] == 0
        && (quiz_info['custom_quiz_type_tags'] == 0)
      )
      {
        interaction.channel.send({content: ">>> 시작하시려면 퀴즈 유형 및 장르를 1개라도 선택해주세요!"});
        return;        
      }

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

    /** 오마카세 퀴즈 전용*/
    if(interaction.customId == 'request_modal_omakase_setting') //오마카세 설정 버튼 눌렀을 때
    {
      interaction.showModal(modal_omakase_setting); //퀴즈 생성 모달 전달
      return;
    }

    if(interaction.customId == 'modal_omakase_setting') //오마카세 설정 값 제출 시,
    {
      return this.applyOmakaseSettings(interaction);
    }

    if(interaction.customId == 'dev_quiz_tags_select_menu'
      || interaction.customId == 'custom_quiz_type_tags_select_menu'
      || interaction.customId == 'custom_quiz_tags_select_menu') //퀴즈 장르 설정 시
    {
      return this.applyQuizTagsSetting(interaction);
    }
  }

  applyOmakaseSettings(interaction)
  {
    const quiz_info = this.quiz_info;
    const room_owner = quiz_info['room_owner'];

    // if(room_owner.id != interaction.member.id)
    // {
    //   interaction.reply({content: `>>> 방장인 ${room_owner.displayName} 님만 설정이 가능합니다.`, ephemeral: true});
    //   return undefined;
    // }

    const input_max_question_count = interaction.fields.getTextInputValue('txt_input_max_question_count');

    if(input_max_question_count == undefined || input_max_question_count == '')
    {
      interaction.deferUpdate(); //defer은 해준다.
      return undefined;
    }

    let max_question_count = parseInt(input_max_question_count.trim());
    if(isNaN(max_question_count) || max_question_count <= 0) //입력 값 잘못된거 처리
    {
      interaction.reply({content: `>>> 문제 수 설정에 입력된 ${input_max_question_count} 값은 잘못됐습니다.\n양수의 숫자만 입력해주세요.`, ephemeral: true});
      return undefined;
    }

    if(max_question_count > 100)
    {
      max_question_count = 100;
    }
    
    interaction.reply({content: `>>> 제출할 문제 수를 ${max_question_count}개로 설정했습니다.`, ephemeral: true});
    quiz_info['quiz_size'] = max_question_count;
    quiz_info['max_question_count'] = max_question_count;

    this.refreshUI();
    return this;
  }

  calcTagsValue(values)
  {
    let tags_value = 0;
    for(const tag_value of values)
    {
      tags_value += parseInt(tag_value);
    }
    return tags_value;
  }

  applyQuizTagsSetting(interaction)
  {
    const quiz_info = this.quiz_info;
    const tags_value = this.calcTagsValue(interaction.values);

    let tags_value_type = 'dev_quiz_tags';
    if(interaction.customId == 'dev_quiz_tags_select_menu') //공식 퀴즈 장르 설정 시
    {
      tags_value_type = 'dev_quiz_tags';
    }
    else if(interaction.customId == 'custom_quiz_type_tags_select_menu') //유저 퀴즈 유형 설정 시
    {
      tags_value_type = 'custom_quiz_type_tags';
      this.sendCustomQuizWarning(interaction.channel);
    }
    else if(interaction.customId == 'custom_quiz_tags_select_menu') //유저 퀴즈 장르 설정 시
    {
      tags_value_type = 'custom_quiz_tags';
      this.sendCustomQuizWarning(interaction.channel);
    }
    
    const previous_tags_value = quiz_info[tags_value_type];
    if(previous_tags_value == tags_value) //같으면 할 게 없다
    {
      return undefined; 
    } 

    quiz_info[tags_value_type] = tags_value;
    
    this.refreshUI();
    return this;
  }

  customQuizTypeTagsSetting(interaction)
  {
    const quiz_info = this.quiz_info;

    let tags_value = 0;
    for(const tag_value of interaction.values)
    {
      tags_value += parseInt(tag_value);
    }
    quiz_info['dev_quiz_tags'] = tags_value;
  }

  customQuizTagsSetting(interaction)
  {
    const quiz_info = this.quiz_info;

    let tags_value = 0;
    for(const tag_value of interaction.values)
    {
      tags_value += parseInt(tag_value);
    }
    quiz_info['dev_quiz_tags'] = tags_value;
  }

  refreshUI()
  {
    const quiz_info = this.quiz_info;
    let description = text_contents.quiz_info_ui.description;

    description = description.replace('${quiz_type_name}', `${quiz_info['type_name']}`);
    description = description.replace('${quiz_size}', `${quiz_info['quiz_size']}`);
    description = description.replace('${quiz_description}', `${quiz_info['description']}`);
    
    let tag_info_text = "\n";

    tag_info_text += `📕 **공식 퀴즈 설정**\n`;
    const dev_quiz_tags = quiz_info['dev_quiz_tags'];
    let dev_quiz_tags_string = utility.convertTagsValueToString(dev_quiz_tags, SYSTEM_CONFIG.DEV_QUIZ_TAG);
    if(dev_quiz_tags_string == '')
    {
      dev_quiz_tags_string = '선택 안함';
    }

    tag_info_text += '🔸 퀴즈 유형: `음악 퀴즈`\n';
    tag_info_text += '🔹 퀴즈 장르: `' + (dev_quiz_tags_string) + '`\n';
    tag_info_text += "\n";

    tag_info_text += `📘 **유저 퀴즈 설정(베타)**\n`;
    const custom_quiz_type_tags = quiz_info['custom_quiz_type_tags'];
    let custom_quiz_type_tags_string = utility.convertTagsValueToString(custom_quiz_type_tags, SYSTEM_CONFIG.QUIZ_TAG);
    if(custom_quiz_type_tags_string == '')
    {
      custom_quiz_type_tags_string = '선택 안함';
    }

    const custom_quiz_tags = quiz_info['custom_quiz_tags'];
    let custom_quiz_tags_string = utility.convertTagsValueToString(custom_quiz_tags, SYSTEM_CONFIG.QUIZ_TAG);
    if(custom_quiz_type_tags != 0 && custom_quiz_tags == 0) //유저 퀴즈 유형에 뭐라도 선택했다?
    {
      custom_quiz_tags_string = '모든 장르(분류되지 않은 퀴즈 포함)';
    }
    else if(custom_quiz_tags_string == '')
    {
        custom_quiz_tags_string = '선택 안함';
    }
    
    tag_info_text += '🔸 퀴즈 유형: `' + (custom_quiz_type_tags_string) + '`\n';
    tag_info_text += '🔹 퀴즈 장르: `' + (custom_quiz_tags_string) + '`\n';
    tag_info_text += "\n";

    description += tag_info_text + " \n";

    this.embed.description = description;
  }

  sendCustomQuizWarning(channel)
  {
    if(this.custom_quiz_warned == true)
    {
      return;
    }

    this.custom_quiz_warned = true;
    const warn_message = "```⚠ 주의! 오마카세 퀴즈에서 유저 퀴즈를 설정하셨습니다.\n공식 퀴즈와 달리 유저 퀴즈는 장르 구분이 정확하지 않을 수 있습니다.\n또한 유저 퀴즈는 플레이 중 오류가 발생할 수 있으니 주의 바랍니다.```"
    channel.send({content: warn_message});
  }
}

module.exports = { OmakaseQuizRoomUI };