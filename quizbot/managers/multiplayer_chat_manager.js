const ipc_manager = require('./ipc_manager.js');
const { CLIENT_SIGNAL, SERVER_SIGNAL } = require('./multiplayer_signal.js');
const { getQuizSession } = require('../quiz_system/quiz_system.js');

const sendMultiplayerChat = (interaction) =>
{
  interaction.explicit_replied = true;

  if(!interaction.guild)
  {
    interaction.reply({content: `\`\`\`퀴즈 진행 중인 서버에서만 사용 가능합니다.\`\`\``, ephemeral: true});
    return;
  }

  const quiz_session = getQuizSession(interaction.guild.id);
  if(quiz_session === undefined || quiz_session.isMultiplayerSession() === false)
  {
    interaction.reply({content: `\`\`\`멀티플레이 퀴즈에 참가 중이지 않습니다.\`\`\``, ephemeral: true});
    return;
  }

  const channel = quiz_session.channel;
  if(channel?.id !== interaction.channel.id)
  {
    interaction.reply({content: `\`\`\`퀴즈가 진행 중인 채팅 채널에서만 사용 가능합니다.\`\`\``, ephemeral: true});
    return;
  }

  const message = interaction.options.getString('메시지') ?? '';
  if(message === undefined || message === '')
  {
    interaction.reply({content: `\`\`\`메시지 값은 필수입니다.\`\`\``, ephemeral: true});
    return;
  }

  const user = interaction.user; //맴버로 할까... 유저로 할까... -> 유저다!
  const chat_message = `\`\`\`💭 [${interaction.guild.name}] ${user.displayName}: ${message}\`\`\``;

  quiz_session.sendRequestChat(user.id, chat_message);
  interaction.reply({ content: `\`\`\`메시지를 전송을 요청하였습니다.\`\`\`` , ephemeral: true});
};

module.exports = { sendMultiplayerChat };