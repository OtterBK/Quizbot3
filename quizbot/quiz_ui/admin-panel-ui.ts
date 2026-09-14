'use strict';

//#region 필요한 외부 모듈
const { MessageFlags } = require('discord.js');
const cloneDeep = require('lodash/cloneDeep.js');
//#endregion

//#region 로컬 modules
const { SYSTEM_CONFIG } = require('../../config/system_setting.js');
const {
  admin_panel_comp,
  admin_panel_row2_comp,
  modal_current_notice_edit,
} = require("./components");

const {
  QuizbotUI,
} = require("./common-ui");

const report_manual_processing = require('../managers/report/report_manual_processing');
const notice_manager = require('../managers/notice_manager');
const { UserQuizListUI } = require("./user-quiz-list-ui");
const { AdminBanListUI } = require("./admin-ban-list-ui");
const { AdminNoticeListUI } = require("./admin-notice-list-ui");
const { AdminMaintenanceUI } = require("./admin-maintenance-ui");
const { AdminSeasonUI } = require("./admin-season-ui");
const { AdminLobbyListUI } = require("./admin-lobby-list-ui");

//#endregion

/** 관리자 전용 메인 패널 (진입은 bot.js의 quiz_manager_panel_handler에서 어드민 여부를 확인한 뒤에만 됨) */
class AdminPanelUI extends QuizbotUI
{
  constructor()
  {
    super();

    this.initializeEmbed();
    this.initializeComponents();
  }

  initializeEmbed()
  {
    this.embed = {
      color: 0x2C2F33,
      title: `🛠 관리자 패널`,
      description: `원하는 작업을 선택하세요.`,
    };
  }

  initializeComponents()
  {
    this.components = [ admin_panel_comp, admin_panel_row2_comp ];
  }

  onInteractionCreate(interaction: any)
  {
    if(interaction.isButton() && interaction.customId === 'admin_panel_ban_list')
    {
      return new AdminBanListUI();
    }

    if(interaction.isButton() && interaction.customId === 'admin_panel_report')
    {
      report_manual_processing.sendReportLog(interaction); //자체적으로 응답까지 처리함
      return;
    }

    if(interaction.isButton() && interaction.customId === 'admin_panel_quiz_manage')
    {
      return new UserQuizListUI(interaction.user, true); //전체 유저 퀴즈 조회 모드
    }

    if(interaction.isButton() && interaction.customId === 'admin_panel_notice_manage')
    {
      return new AdminNoticeListUI();
    }

    if(interaction.isButton() && interaction.customId === 'admin_panel_maintenance')
    {
      return new AdminMaintenanceUI();
    }

    if(interaction.isButton() && interaction.customId === 'admin_panel_current_notice_edit')
    {
      return this.requestCurrentNoticeEdit(interaction);
    }

    if(interaction.isModalSubmit() && interaction.customId === 'modal_current_notice_edit')
    {
      return this.handleCurrentNoticeEdit(interaction);
    }

    if(interaction.isButton() && interaction.customId === 'admin_panel_season_manage')
    {
      return new AdminSeasonUI();
    }

    if(interaction.isButton() && interaction.customId === 'admin_panel_lobby_manage')
    {
      return new AdminLobbyListUI(interaction.user);
    }
  }

  //실시간 공지(resources/current_notice.txt, /퀴즈 최초 진입 화면 전용 - notices/ 게시판과는 별개
  //파일)는 목록/상세 화면 없이 관리자 패널에서 바로 모달로 편집(2026-08-15 신설)
  requestCurrentNoticeEdit(interaction: any)
  {
    const current_content = notice_manager.readCurrentNotice(SYSTEM_CONFIG.CURRENT_NOTICE_PATH);

    const modal_current = cloneDeep(modal_current_notice_edit);
    modal_current.components[0].components[0].setValue(current_content);

    interaction.explicit_replied = true;
    interaction.showModal(modal_current);
  }

  handleCurrentNoticeEdit(interaction: any)
  {
    const content = interaction.fields.getTextInputValue('txt_input_current_notice');

    notice_manager.writeCurrentNotice(SYSTEM_CONFIG.CURRENT_NOTICE_PATH, content, `${interaction.user.tag}(${interaction.user.id})`);

    interaction.explicit_replied = true;
    interaction.reply({ content: `\`\`\`📢 실시간 공지를 저장했습니다.\`\`\``, flags: MessageFlags.Ephemeral });
  }
}

module.exports = { AdminPanelUI };
