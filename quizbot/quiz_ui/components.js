/**
 * 모든 컴포넌트를 따로 모아뒀다.
 */

//#region 필요한 외부 모듈
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const cloneDeep = require("lodash/cloneDeep.js");
//#endregion

//#region 로컬 modules
const { SYSTEM_CONFIG, QUIZ_TAG, DEV_QUIZ_TAG } = require('../../config/system_setting.js');
const text_contents = require('../../config/text_contents.json')[SYSTEM_CONFIG.language]; 
//#endregion

//#region 기본 퀴즈 UI들
/** 기본 퀴즈 UI들 */
//ButtonStyle 바꿀 수도 있으니깐 개별로 넣어놓자
const select_btn_component = new ActionRowBuilder()
  .addComponents(
    new ButtonBuilder()
      .setCustomId('1')
    // .setLabel('1️⃣')
      .setLabel('1')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('2')
    // .setLabel('2️⃣')
      .setLabel('2')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('3')
    // .setLabel('3️⃣')
      .setLabel('3')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('4')
    // .setLabel('4️⃣')
      .setLabel('4')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('5')
    // .setLabel('5️⃣')
      .setLabel('5')
      .setStyle(ButtonStyle.Primary),
  );

//24.01.08 부터는 10개씩 보여준다. 대신 페이지 이동 뺐음
const select_btn_component2 = new ActionRowBuilder()
  .addComponents(
    new ButtonBuilder()
      .setCustomId('6')
      .setLabel('6')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('7')
      .setLabel('7')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('8')
      .setLabel('8')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('9')
      .setLabel('9')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('10')
      .setLabel('10')
      .setStyle(ButtonStyle.Primary),
  );

//페이지 이동
const modal_page_jump = new ModalBuilder()
  .setCustomId('modal_page_jump')
  .setTitle('페이지 이동')
  .addComponents(
    new ActionRowBuilder()
      .addComponents(
        new TextInputBuilder()
          .setCustomId('txt_input_page_jump')
          .setLabel('몇 페이지로 이동할까요?')
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(4)
          .setRequired(true)
          .setPlaceholder('예시) 1')
      ),
  );

const modal_complex_page_jump = new ModalBuilder() //검색과 이동을 한번에 하는 용도
  .setCustomId('modal_complex_page_jump')
  .setTitle('퀴즈 검색')
  .addComponents(
    new ActionRowBuilder()
      .addComponents(
        new TextInputBuilder()
          .setCustomId('txt_input_keyword')
          .setLabel('어떤 단어로 검색할까요?')
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(10)
          .setRequired(false)
          .setPlaceholder('아무것도 입력하지 않으면 모든 퀴즈가 표시됩니다.')
      ),
  )
  .addComponents(
    new ActionRowBuilder()
      .addComponents(
        new TextInputBuilder()
          .setCustomId('txt_input_page_jump')
          .setLabel('몇 페이지로 이동할까요?')
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(4)
          .setRequired(true)
          .setValue('1')
          .setPlaceholder('예시) 1')
      ),
  );

const page_select_menu = new StringSelectMenuBuilder().
  setCustomId('page_jump').
  setPlaceholder('페이지 이동');

const page_select_row = new ActionRowBuilder()
  .addComponents(
    new StringSelectMenuBuilder().
      setCustomId('page_jump_temp').
      setPlaceholder('페이지 이동')
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('페이지 정보를 계산하는 중...')
          .setValue('page_select_menu_temp'),
      )
  );

const control_btn_component = new ActionRowBuilder()
  .addComponents(
    new ButtonBuilder()
      .setCustomId('prev')
      .setLabel('이전 페이지')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('back')
      .setLabel('뒤로')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('request_modal_page_jump')
      .setLabel('점프')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('next')
      .setLabel('다음 페이지')
      .setStyle(ButtonStyle.Secondary),
  );

const main_ui_component = new ActionRowBuilder()
  .addComponents(
    new ButtonBuilder()
      .setLabel('개인 정보 보호 정책')
      .setURL('http://quizbot2.kro.kr')
      .setStyle(ButtonStyle.Link),
    new ButtonBuilder()
      .setLabel('봇 공유')
      .setURL('https://koreanbots.dev/bots/788060831660114012')
      .setStyle(ButtonStyle.Link),
  );

