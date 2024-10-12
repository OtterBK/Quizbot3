const cloneDeep = require("lodash/cloneDeep.js");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder} = require('discord.js');

const PRIVATE_CONFIG = require('../../config/private_config.json');
const logger = require('../../utility/logger.js')('ReportManager');
const db_manager = require('./db_manager.js');
const {
  modal_chat_report,
} = require("../quiz_ui/components.js");

let bot_client = undefined;
const initialize = (client) => 
{
  bot_client = client;
};

let chat_content_cache_cleanup_timer = undefined;
const chat_content_cache = {}; //chat_id, chat_content

const startChatCacheCleanUp = () =>
{
  chat_content_cache_cleanup_timer = setInterval(() => 
  {  
    const aging_criteria = Date.now() - 300000; //5분
    const aging_target = [];

    const keys = Object.keys(chat_content_cache);

    for(const chat_id of keys)
    {
      const cache_info = chat_content_cache[chat_id];
      if(cache_info.cached_time < aging_criteria)
      {
        aging_target.push(chat_id);
      }
    }

    if(aging_target.length === 0)
    {
      return;
    }

    logger.info(`Aging Chat Content Cache size: ${aging_target.length}/${keys.length}`);

    for(const chat_id of aging_target)    
    {
      delete chat_content_cache[chat_id];
    }

  }, 60000); //1분마다
};

const insertChatCache = (chat_id, content) =>
{
  if(chat_id === undefined)
  {
    return;
  }

  if(chat_content_cache_cleanup_timer === undefined)
  {
    startChatCacheCleanUp();
  }

  const prev_cache = getChatCacheContent(chat_id);
  if(prev_cache !== undefined)
  {
    prev_cache.cached_time = Date.now();
    return;
  }

  chat_content_cache[chat_id] = {
    content: content,
    cached_time: Date.now(),
  };
};

const getChatCacheContent = (chat_id) =>
{
  if(chat_id === undefined)
  {
    return undefined;
  }

  const cache_content = chat_content_cache[chat_id];
  if(cache_content === undefined)
  {
    return undefined;
  }

  return cache_content.content;
};

const isReportChatButton = (interaction) =>
{
  if(interaction.isButton() && interaction.customId.startsWith('chat_report_'))
  {
    return true;
  }

  return false;
};

const isReportChatModal = (interaction) =>
{
  if(interaction.isModalSubmit() && interaction.customId.startsWith('modal_chat_report_'))
  {
    return true;
  }

  return false;
};

const isReportManageCommand = (interaction) =>
{
  if(interaction.isCommand() && interaction.commandName === '신고처리')
  {
    return true;
  }

  return false;
};

const isReportProcessButton = (interaction) =>
{
  if(interaction.isButton() && interaction.customId.startsWith('process_report_'))
  {
    return true;
  }
  
  return false;
};
  

const getChatId = (custom_id) =>
{
  let chat_id = custom_id.replace('modal_chat_report_', '');
  if(chat_id === custom_id)
  {
    chat_id = custom_id.replace('chat_report_', '');
  }

  if(chat_id === custom_id) //안바뀌었으면 없는거임
  {
    return undefined;
  }

  return chat_id;
};

const extractChatInfo = (chat_id) =>
{
  const info = chat_id.split('-');
  if(info.length != 2)
  {
    return undefined;
  }

  return {
    user_id: info[0],
    timestamp: info[1],
  };
};

const requestReportChatModal = (interaction) =>
{
  interaction.explicit_replied = true;

  const chat_id = getChatId(interaction.customId);
  if(chat_id === undefined)
  {
    return;
  }

  insertChatCache(chat_id, interaction.message.content);

  const report_chat_modal = cloneDeep(modal_chat_report);
  report_chat_modal.setCustomId(`modal_chat_report_${chat_id}`); //chat_id가 아닌 customId 그대로

  interaction.showModal(report_chat_modal);
};

const CHAT_INFO_COLUMN = 
[
  "chat_id",
  "content",
  "sender_id",
  "result",
];

const REPORT_INFO_COLUMN =
[
  "target_id",
  "reporter_id",
  "report_detail",
  "report_type",
];

let chat_info_key_fields = '';
CHAT_INFO_COLUMN.forEach((field) =>
{
  if(chat_info_key_fields != '')
  {
    chat_info_key_fields += ', ';
  }
  chat_info_key_fields += `${field}`;
});

let report_info_key_fields = '';
REPORT_INFO_COLUMN.forEach((field) =>
{
  if(report_info_key_fields != '')
  {
    report_info_key_fields += ', ';
  }
  report_info_key_fields += `${field}`;
});

