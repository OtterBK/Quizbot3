'use strict';

//#region 필요한 외부 모듈
const fs = require('fs');
//#endregion

//#region 로컬 modules
const { SYSTEM_CONFIG, } = require('../../config/system_setting.js');
const text_contents = require('../../config/text_contents.json')[SYSTEM_CONFIG.language]; 
const {

} = require("./components.js");

const { 
  QuizBotControlComponentUI
} = require("./common-ui.js");

const { NoteUI } = require("./note-ui.js");

//#endregion

/** 공지/패치노트 UI */
class NotesSelectUI extends QuizBotControlComponentUI  
{

  constructor()
  {
    super();

    this.initializeEmbed();
    this.initializeContents();
    this.initializeNoteSelectUIEventHandler();
  }

  initializeEmbed() 
  {
    

    this.embed = {
      color: 0x87CEEB,
      title: text_contents.notes_select_ui.title,
      description: text_contents.notes_select_ui.description,
    };

    this.cur_contents = undefined; //현재 표시할 컨텐츠
    this.notice_contents = undefined; //공지용
    this.patch_note_contents = undefined; //패치노트용
  }

  initializeContents()
  {
    this.main_description = text_contents.notes_select_ui.description;

    this.loadNoteContents(SYSTEM_CONFIG.notices_path)
      .then(content_list =>
      {
        this.notice_contents = content_list;
        this.cur_contents = this.notice_contents;
        this.displayContents(0);
        this.update();
      });
  }

  initializeNoteSelectUIEventHandler()
  {
    this.note_select_ui_handler = 
    {
      'notice': this.handleNoticeSelect.bind(this),
      'patch_note': this.handlePatchNoteSelect.bind(this),
    };
  }

  async loadNoteContents(notes_folder_path) 
  {
    // //파일 생성일로 정렬
    // const content_list_sorted_by_mtime = fs.readdirSync(notes_folder_path)
    //     .map(function(v) { 
    //         return { name:v.replace('.txt', ""),
    //                 mtime:fs.statSync(`${notes_folder_path}/${v}`).mtime,
    //                 note_path: `${notes_folder_path}/${v}`
    //               }; 
    //     })
    //     .sort(function(a, b) { return b.mtime - a.mtime; });
  
    //파일명으로 정렬
    const content_list_sorted_by_name = fs.readdirSync(notes_folder_path)
      .sort((a, b) => 
      {
        return b.localeCompare(a, 'ko');
      })
      .map(function(v) 
      { 
        return { name:v.replace('.txt', ""),
          mtime:fs.statSync(`${notes_folder_path}/${v}`).mtime,
          note_path: `${notes_folder_path}/${v}`
        }; 
      });

    return content_list_sorted_by_name;
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

    if(this.isNoteSelectUIEvent(interaction))
    {
      return this.handleNoteSelectUIEvent(interaction);
    }

    if(this.isSelectedIndexEvent(interaction))
    {
      return this.handleSelectedIndexEvent(interaction);
    }
    
  }

  isNoteSelectUIEvent(interaction)
  {
    this.note_select_ui_handler[interaction.customId] !== undefined;
  }

  handleNoteSelectUIEvent(interaction)
  {
    const handler = this.note_select_ui_handler[interaction.customId];
    return handler(interaction);
  }

  handleNoticeSelect(interaction)
  {
    this.cur_contents = this.notice_contents;
    this.pageMove(0);
    return this;
  }

  handlePatchNoteSelect(interaction)
  {
    this.cur_contents = this.patch_note_contents;
    this.pageMove(0);
    return this;
  }

  handleSelectedIndexEvent(interaction)
  {
    const selected_index = this.convertToSelectedIndex(interaction.customId);

    const note_index = (this.count_per_page * this.cur_page) + selected_index - 1; //실제로 1번을 선택했으면 0번 인덱스를 뜻함
    if(note_index >= this.cur_contents.length) //범위 넘어선걸 골랐다면
    {
      return;
    }

    const note_info = this.cur_contents[note_index];
    if(note_info['note_path'] !== undefined) //Note를 클릭했을 경우
    {
      return new NoteUI(note_info);
    }
  }
}

module.exports = { NotesSelectUI };