const option_control_btn_component = new ActionRowBuilder()
  .addComponents(
    new ButtonBuilder()
      .setCustomId('save_option_data')
      .setLabel('저장')
      .setDisabled(true)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('back')
      .setLabel('뒤로가기')
      .setStyle(ButtonStyle.Danger),
  );

const option_component = new ActionRowBuilder()
  .addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('option_select')
      .setPlaceholder(`${text_contents.server_setting_ui.select_menu.title}`)
      .addOptions(

        text_contents.server_setting_ui.select_menu.options.map(option_info => 
        {
          return { label: option_info.label, description: option_info.description, value: option_info.value };
        })

      ),
  );

const option_value_components = {

  audio_play_time:  createOptionValueComponents('audio_play_time'),
  hint_type:  createOptionValueComponents('hint_type'),
  skip_type:  createOptionValueComponents('skip_type'),
  use_similar_answer:  createOptionValueComponents('use_similar_answer'),
  score_type:  createOptionValueComponents('score_type'),
  improved_audio_cut:  createOptionValueComponents('improved_audio_cut'),
  use_message_intent:  createOptionValueComponents('use_message_intent'),
  score_show_max:  createOptionValueComponents('score_show_max'),
  max_chance:  createOptionValueComponents('max_chance'),
  
};

function createOptionValueComponents(option_name)
{
  return new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('option_value_select')
        .setPlaceholder(`${text_contents.server_setting_ui.select_menu.option_values.title}`)
        .addOptions(
    
          text_contents.server_setting_ui.select_menu.option_values[option_name].map(option_value_info => 
          {
            return { label: option_value_info.label, description: option_value_info.description, value: option_value_info.value };
          })
    
        ),
    );
}

const quiz_info_comp = new ActionRowBuilder()
  .addComponents(
    new ButtonBuilder()
      .setCustomId('start')
      .setLabel('시작')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('request_modal_quiz_setting')
      .setLabel('문제 수 설정')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('settings')
      .setLabel('서버 설정')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('back')
      .setLabel('뒤로가기')
      .setStyle(ButtonStyle.Secondary),
  );

const note_ui_component = new ActionRowBuilder()
  .addComponents(
    new ButtonBuilder()
      .setCustomId('notice')
      .setLabel('공지사항')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('patch_note')
      .setLabel('패치노트')
      .setStyle(ButtonStyle.Secondary),
  );

const only_back_comp = new ActionRowBuilder()
  .addComponents(
    new ButtonBuilder()
      .setCustomId('back')
      .setLabel('뒤로가기')
      .setStyle(ButtonStyle.Secondary),
  );

const sort_by_select_menu = new ActionRowBuilder()
  .addComponents(
    new StringSelectMenuBuilder().
      setCustomId('sort_by_select').
      setPlaceholder('정렬 방식 선택')
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('업데이트순')
          .setDescription('가장 최근에 업데이트된 퀴즈부터 표시합니다.')
          .setDefault(true)
          .setValue('modified_time'),

        new StringSelectMenuOptionBuilder()
          .setLabel('주간 인기순')
          .setDescription('이번주에 가장 많이 플레이된 퀴즈부터 표시합니다.')
          .setValue('played_count_of_week'),

        new StringSelectMenuOptionBuilder()
          .setLabel('전체 인기순')
          .setDescription('가장 많이 플레이된 퀴즈부터 표시합니다.')
          .setValue('played_count'),

        new StringSelectMenuOptionBuilder()
          .setLabel('전체 추천순')
          .setDescription('가장 많이 추천 받은 퀴즈부터 표시합니다.')
          .setValue('like_count'),

        new StringSelectMenuOptionBuilder()
          .setLabel('최신 퀴즈순')
          .setDescription('최근 생성된 퀴즈부터 표시합니다.')
          .setValue('birthtime'),

        new StringSelectMenuOptionBuilder()
          .setLabel('오래된 퀴즈순')
          .setDescription('가장 오래전에 생성된 퀴즈부터 표시합니다.')
          .setValue('birthtime_reverse'),
      )
  );

//#endregion

