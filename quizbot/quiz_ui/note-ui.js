'use strict';

//#region 필요한 외부 모듈
const fs = require('fs');
//#endregion

//#region 로컬 modules
const { SYSTEM_CONFIG, } = require('../../config/system_setting.js');

const {
  only_back_comp,
} = require("./components.js");

const { 
  QuizbotUI,
} = require("./common-ui.js");

//#endregion

/** 일반 텍스트 표시 UI */
class NoteUI extends QuizbotUI
{
  constructor(note_info)
  {
    super();

    this.note_info = note_info;

    this.initializeEmbed();
  }

  initializeEmbed() 
  {
    const description = fs.readFileSync(this.note_info['note_path'], {encoding: 'utf8', flag:'r'});

    this.embed = {
      color: 0xFED049,
      title: `${this.note_info['name']}`,
      description: description,
      footer: { //내 이름 표시
        text: `제육보끔#1916`,
        icon_url: `https://user-images.githubusercontent.com/28488288/208116143-24828069-91e7-4a67-ac69-3bf50a8e1a02.png`,
      },
      timestamp: new Date(this.note_info['mtime']).toISOString(),
    };

    this.components = [only_back_comp]; //여기서는 component를 바꿔서 해주자
  }
}

module.exports = { NoteUI };