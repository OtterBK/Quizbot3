'use strict';

//#region 필요한 외부 모듈
const cloneDeep = require("lodash/cloneDeep.js");

//#endregion

//#region 로컬 modules

const { SYSTEM_CONFIG, CUSTOM_EVENT_TYPE,} = require('../../config/system_setting.js');
const text_contents = require('../../config/text_contents.json')[SYSTEM_CONFIG.language]; 
const logger = require('../../utility/logger.js')('QuizUI');
const {
  select_btn_component,
  select_btn_component2,
  modal_page_jump,
  page_select_menu,
  page_select_row,
  control_btn_component,
} = require("./components.js");

/** QuizBotUI 기본 UI*/
class QuizbotUI 
{

  constructor()
  {
    this.holder = undefined; 
    this.expired = false; //UI가 정상 해제됐는지 여부

    this.embed = {};
    this.components = [ select_btn_component, select_btn_component2 ]; //이게 기본 component임
  }
  
  //각 ui 별 on은 필요시 구현
  on(event_name, event_object)
  {
    switch(event_name) 
    {
    case CUSTOM_EVENT_TYPE.interactionCreate:
      return this.onInteractionCreate(event_object);
          
    case CUSTOM_EVENT_TYPE.receivedMultiplayerSignal:
      return this.onReceivedMultiplayerSignal(event_object);
    
    default: return undefined;
    }
  }
  
  onReady() //ui 최초 등록 됐을 때
  {
  
  }
  
  onInteractionCreate(event_object) //더미용 이벤트 콜백
  {
  
  }

  onReceivedMultiplayerSignal(event_object) //더미용 이벤트 콜백
  {
  
  }
  
  onAwaked() //UI 재활성화 됐을 때
  {
  
  }

  onExpired() //UI 사라질 떄
  {
    this.expired = true;
  }
  
  update()
  {
    if(this.holder === undefined)
    {
      logger.error(`Failed to self Update UI guild_id:${this.guild_id}, embeds: ${JSON.stringify(this.embed)}, err: ${'this UI has undefined UI Holder!!!'}`);
      return;
    }

    this.holder.updateUI();
  }
  
  sendDelayedUI(ui, do_resend)
  {
    if(this.holder === undefined)
    {
      logger.error(`Failed to self force update delayed UI guild_id:${this.guild_id}, embeds: ${JSON.stringify(this.embed)}, err: ${'this UI has undefined UI Holder!!!'}`);
      return;
    }

    this.holder.sendDelayedUI(ui, do_resend);
  }

  goToBack()
  {
    if(this.holder === undefined)
    {
      logger.error(`Failed to self goToBack UI guild_id:${this.guild_id}, embeds: ${JSON.stringify(this.embed)}, err: ${'this UI has undefined UI Holder!!!'}`);
      return;  
    }
    
    this.holder.goToBack();
  }

  sendMessageReply(message)
  {
    if(this.holder === undefined)
    {
      logger.error(`Failed to self reply message of base message guild_id:${this.guild_id}, embeds: ${JSON.stringify(this.embed)}, err: ${'this UI has undefined UI Holder!!!'}`);
      return;
    }
    
    return this.holder.sendMessageReply(message);
  }
  
  freeHolder()
  {
    this.holder?.free();
  }

  //selectmenu 에서 value 값에 해당하는 선택지를 default 활성화해줌
  selectDefaultOptionByValue(select_menu, value)
  {
    const options = select_menu.options;
    for(const option of options)
    {
      let option_data = option.data;
      if(option_data.value === value)
      {
        option_data['default'] = true;
      }
      else
      {
        option_data['default'] = false;
      }
    }
  }
  
  //embed url 전부 제거
  resetEmbedURL()
  {
    if(this.embed?.thumbnail != undefined)
    {
      this.embed.thumbnail.url = '';
    }

    if(this.embed?.image != undefined)
    {
      this.embed.image.url = '';
    }

    if(this.embed?.footer != undefined)
    {
      this.embed.footer.icon_url = '';
    }
  }

  getMessageCreatedTime()
  {
    return this.holder?.getMessageCreatedTime();
  }

  isUnsupportedInteraction(interaction)
  {
    return !interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isModalSubmit();
  }
}
  
//QuizBotControlComponentUI, 컨트롤 컴포넌트가 함께 있는 UI
class QuizBotControlComponentUI extends QuizbotUI 
{
  constructor()
  {
    super();
  
    this.control_btn_component = cloneDeep(control_btn_component);
    this.page_jump_component = cloneDeep(page_select_row);
    this.components = [select_btn_component, select_btn_component2, this.control_btn_component ]; //이게 기본 component임

    this.cur_contents = undefined;
    this.cur_page = 0;
    this.total_page = 0;
    this.count_per_page = 10; //페이지별 표시할 컨텐츠 수
    this.main_description = undefined; //displayContent에 같이 표시할 메인 description

    this.initializePageHandler();
  }

  initializePageHandler()
  {
    this.page_move_handler = 
    {
      'request_modal_page_jump': this.requestPageJumpModal.bind(this),
      'modal_page_jump': this.submitPageJumpModal.bind(this),
      'modal_complex_page_jump': this.submitPageJumpModal.bind(this),
      'prev': this.goToPreviousPage.bind(this),
      'next': this.goToNextPage.bind(this),
    };
  }

  isPageMoveEvent(interaction)
  {
    return this.page_move_handler[interaction.customId] !== undefined;
  }

  handlePageMoveEvent(interaction)
  {
    /** false => 페이지 이동 관련 아님, undefined => 페이지 이동 관련이긴하나 페이지가 바뀌진 않음, true => 페이지가 바뀜 */

    const handler = this.page_move_handler[interaction.customId];
    return handler(interaction);
  }