const REPORT_PROCESSED_RESULT_TYPE = 
{
  IN_PROGRESS: 0,
  BANNED: 1,
  DENY: 2,
};

const submitReportChatModal = (interaction) =>
{
  interaction.explicit_replied = true;
    
  const chat_id = getChatId(interaction.customId);
  const content = getChatCacheContent(chat_id);
  const chat_info = extractChatInfo(chat_id);
  if(chat_info === undefined || content === undefined)
  {
    interaction.reply({content: `\`\`\`🔸 신고에 실패했습니다. (No Cache Content)\n다시 시도해보세요.\`\`\``});
    return;
  }

  const sender_id = chat_info.user_id;
  const reporter_id = interaction.user.id;
  const report_detail = interaction.fields.getTextInputValue('txt_input_report_detail');
  const result = 0;
  const report_type = REPORT_PROCESSED_RESULT_TYPE.IN_PROGRESS;

  // const chat_report_info = {
  //     chat_id: chat_id,
  //     content: content,
  //     sender_id: chat_info.user_id,
  //     reporter_id: interaction.user.id,
  //     report_detail: report_detail,
  // }

  interaction.reply({content: `\`\`\`🔸 신고가 접수되었습니다. 감사합니다.\`\`\``});

  db_manager.insertChatInfo(chat_info_key_fields, [chat_id, content, sender_id, result]);
  db_manager.insertReportInfo(report_info_key_fields, [chat_id, reporter_id, report_detail, report_type]);
};

const sendReportLog = async (interaction) =>
{
  const user = interaction.user;

  if(isAdmin(user.id) === false) //어드민 아니면 일부러 응답 안줌
  {
    return;
  }

  if(interaction.guild)
  {
    interaction.reply({content: `\`\`\`개인 메시지 채널에서만 사용 가능합니다.\`\`\``, ephemeral: true});
    return;
  }

  let reported_chat_info_list = undefined;
  try
  {
    reported_chat_info_list = await db_manager.selectReportChatInfo(10); //10개씩 조회하자
  }
  catch(err)
  {
    const err_message = `select reported chat info list error. err: ${err.stack}`;

    logger.error(err_message);
    user.send({content: `\`\`\`${err_message}\`\`\``, ephemeral: true});

    return;
  }

  if(reported_chat_info_list === undefined)
  {
    const err_message = `reported_chat_info_list is undefined error`;

    logger.error(err_message);
    user.send({content: `\`\`\`${err_message}\`\`\``, ephemeral: true});

    return;
  }

  if(reported_chat_info_list.rowCount === 0)
  {
    interaction.reply({content: `\`\`\`처리할 신고 사항이 없습니다.\`\`\``});
    return;
  }

  for(const reported_chat_info of reported_chat_info_list.rows)
  {
    await sendReportProcessingUI(user, reported_chat_info);
  }

  interaction.reply({content: `\`\`\`${reported_chat_info_list.rowCount}개의 신고 항목 조회함\`\`\``, ephemeral: true});
};

const sendReportProcessingUI = async (user, reported_chat_info) =>
{
  const target_id = reported_chat_info.chat_id;
  const sender_id = reported_chat_info.sender_id;

  let target_report_log_list = undefined;

  try
  {
    target_report_log_list = await db_manager.selectReportLog(target_id);
  }
  catch(err)
  {
    const err_message = `select reported chat log error. err: ${err.stack}`;

    logger.error(err_message);
    user.send({content: `\`\`\`${err_message}\`\`\``, ephemeral: true});

    return;
  }

  if(target_report_log_list === undefined || target_report_log_list.rowCount === 0)
  {
    const err_message = `target_report_log_list is undefined or rowCount 0 error`;

    logger.error(err_message);
    user.send({content: `\`\`\`${err_message}\`\`\``, ephemeral: true});

    return;
  }

  const embed = {
    color: 0x8B0000,
    title: `${target_id}`,
    description: `${reported_chat_info.content}`,
    footer: {
      text: `${sender_id}`,
    },
  };

  const extracted_chat_info = extractChatInfo(target_id);
  if(extracted_chat_info !== undefined)
  {
    const iso_timestamp = new Date(parseInt(extracted_chat_info.timestamp)).toISOString();
    embed.timestamp = iso_timestamp;
  }

  const reported_log_detail_menu = new StringSelectMenuBuilder().
    setCustomId('reported_log_detail_menu').
    setPlaceholder('신고 내역');

  let temp_count = 0;
  for(const target_report_log of target_report_log_list.rows)
  {
    if(++temp_count > 25)
    {
      break;
    }

    reported_log_detail_menu.addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(`${target_report_log.reporter_id}`)
        .setDescription(`${target_report_log.report_detail}`)
        .setValue(`report_log_temp_${temp_count}`),
    );
  }

  const reported_log_detail_row = new ActionRowBuilder()
    .addComponents(reported_log_detail_menu);

  const process_report_comp = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`process_report_ban_${target_id}`)
        .setLabel('처벌')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`process_report_deny_${target_id}`)
        .setLabel('반려')
        .setStyle(ButtonStyle.Secondary),
    );
  
  //이제 보내기만하면됨
  user.send({embeds: [embed], components: [reported_log_detail_row, process_report_comp]});

};

