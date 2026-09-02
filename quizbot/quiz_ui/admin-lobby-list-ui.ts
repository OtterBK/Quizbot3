'use strict';

//#region 필요한 외부 모듈
const { ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
//#endregion

//#region 로컬 modules
const ipc_manager = require('../managers/ipc_manager');
const { CLIENT_SIGNAL } = require('../managers/multiplayer_signal.js');
const {
  only_back_comp,
} = require("./components");

const {
  QuizbotUI,
} = require("./common-ui");

const { AdminLobbyDetailUI } = require("./admin-lobby-detail-ui");
//#endregion

const LOBBY_LIST_SELECT_CUSTOM_ID = 'admin_lobby_list_select';

//Discord StringSelectMenu는 옵션을 최대 25개까지만 지원함(AdminBanListUI/AdminNoticeListUI와 동일 제약)
const MAX_SELECT_OPTIONS = 25;

/** 관리자 전용: 멀티플레이 로비 목록 조회 UI (AdminPanelUI에서 진입) */
class AdminLobbyListUI extends QuizbotUI
{
  constructor(admin_user: any)
  {
    super();

    this.admin_user = admin_user;
    this.lobby_list = [];

    this.initializeEmbed();
    this.initializeComponents();
    this.loadList();
  }

  initializeEmbed()
  {
    this.embed = {
      color: 0x2C2F33,
      title: `🎮 멀티플레이 로비 관리`,
      description: `불러오는 중...`,
    };
  }

  initializeComponents()
  {
    this.components = [ only_back_comp ];
  }

  loadList()
  {
    ipc_manager.sendMultiplayerSignal(
      {
        signal_type: CLIENT_SIGNAL.REQUEST_LOBBY_LIST,
        guild_id: this.admin_user.id,
      }
    ).then((lobby_list: any[]) =>
    {
      this.lobby_list = lobby_list ?? [];
      this.refreshList();
    });
  }

  onAwaked() //상세 화면에서 뒤로가기(삭제/삭제+밴 후 포함)로 돌아왔을 때 목록 재조회
  {
    this.loadList();
  }

  refreshList()
  {
    const count_notice = this.lobby_list.length > MAX_SELECT_OPTIONS
      ? `현재 ${this.lobby_list.length}개의 로비가 있습니다. (목록에는 최대 ${MAX_SELECT_OPTIONS}개까지만 표시됩니다)`
      : `현재 ${this.lobby_list.length}개의 로비가 있습니다.`;

    this.embed.description = this.lobby_list.length === 0
      ? `현재 활성화된 멀티플레이 로비가 없습니다.`
      : `${count_notice}\n관리할 로비를 선택하세요. (삭제/영구밴은 대기 중인 로비에서만 가능합니다)`;

    const lobby_list_select_menu = new StringSelectMenuBuilder()
      .setCustomId(LOBBY_LIST_SELECT_CUSTOM_ID)
      .setPlaceholder('관리할 로비 선택하기');

    if(this.lobby_list.length === 0)
    {
      lobby_list_select_menu.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('활성화된 로비가 없습니다.')
          .setValue('admin_lobby_list_empty'),
      );
      lobby_list_select_menu.setDisabled(true);
    }
    else
    {
      for(const lobby_info of this.lobby_list.slice(0, MAX_SELECT_OPTIONS))
      {
        lobby_list_select_menu.addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel(String(lobby_info.session_name ?? '(제목 없음)').slice(0, 100))
            .setDescription(`${lobby_info.is_ingame ? '게임 중' : '대기 중'} · 참가 ${lobby_info.participant_count} · 호스트: ${lobby_info.host_name}`.slice(0, 100))
            .setValue(String(lobby_info.session_id)),
        );
      }
    }

    const lobby_list_select_row = new ActionRowBuilder()
      .addComponents(lobby_list_select_menu);

    this.components = [ lobby_list_select_row, only_back_comp ];
    this.update();
  }

  onInteractionCreate(interaction: any)
  {
    if(interaction.isStringSelectMenu() && interaction.customId === LOBBY_LIST_SELECT_CUSTOM_ID)
    {
      return this.handleSelectLobby(interaction);
    }
  }

  handleSelectLobby(interaction: any)
  {
    const selected_session_id = interaction.values[0];
    if(selected_session_id === 'admin_lobby_list_empty')
    {
      return undefined;
    }

    const lobby_info = this.lobby_list.find((l: any) => String(l.session_id) === selected_session_id);
    if(lobby_info === undefined) //선택 사이에 다른 곳에서 삭제됐을 수 있음(드문 경합)
    {
      return undefined;
    }

    return new AdminLobbyDetailUI(lobby_info, this.admin_user);
  }
}

module.exports = { AdminLobbyListUI };