  requestPageJumpModal(interaction)
  {
    interaction.explicit_replied = true;
    interaction.showModal(modal_page_jump); //페이지 점프 입력 모달 전달
    return undefined;
  }

  submitPageJumpModal(interaction)
  {
    const input_page_value = interaction.fields.getTextInputValue('txt_input_page_jump');
  
    if(input_page_value === undefined || input_page_value === '')
    {
      return undefined;
    }

    const selected_page_num = parseInt(input_page_value.trim());
    if(isNaN(selected_page_num)) //입력 값 잘못된거 처리
    {
      interaction.explicit_replied = true;
      interaction.reply({content: `\`\`\`🔸 ${input_page_value} 값은 잘못됐습니다.\`\`\``, ephemeral: true});
      return undefined;
    }

    if(selected_page_num <= 0 || selected_page_num > this.total_page) //이상한 범위면 return
    {
      interaction.explicit_replied = true;
      interaction.reply({content: `\`\`\`🔸 ${input_page_value} 페이지는 없네요...\`\`\``, ephemeral: true});
      return undefined; 
    }

    if(this.cur_page === selected_page_num) //현재와 동일한 페이지라면
    {
      return undefined; //페이지 바뀐게 없다면 return;
    }
      
    this.pageMove(selected_page_num - 1);
    interaction.explicit_replied = true;
    interaction.deferUpdate();

    return this;
  }

  goToPreviousPage(interaction)
  {
    if(this.cur_page <= 0) //이미 맨 앞 페이지
    {
      return undefined;
    }

    this.pageMove(this.cur_page - 1);
    return this;
  }

  goToNextPage(interaction)
  {
    if(this.cur_page + 1 >= this.total_page) //다음 페이지가 없음
    {
      return undefined;
    }

    this.pageMove(this.cur_page + 1);
    return this;
  }

  pageMove(page_num)
  {
    this.cur_page = page_num;
    this.displayContents(this.cur_page);
  }
  
  /** Deprecated //이제 select menu 에서 페이지 선택하는 형식이 아닌 modal에서 페이지 입력하는 형식이라 필요 없다.
  setPageSelectMenuMax(max_page)
  {
    //selectmenu component의 options는 readonly 라서 다시 만들어야함
  
    // if(max_page <= 1) //23.11.30 아 그냥 뺴지마, 신경쓸게 많음;
    // {
    //   // this.components = [select_btn_component, this.control_btn_component]; //페이지가 1개면 페이지 이동 menu 뺌
    //   const index_to_remove = this.components.indexOf(this.page_jump_component);
    //   if(index_to_remove !== -1)
    //   {
    //     this.components.splice(index_to_remove, 1); 
    //   }
    //   return;
    // }
  
    // this.components = [select_btn_component, this.control_btn_component, this.page_jump_component ]; //기본 component로 다시 지정
    // this.components.splice(2, 0, this.page_jump_component); //페이지 선택 메뉴 필요하면 삽입
  
    if(max_page <= 0) 
    {
      return;
    }
  
    const new_select_menu = cloneDeep(page_select_menu);
  
    for(let i = 0; i < max_page && i < 25; ++i) //최대 25까지밖에 안됨
    {
      const page_option = { label: `${i+1}페이지`, description: ` `, value: `page_${i}` };
      new_select_menu.addOptions(page_option);
    }
  
    this.page_jump_component.components[0] = new_select_menu;
    // this.components[2] = this.page_jump_component;
  }
  */
  
  displayContents(page_num=this.cur_page)
  {
    if(this.cur_contents === undefined) 
    {
      return;
    }
  
    const contents = this.cur_contents;
    const total_page = parseInt(contents.length / this.count_per_page) + (contents.length % this.count_per_page !== 0 ? 1 : 0);
  
    if(this.total_page === 0 || this.total_page !== total_page) //total page 변경 사항 있을 시
    {
      this.total_page = total_page; //나중에 쓸거라 저장
    }
  
    this.cur_page = page_num;

    let page_contents = [];
    const from = this.count_per_page * page_num;
    const to = Math.min((this.count_per_page * (page_num + 1)), contents.length);
  
    for(let i = from; i < to; i++)
    {
      const content = this.cur_contents[i];
      if(content === undefined) 
      {
        continue;
      }
      
      page_contents.push(content);
    }
  
    let contents_message = this.main_description ?? "";
    for(let i = 0; i < page_contents.length; ++i)
    {
      const cur_content = page_contents[i];
      const num_icon = text_contents.icon["ICON_NUM_"+(i+1)];
      contents_message += `${num_icon})  ${cur_content.icon ?? ''} ${cur_content.name}\n\n`;
    }
  
    this.embed.description = contents_message + " \n";
  
    let current_page_text = total_page === 0 ? 0 : page_num + 1;
    let page_message = `${text_contents.icon.ICON_PAGE} ${current_page_text} / ${total_page} ${text_contents.icon.PAGE_TEXT}`;

    this.embed.footer = { 
      text: page_message,
    };
  }

  convertToSelectedIndex(target)
  {
    const selected_index = parseInt(target);
    if(isNaN(selected_index) || selected_index < 0 || selected_index > 10) //1~10번 사이 눌렀을 경우만
    {
      return undefined; 
    }

    return selected_index;
  }

  isSelectedIndexEvent(interaction)
  {
    return this.convertToSelectedIndex(interaction.customId) !== undefined;
  }

  handleSelectedIndexEvent(interaction) //더미용
  {
    logger.warn(`Called Dummy handleSelectedIndexEvent. from ${interaction.customId} / ${interaction.guild.id}`);
  }
}

module.exports = { QuizbotUI, QuizBotControlComponentUI };