//#region 커스텀 퀴즈 관련 컴포넌트
/**  Custom quiz 관련 섹션 나중에 다 모듈화하자.........굳이 해야하나..?*/
const my_quiz_control_comp = new ActionRowBuilder()
  .addComponents(
    new ButtonBuilder()
      .setCustomId('request_modal_quiz_create')
      .setLabel('새로운 퀴즈 만들기')
      .setStyle(ButtonStyle.Success),
  );


const quiz_edit_comp = new ActionRowBuilder()
  .addComponents(
    new ButtonBuilder()
      .setCustomId('request_modal_quiz_edit')
      .setLabel('퀴즈 정보 수정')
      .setStyle(ButtonStyle.Primary),
  )
  .addComponents(
    new ButtonBuilder()
      .setCustomId('quiz_toggle_public')
      .setLabel('퀴즈 공개/비공개')
      .setStyle(ButtonStyle.Secondary),
  )
  .addComponents(
    new ButtonBuilder()
      .setCustomId('quiz_delete')
      .setLabel('퀴즈 삭제')
      .setStyle(ButtonStyle.Danger),
  );

const quiz_info_control_comp = new ActionRowBuilder()
  .addComponents(
    new ButtonBuilder()
      .setCustomId('request_modal_question_add')
      .setLabel('문제 추가')
      .setStyle(ButtonStyle.Success),
  )
  .addComponents(
    new ButtonBuilder()
      .setCustomId('back')
      .setLabel('뒤로가기')
      .setStyle(ButtonStyle.Secondary),
  );

//퀴즈 선택 UI에서 태그 선택용
const quiz_search_tags_select_menu =  new ActionRowBuilder()
  .addComponents(
    new StringSelectMenuBuilder().
      setCustomId('quiz_search_tags_select_menu').
      setPlaceholder('검색할 퀴즈 태그 선택하기')
  );
for(const [tag_name, tag_value] of Object.entries(QUIZ_TAG))
{
  const tag_option = { label: `${tag_name}`, value: `${tag_value}` };
  quiz_search_tags_select_menu.components[0].addOptions(tag_option);
}

//퀴즈 제작 UI에서 태그 지정용
const quiz_tags_select_menu =  new ActionRowBuilder()
  .addComponents(
    new StringSelectMenuBuilder().
      setCustomId('quiz_tags_select_menu').
      setPlaceholder('검색용 퀴즈 태그 선택하기 (여러 개 선택 가능)').
      setMaxValues(Object.keys(QUIZ_TAG).length)
  );
for(const [tag_name, tag_value] of Object.entries(QUIZ_TAG))
{
  const tag_option = { label: `${tag_name}`, value: `${tag_value}` };
  quiz_tags_select_menu.components[0].addOptions(tag_option);
}

const question_select_menu_comp =  new ActionRowBuilder()
  .addComponents(
    new StringSelectMenuBuilder().
      setCustomId('question_select_menu').
      setPlaceholder('수정할 문제 선택하기')
  );

const quiz_delete_confirm_comp = new ActionRowBuilder()
  .addComponents(
    new ButtonBuilder()
      .setCustomId('quiz_delete_cancel')
      .setLabel('아니요, 퀴즈를 삭제하지 않습니다.')
      .setStyle(ButtonStyle.Success),
  )
  .addComponents(
    new ButtonBuilder()
      .setCustomId('quiz_delete_confirmed')
      .setLabel('네, 퀴즈를 삭제합니다.')
      .setStyle(ButtonStyle.Danger),
  );

