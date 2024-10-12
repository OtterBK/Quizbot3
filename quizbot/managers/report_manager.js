const cloneDeep = require("lodash/cloneDeep.js");

const logger = require('../../utility/logger.js')('ReportManager');
const db_manager = require('./db_manager.js');
const {
  modal_chat_report,
} = require("../quiz_ui/components.js");

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

const getChatInfo = (chat_id) =>
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
];

const REPORT_INFO_COLUMN =
[
  "chat_id",
  "reporter_id",
  "report_detail",
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

const submitReportChatModal = (interaction) =>
{
  interaction.explicit_replied = true;
    
  const chat_id = getChatId(interaction.customId);
  const content = getChatCacheContent(chat_id);
  const chat_info = getChatInfo(chat_id);
  if(chat_info === undefined || content === undefined)
  {
    interaction.reply({content: `\`\`\`🔸 신고에 실패했습니다. (No Cache Content)\n다시 시도해보세요.\`\`\``});
    return;
  }

  const sender_id = chat_info.user_id;
  const reporter_id = interaction.user.id;
  const report_detail = interaction.fields.getTextInputValue('txt_input_report_detail');

  // const chat_report_info = {
  //     chat_id: chat_id,
  //     content: content,
  //     sender_id: chat_info.user_id,
  //     reporter_id: interaction.user.id,
  //     report_detail: report_detail,
  // }

  interaction.reply({content: `\`\`\`🔸 신고가 접수되었습니다. 감사합니다.\`\`\``});

  db_manager.insertChatInfo(chat_info_key_fields, [chat_id, content, sender_id, ]);
  db_manager.insertReportInfo(report_info_key_fields, [chat_id, reporter_id, report_detail]);
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
};

module.exports = { checkReportEvent };
