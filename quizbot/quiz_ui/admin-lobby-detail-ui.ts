'use strict';

//#region 필요한 외부 모듈
const { MessageFlags } = require('discord.js');
//#endregion

//#region 로컬 modules
const ipc_manager = require('../managers/ipc_manager');
const { CLIENT_SIGNAL } = require('../managers/multiplayer_signal.js');
const ban_manager = require('../managers/ban_manager');
const logger = require('../../utility/logger.js')('QuizUI');

const {
  only_back_comp,
  admin_lobby_delete_request_comp,
  admin_lobby_delete_confirm_comp,
} = require("./components");

const {
  QuizbotUI,
} = require("./common-ui");
//#endregion

/** 관리자 전용: 멀티플레이 로비 상세/강제삭제/영구밴 UI (AdminLobbyListUI에서 진입) */
class AdminLobbyDetailUI extends QuizbotUI
{
  constructor(lobby_info: any, admin_user: any)
  {
    super();

    this.lobby_info = lobby_info;
    this.admin_user = admin_user;

    this.initializeEmbed();
    this.initializeComponents();
  }

  initializeEmbed()
  {
    const lobby_info = this.lobby_info;

    this.embed = {
      color: lobby_info.is_ingame ? 0x2C2F33 : 0x8B0000,
      title: `🎮 ${lobby_info.session_name ?? '(제목 없음)'}`,
      description: `상태: ${lobby_info.is_ingame ? '게임 진행 중' : '대기 중'}\n`
        + `호스트 길드: ${lobby_info.host_name} (${lobby_info.session_id})\n`
        + `참가 길드 수: ${lobby_info.participant_count}\n`
        + `평균 MMR: ${lobby_info.mmr_avg}`
        + (lobby_info.is_ingame ? `\n\n🔸 게임이 진행 중인 로비는 강제 삭제할 수 없습니다.` : ''),
    };
  }

  initializeComponents()
  {
    this.components = this.lobby_info.is_ingame
      ? [ only_back_comp ]
      : [ admin_lobby_delete_request_comp, only_back_comp ];
  }

  onInteractionCreate(interaction: any)
  {
    if(interaction.isButton() && interaction.customId === 'admin_lobby_delete_request')
    {
      return this.requestDelete(interaction);
    }

    if(interaction.isButton() && interaction.customId === 'admin_lobby_delete_confirmed')
    {
      return this.confirmDelete(interaction, false);
    }

    if(interaction.isButton() && interaction.customId === 'admin_lobby_delete_confirmed_and_ban')
    {
      return this.confirmDelete(interaction, true);
    }

    if(interaction.isButton() && interaction.customId === 'admin_lobby_delete_cancel')
    {
      return this.cancelDelete(interaction);
    }
  }

  requestDelete(interaction: any) //바로 삭제하지 않고 확인 절차부터 거침(AdminBanListUI와 동일 패턴, 오클릭 방지)
  {
    if(this.lobby_info.is_ingame) //목록 로드 후 그 사이 게임이 시작됐을 수 있음(방어적 재확인)
    {
      interaction.explicit_replied = true;
      interaction.reply({ content: `\`\`\`🎮 게임이 진행 중인 로비는 강제 삭제할 수 없습니다.\`\`\``, flags: MessageFlags.Ephemeral });
      return;
    }

    interaction.explicit_replied = true;
    interaction.reply({
      content: `\`\`\`🎮 정말 [ ${this.lobby_info.session_name} ] 로비를 강제 삭제하시겠습니까?\`\`\``,
      components: admin_lobby_delete_confirm_comp,
      flags: MessageFlags.Ephemeral,
    });
  }

  async confirmDelete(interaction: any, with_ban: boolean)
  {
    const actor = `${interaction.user.tag}(${interaction.user.id})`;

    const result = await ipc_manager.sendMultiplayerSignal(
      {
        signal_type: CLIENT_SIGNAL.ADMIN_FORCE_DELETE_LOBBY,
        session_id: this.lobby_info.session_id,
        guild_id: interaction.user.id,
        actor: actor,
      }
    );

    if(result?.state !== true)
    {
      interaction.explicit_replied = true;
      interaction.reply({ content: `\`\`\`🎮 삭제 실패: ${result?.reason ?? '알 수 없는 오류'}\`\`\``, flags: MessageFlags.Ephemeral });
      return;
    }

    if(with_ban)
    {
      ban_manager.banId(this.lobby_info.session_id, `${actor} via admin_lobby_delete_confirmed_and_ban(session_id:${this.lobby_info.session_id})`);
    }

    logger.info(`Force deleted multiplayer lobby... session_id: ${this.lobby_info.session_id}, title: ${result.session_name}, banned: ${with_ban}, by: ${actor}`);

    interaction.explicit_replied = true;
    interaction.reply({ content: `\`\`\`🎮 로비를 삭제${with_ban ? '하고 방장 길드를 영구밴' : ''}했습니다.\`\`\``, flags: MessageFlags.Ephemeral });

    this.goToBack(); //목록 화면(AdminLobbyListUI)이 onAwaked()에서 목록 재조회
  }

  cancelDelete(interaction: any)
  {
    interaction.explicit_replied = true;
    interaction.reply({ content: `\`\`\`🎮 삭제를 취소했습니다.\`\`\``, flags: MessageFlags.Ephemeral });
  }
}

module.exports = { AdminLobbyDetailUI };