//퀴즈 만들기
const modal_quiz_info = new ModalBuilder()
  .setCustomId('modal_quiz_info')
  .setTitle('퀴즈 만들기')
  .addComponents(
    new ActionRowBuilder()
      .addComponents(
        new TextInputBuilder()
          .setCustomId('txt_input_quiz_title')
          .setLabel('퀴즈 제목을 입력하세요.')
          .setStyle(TextInputStyle.Short)
          .setMinLength(4)
          .setMaxLength(40)
          .setRequired(true)
          .setPlaceholder('예시) 2023년 팝송 맞추기')
      )
  )
  .addComponents(
    new ActionRowBuilder()
      .addComponents(
        new TextInputBuilder()
          .setCustomId('txt_input_quiz_simple_description')
          .setLabel('어떤 퀴즈인지 간단하게 소개해주세요.')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(60)
          .setRequired(false)
          .setPlaceholder('예시) 2023년대에 새로 나온 팝송 맞추기 퀴즈입니다.')
      )
  )
  .addComponents(
    new ActionRowBuilder()
      .addComponents(
        new TextInputBuilder()
          .setCustomId('txt_input_quiz_description')
          .setLabel('퀴즈에 대해 자유롭게 소개해주세요.')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(500)
          .setRequired(false)
          .setPlaceholder('예시) 2023년 인기를 얻었던 팝송 맞추기 퀴즈입니다!\n모건 월렌, 콤즈 등 유명한 노래가 포함되어 있습니다')
      )
  )
  .addComponents(
    new ActionRowBuilder()
      .addComponents(
        new TextInputBuilder()
          .setCustomId('txt_input_quiz_thumbnail')
          .setLabel('퀴즈의 썸네일 이미지 URL을 입력해주세요.')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(500)
          .setRequired(false)
          .setPlaceholder('예시) https://buly.kr/D3b6HK6')
      )
  );