const processReportLog = async (interaction) =>
{
  let chat_id = interaction.customId;
  let process_type = REPORT_PROCESSED_RESULT_TYPE.IN_PROGRESS;

  if(chat_id.includes('process_report_ban_'))
  {
    process_type = REPORT_PROCESSED_RESULT_TYPE.BANNED;
    chat_id = chat_id.replace('process_report_ban_', '');
  }
  else if(chat_id.includes('process_report_deny_'))
  {
    process_type = REPORT_PROCESSED_RESULT_TYPE.DENY;
    chat_id = chat_id.replace('process_report_deny_', '');
  }

  if(process_type === REPORT_PROCESSED_RESULT_TYPE.IN_PROGRESS)
  {
    const err_message = `cannot extract chat_id from ${interaction.customId}`;
    logger.error(err_message);
    
    interaction.reply({content: `\`\`\`${err_message}\`\`\``, ephemeral: true});
    return;
  }

  const chat_info = extractChatInfo(chat_id);
  if(chat_info === undefined)
  {
    const err_message = `cannot extract chat_info from ${chat_id}`;
    logger.error(err_message);
    
    interaction.reply({content: `\`\`\`${err_message}\`\`\``, ephemeral: true});
    return;
  }

  let result_message = ``;

  const user_id = chat_info.user_id;
  if(process_type === REPORT_PROCESSED_RESULT_TYPE.BANNED)
  {
    const ban_history_result = await db_manager.selectBanHistory(user_id);
    
    let ban_history = undefined;
    if(ban_history_result.rowCount === 0)
    {
      ban_history = {
        user_id: user_id,
        ban_count: 0,
        ban_expiration_timestamp: 0,
      };
    }
    else
    {
      ban_history = ban_history_result.rows[0];
    }

    ban_history.ban_count += 1;

    const ban_count = ban_history.ban_count;
    ban_history.ban_expiration_timestamp = Date.now() + ((24 * 60 * 60 * 1000) * (ban_count * ban_count)); //ban_count 의 제곱 * 1일 만큼 제제(초단위)

    db_manager.updateBanHistory(ban_history.user_id, ban_history.ban_count, ban_history.ban_expiration_timestamp);

    const expiration_date = new Date(ban_history.ban_expiration_timestamp).toLocaleString();
    result_message = `제제 완료\nUSER_ID: ${ban_history.user_id}\nBAN_COUNT: ${ban_history.ban_count}\n벤 만료일자: ${expiration_date}`;
  }
  else if(process_type === REPORT_PROCESSED_RESULT_TYPE.DENY)
  {
    result_message = `해당 신고 사항을 반려처리 했습니다.`;
  }

  interaction.user.send({content: `\`\`\`${result_message}\`\`\``, ephemeral: true});
  interaction.message.delete();

  db_manager.updateChatInfoResult(chat_id, process_type);
  const target_report_log_list = await db_manager.deleteReportedLog(chat_id);

  if(process_type !== REPORT_PROCESSED_RESULT_TYPE.BANNED || target_report_log_list.rowCount === 0)
  {
    return;
  }

  for(const target_report_log of target_report_log_list.rows)
  {
    const reporter_id = target_report_log.reporter_id;
    const user = await bot_client.users.fetch(reporter_id);

    if (user) 
    {
      user.send(`\`\`\`🔹 감사합니다. 신고하신 유저에 대한 제제가 완료됐습니다.\n\n🔸 신고하신 내용:\n${target_report_log.report_detail}\`\`\``);
    }

    //TODO 나중에 중복 전송 방지 추가
  }
};

const isAdmin = (user_id) =>
{
  return PRIVATE_CONFIG.ADMIN_ID === user_id;
};

const checkReportEvent = (interaction) =>
{
  if(isReportChatButton(interaction))
  {
    requestReportChatModal(interaction);
    return true;
  }
    
  if(isReportChatModal(interaction))
  {
    submitReportChatModal(interaction);
    return true;
  }

  if(isReportManageCommand(interaction))
  {
    sendReportLog(interaction);
    return true;
  }

  if(isReportProcessButton(interaction))
  {
    processReportLog(interaction);
    return true;
  }
};

module.exports = { initialize, checkReportEvent };