//문제 만들기
const modal_question_info = new ModalBuilder()
  .setCustomId('modal_question_info')
  .setTitle('문제 만들기')
  .addComponents(
    new ActionRowBuilder()
      .addComponents(
        new TextInputBuilder()
          .setCustomId('txt_input_question_answers')
          .setLabel('주관식 문제의 정답을 입력해주세요.(정답이 여러개면 , 로 구분)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100)
          .setPlaceholder('카트라이더, 카트, kartrider')
      )
  )
  .addComponents(
    new ActionRowBuilder()
      .addComponents(
        new TextInputBuilder()
          .setCustomId('txt_input_question_audio_url')
          .setLabel('문제와 함께 재생할 음악입니다. [20분 이하의 영상만 가능]')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(500)
          .setPlaceholder('유튜브 URL 입력 (생략 시, 10초 타이머 BGM 사용)')
      )
  )
  .addComponents(
    new ActionRowBuilder()
      .addComponents(
        new TextInputBuilder()
          .setCustomId('txt_input_question_audio_range')
          .setLabel(`음악 재생 구간을 지정할 수 있습니다. [최대 ${SYSTEM_CONFIG.max_question_audio_play_time}초만 재생됨]`)
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(40)
          .setPlaceholder('예시) 40~80 또는 40 (생략 시, 랜덤 재생)')
      )
  )
  .addComponents(
    new ActionRowBuilder()
      .addComponents(
        new TextInputBuilder()
          .setCustomId('txt_input_question_image_url')
          .setLabel('문제와 함께 표시할 이미지입니다. [.Webp 사용 불가]')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(500)
          .setPlaceholder('이미지 URL 입력 (생략 가능)')
      )
  )
  .addComponents(
    new ActionRowBuilder()
      .addComponents(
        new TextInputBuilder()
          .setCustomId('txt_input_question_text')
          .setLabel('문제와 함께 표시할 텍스트입니다.')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(500)
          .setPlaceholder('자유롭게 텍스트 입력 (생략 가능)')
      )
  );

//문제 추가 설정
const modal_question_additional_info = new ModalBuilder()
  .setCustomId('modal_question_additional_info')
  .setTitle('문제 정보 설정')
  .addComponents(
    new ActionRowBuilder()
      .addComponents(
        new TextInputBuilder()
          .setCustomId('txt_input_hint')
          .setLabel('문제의 힌트를 직접 지정할 수 있습니다.')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(500)
          .setPlaceholder('예시) 한 때 유행했던 추억의 레이싱 게임! (생략 가능)')
      )
  )
  .addComponents(
    new ActionRowBuilder()
      .addComponents(
        new TextInputBuilder()
          .setCustomId('txt_input_hint_image_url')
          .setLabel('힌트와 함께 표시할 이미지입니다. [.Webp 사용 불가]')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(500)
          .setPlaceholder('이미지 URL 입력 (생략 가능)')
      )
  )
  .addComponents(
    new ActionRowBuilder()
      .addComponents(
        new TextInputBuilder()
          .setCustomId('txt_input_use_answer_timer')
          .setLabel('문제 제출 후 정답을 맞추기까지 여유 시간을 줍니다.(인트로 퀴즈에 사용)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(10)
          .setPlaceholder('예시) 사용 (생략 시, 미사용)')
      )
  );

//문제 정답 시 설정
const modal_question_answering_info = new ModalBuilder()
  .setCustomId('modal_question_answering_info')
  .setTitle('문제 정답 공개 시 설정')
  .addComponents(
    new ActionRowBuilder()
      .addComponents(
        new TextInputBuilder()
          .setCustomId('txt_input_answering_audio_url')
          .setLabel('정답 공개 시 함께 재생할 오디오입니다. [20분 이하의 영상만 가능]')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(500)
          .setPlaceholder('유튜브 URL 입력 (생략 가능)')
      )
  )
  .addComponents(
    new ActionRowBuilder()
      .addComponents(
        new TextInputBuilder()
          .setCustomId('txt_input_answering_audio_range')
          .setLabel(`정답용 음악 재생 구간을 지정할 수 있습니다. [최대 ${SYSTEM_CONFIG.max_answer_audio_play_time}초만 재생됨]`)
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder('예시) 40~50 (생략 시, 랜덤 재생)')
      )
  )
  .addComponents(
    new ActionRowBuilder()
      .addComponents(
        new TextInputBuilder()
          .setCustomId('txt_input_answering_image_url')
          .setLabel('정답 공개 시 함께 표시할 이미지입니다. [.Webp 사용 불가]')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(500)
          .setPlaceholder('이미지 URL 입력 (생략 가능)')
      )
  )
  .addComponents(
    new ActionRowBuilder()
      .addComponents(
        new TextInputBuilder()
          .setCustomId('txt_input_answering_text')
          .setLabel('정답 공개 시 정답과 함께 표시할 텍스트입니다.')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(500)
          .setPlaceholder('자유롭게 텍스트 입력 (생략 가능)')
      )
  );

const modal_question_info_edit = cloneDeep(modal_question_info); //문제 수정용 modal
modal_question_info_edit.setCustomId('modal_question_info_edit');

const question_edit_comp = new ActionRowBuilder()
  .addComponents(
    new ButtonBuilder()
      .setCustomId('request_modal_question_info_edit')
      .setLabel('기본 정보 설정')
      .setStyle(ButtonStyle.Primary),
  )
  .addComponents(
    new ButtonBuilder()
      .setCustomId('request_modal_question_additional_info')
      .setLabel('추가 정보 설정')
      .setStyle(ButtonStyle.Primary),
  )
  .addComponents(
    new ButtonBuilder()
      .setCustomId('request_modal_question_answering_info')
      .setLabel('정답 이벤트 설정')
      .setStyle(ButtonStyle.Primary),
  )
  .addComponents(
    new ButtonBuilder()
      .setCustomId('question_refresh')
      .setLabel('이미지 재로드')
      .setStyle(ButtonStyle.Primary),
  );

const question_edit_comp2 = new ActionRowBuilder()
  .addComponents(
    new ButtonBuilder()
      .setCustomId('request_modal_question_add')
      .setLabel('새로운 문제 추가')
      .setStyle(ButtonStyle.Success),
  )
  .addComponents(
    new ButtonBuilder()
      .setCustomId('question_delete')
      .setLabel('현재 문제 삭제')
      .setStyle(ButtonStyle.Danger),
  );

const question_answer_type_select_menu = new ActionRowBuilder()
  .addComponents(
    new StringSelectMenuBuilder().
      setCustomId('question_answer_type_select_menu').
      setPlaceholder('문제 유형 선택')
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('주관식')
          .setDescription('플레이어는 메세지로 정답을 입력하는 방식입니다.')
          .setDefault(true)
          .setValue('answer_type_short_answer'),

        new StringSelectMenuOptionBuilder()
          .setLabel('O/X 선택')
          .setDescription('플레이어는 O 또는 X 만 선택할 수 있습니다.')
          .setValue('answer_type_ox'),

        new StringSelectMenuOptionBuilder()
          .setLabel('객관식')
          .setDescription('플레이어는 1,2,3,4,5 중 하나를 선택해야합니다.')
          .setValue('answer_type_multiple_choice'),
      )
  );

const question_control_btn_component = new ActionRowBuilder()
  .addComponents(
    new ButtonBuilder()
      .setCustomId('prev_question')
      .setLabel('이전 문제')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('back')
      .setLabel('뒤로가기')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('next_question')
      .setLabel('다음 문제')
      .setStyle(ButtonStyle.Secondary),
  );

//사용자 개발 퀴즈 선택 UI
const btn_search = new ButtonBuilder()
  .setCustomId('request_modal_complex_page_jump')
  .setLabel('검색')
  .setStyle(ButtonStyle.Secondary);

//#endregion

//#region 오마카세 퀴즈 관련 컴포넌트

//#region OMAKASE QUIZ

const modal_quiz_setting = new ModalBuilder()
  .setCustomId('modal_quiz_setting')
  .setTitle('문제 수 설정')
  .addComponents(
    new ActionRowBuilder()
      .addComponents(
        new TextInputBuilder()
          .setCustomId('txt_input_selected_question_count')
          .setLabel('몇 개의 문제를 제출할까요? (최대 100)')
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(3)
          .setRequired(true)
          .setPlaceholder('예시) 30')
      ),
  );

//오마카세 퀴즈에서 공식 퀴즈 장르 지정용
const omakase_dev_quiz_tags_select_menu =  new ActionRowBuilder()
  .addComponents(
    new StringSelectMenuBuilder().
      setCustomId('dev_quiz_tags_select_menu').
      setPlaceholder('공식 퀴즈 장르 선택하기').
      setMaxValues(Object.keys(DEV_QUIZ_TAG).length)
  );
for(const [tag_name, tag_value] of Object.entries(DEV_QUIZ_TAG))
{
  const tag_option = { label: `${tag_name}`, value: `${tag_value}` };
  omakase_dev_quiz_tags_select_menu.components[0].addOptions(tag_option);
}

//오마카세 퀴즈에서 유저 퀴즈 유형 지정용
const omakase_custom_quiz_type_tags_select_menu =  new ActionRowBuilder()
  .addComponents(
    new StringSelectMenuBuilder().
      setCustomId('custom_quiz_type_tags_select_menu').
      setPlaceholder('유저 퀴즈 유형 선택하기').
      setMaxValues(Object.keys(QUIZ_TAG).length)
  );
{
  let total_menu_count = 0;
  for(const [tag_name, tag_value] of Object.entries(QUIZ_TAG))
  {
    if(tag_value > 4) //4이하까지만 유형 태그임
    {
      continue; 
    }
  
    const tag_option = { label: `${tag_name}`, value: `${tag_value}` };
    omakase_custom_quiz_type_tags_select_menu.components[0].addOptions(tag_option);
    total_menu_count++;
  }
  omakase_custom_quiz_type_tags_select_menu.components[0].setMaxValues(total_menu_count);
}


//오마카세 퀴즈에서 유저 퀴즈 장르 지정용
const omakase_custom_quiz_tags_select_menu =  new ActionRowBuilder()
  .addComponents(
    new StringSelectMenuBuilder().
      setCustomId('custom_quiz_tags_select_menu').
      setPlaceholder('유저 퀴즈 장르 선택하기').
      setMaxValues(Object.keys(QUIZ_TAG).length)
  );
{
  let total_menu_count = 0;
  for(const [tag_name, tag_value] of Object.entries(QUIZ_TAG))
  {
    if(tag_value !== 0 && tag_value <= 4) //4이하는 장르 태그가 아님
    {
      continue;
    }
  
    const tag_option = { label: `${tag_name}`, value: `${tag_value}` };
    omakase_custom_quiz_tags_select_menu.components[0].addOptions(tag_option);
    total_menu_count++;
  }
  omakase_custom_quiz_tags_select_menu.components[0].setMaxValues(total_menu_count);
}

/** 멀티플레이 관련 컴포넌트 */
const modal_multiplayer_create_lobby = new ModalBuilder()
  .setCustomId('modal_multiplayer_create_lobby')
  .setTitle('새로운 로비 생성')
  .addComponents(
    new ActionRowBuilder()
      .addComponents(
        new TextInputBuilder()
          .setCustomId('txt_input_lobby_name')
          .setLabel('방 제목을 입력해주세요.')
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(20)
          .setRequired(true)
          .setPlaceholder('예시) 즐겜할 사람~')
      )
  );

//로비 생성하고 따라 나눈 이유는 나중에라도 생성 전용 설정 값이 있을까봐
const modal_multiplayer_edit_lobby = new ModalBuilder()
  .setCustomId('modal_multiplayer_edit_lobby')
  .setTitle('로비 설정')
  .addComponents(
    new ActionRowBuilder()
      .addComponents(
        new TextInputBuilder()
          .setCustomId('txt_input_lobby_name')
          .setLabel('방 제목을 입력해주세요.')
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(20)
          .setRequired(true)
          .setPlaceholder('예시) 즐겜할 사람~')
      )
  );

//멀티플레이 방 선택 UI용 컴포넌트
const multiplayer_select_control = new ActionRowBuilder()
  .addComponents(
    new ButtonBuilder()
      .setCustomId('request_modal_multiplayer_create_lobby')
      .setLabel('새로운 로비 생성')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('multiplayer_refresh_lobby_list')
      .setLabel('새로고침')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('multiplayer_scoreboard')
      .setLabel('순위표')
      .setStyle(ButtonStyle.Secondary),
  );

const multiplayer_lobby_host_comp = new ActionRowBuilder()
  .addComponents(
    new ButtonBuilder()
      .setCustomId('multiplayer_start')
      .setLabel('시작')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('request_modal_quiz_setting')
      .setLabel('문제 수 설정')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('request_modal_multiplayer_settings')
      .setLabel('로비 설정')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('back')
      .setLabel('나가기')
      .setStyle(ButtonStyle.Danger),
  );

const multiplayer_lobby_participant_comp = new ActionRowBuilder()
  .addComponents(
    new ButtonBuilder()
      .setCustomId('back')
      .setLabel('나가기')
      .setStyle(ButtonStyle.Danger),
  );

const multiplayer_lobby_kick_select_menu = new StringSelectMenuBuilder().
  setCustomId('multiplayer_lobby_kick_select_menu').
  setPlaceholder('서버 추방하기');

const multiplayer_lobby_participant_select_menu = new StringSelectMenuBuilder().
  setCustomId('multiplayer_lobby_participant_select_menu').
  setPlaceholder('참여 중인 서버 목록 확인');

const multiplayer_lobby_kick_select_row = new ActionRowBuilder()
  .addComponents(
    new StringSelectMenuBuilder().
      setCustomId('multiplayer_lobby_participant_select_row').
      setPlaceholder('참여 중인 서버 목록 확인')
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('참가자 목록을 갱신하는 중...')
          .setValue('participant_select_menu_temp'),
      )
  );

//#endregion

module.exports = {
  select_btn_component,
  select_btn_component2,
  modal_page_jump,
  modal_complex_page_jump,
  page_select_menu,
  page_select_row,
  control_btn_component,
  main_ui_component,
  option_control_btn_component,
  option_component,
  option_value_components,
  createOptionValueComponents,
  quiz_info_comp,
  note_ui_component,
  only_back_comp,
  sort_by_select_menu,
  my_quiz_control_comp,
  quiz_edit_comp,
  quiz_info_control_comp,
  quiz_search_tags_select_menu,
  quiz_tags_select_menu,
  question_select_menu_comp,
  quiz_delete_confirm_comp,
  modal_quiz_info,
  modal_question_info,
  modal_question_additional_info,
  modal_question_info_edit,
  modal_question_answering_info,
  question_edit_comp,
  question_edit_comp2,
  question_answer_type_select_menu,
  question_control_btn_component,
  btn_search,
  modal_quiz_setting,
  omakase_dev_quiz_tags_select_menu,
  omakase_custom_quiz_type_tags_select_menu,
  omakase_custom_quiz_tags_select_menu,
  multiplayer_select_control,
  modal_multiplayer_create_lobby,
  multiplayer_lobby_host_comp,
  multiplayer_lobby_participant_comp,
  modal_multiplayer_edit_lobby,
  multiplayer_lobby_kick_select_menu,
  multiplayer_lobby_kick_select_row,
  multiplayer_lobby_participant_select_menu,
};